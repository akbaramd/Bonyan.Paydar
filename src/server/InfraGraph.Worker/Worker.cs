using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;
using InfraGraph.Infrastructure.Persistence;
using InfraGraph.Modules.Discovery;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InfraGraph.Worker;

/// <summary>
/// Single elected worker. Only explicitly approved, private IPv4 targets are probed.
/// No network traversal, credential discovery, device exploitation or scope expansion.
/// </summary>
public sealed class Worker(
    IServiceScopeFactory scopes, IConfiguration configuration, ILogger<Worker> log) : BackgroundService
{
    private static readonly int[] ProbePorts = [22, 80, 443, 445, 3389];
    private const int BatchSize = 16;

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        var connectionString = configuration.GetConnectionString("ControlPlane");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            log.LogWarning("Active network discovery disabled: PostgreSQL runtime credentials missing.");
            return;
        }
        while (!stop.IsCancellationRequested)
        {
            try
            {
                // An advisory lock prevents multiple replicas from probing the same scope.
                await using var lease = new NpgsqlConnection(connectionString);
                await lease.OpenAsync(stop);
                await using var lockCommand = new NpgsqlCommand(
                    "SELECT pg_try_advisory_lock(174813, 2026)", lease);
                if (await lockCommand.ExecuteScalarAsync(stop) is not true)
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), stop);
                    continue;
                }
                log.LogInformation("Active discovery worker acquired PostgreSQL lease.");
                await RunQueueAsync(stop);
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                log.LogError(ex, "Discovery worker database/processing failure; retrying.");
                await Task.Delay(TimeSpan.FromSeconds(4), stop);
            }
        }
    }

    private async Task RunQueueAsync(CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            Guid? jobId;
            await using (var scope = scopes.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
                var jobs = await db.NetworkScanJobs.AsNoTracking()
                    .Where(x => x.Status == "pending" || x.Status == "running" ||
                                x.Status == "cancelling")
                    .OrderBy(x => x.RequestedAtUtc).Take(1024).ToArrayAsync(stop);
                var now = DateTimeOffset.UtcNow;
                jobId = jobs.Where(x => x.Status != "running" ||
                        x.LastSweepAtUtc is null ||
                        x.LastSweepAtUtc.Value <= now.AddSeconds(-x.IntervalSeconds))
                    .OrderBy(x => x.Status == "cancelling" ? 0 : x.Status == "pending" ? 1 : 2)
                    .ThenBy(x => x.LastSweepAtUtc ?? x.RequestedAtUtc)
                    .Select(x => (Guid?)x.Id).FirstOrDefault();
            }
            if (jobId is null)
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stop);
                continue;
            }
            try { await RunJobAsync(jobId.Value, stop); }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                log.LogError(ex, "Discovery job {JobId} failed.", jobId);
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
                var job = await db.NetworkScanJobs.FindAsync([jobId.Value], stop);
                if (job is not null && job.Status is "pending" or "running")
                {
                    job.Status = "failed";
                    job.CompletedAtUtc = DateTimeOffset.UtcNow;
                    job.Error = "Worker failure. Review server diagnostics.";
                    Emit(db, job, "failed");
                    await db.SaveChangesAsync(stop);
                }
            }
        }
    }

    private async Task RunJobAsync(Guid id, CancellationToken stop)
    {
        IReadOnlyList<IPAddress> targets;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            var job = await db.NetworkScanJobs.SingleAsync(x => x.Id == id, stop);
            if (job.Status == "cancelling") { await CancelAsync(db, job, stop); return; }
            if (job.Status is not ("pending" or "running")) return;
            // Revalidate persisted scope before any network activity.
            targets = Ipv4ScanPlanner.Plan(JsonSerializer.Deserialize<string[]>(job.Cidrs)!);
            if (job.TargetCount != targets.Count)
                throw new InvalidOperationException("Persisted scope/target count mismatch.");
            if (job.Status == "pending")
            {
                job.Status = "running";
                job.StartedAtUtc = DateTimeOffset.UtcNow;
                Emit(db, job, "started");
                await db.SaveChangesAsync(stop);
            }
        }

        // One bounded sweep per dequeue: another site must never be starved by
        // a continuously monitored site.
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            var job = await db.NetworkScanJobs.SingleAsync(x => x.Id == id, stop);
            if (job.Status == "cancelling") { await CancelAsync(db, job, stop); return; }
            if (job.Status != "running") return;
            var known = await db.NetworkScanHosts.Where(x => x.SiteId == job.SiteId)
                .ToDictionaryAsync(x => x.Address, StringComparer.Ordinal, stop);
            job.ProbedCount = 0;
            job.ResponsiveCount = 0;
            await db.SaveChangesAsync(stop);

            for (var offset = 0; offset < targets.Count; offset += BatchSize)
            {
                stop.ThrowIfCancellationRequested();
                // Refresh the operator-controlled cancellation state before every batch.
                await db.Entry(job).ReloadAsync(stop);
                if (job.Status == "cancelling") { await CancelAsync(db, job, stop); return; }
                if (job.Status != "running") return;

                var batch = targets.Skip(offset).Take(BatchSize).ToArray();
                var results = await Task.WhenAll(batch.Select(ip => ProbeAsync(ip, stop)));
                var now = DateTimeOffset.UtcNow;
                foreach (var probe in results)
                {
                    job.ProbedCount++;
                    if (probe.Responded) job.ResponsiveCount++;
                    if (known.TryGetValue(probe.Address, out var old))
                    {
                        var outcome = ProbeHealth.Observe(old.Status,
                            old.ConsecutiveMisses, probe.Responded);
                        old.Status = outcome.Status;
                        old.ConsecutiveMisses = outcome.ConsecutiveMisses;
                        old.IcmpResponded = probe.Icmp;
                        old.TcpPorts = string.Join(",", probe.OpenPorts);
                        old.LastProbedAtUtc = now;
                        old.LastJobId = id;
                        if (probe.Responded) old.LastSeenAtUtc = now;
                        if (outcome.EventKind is not null)
                            Emit(db, job, outcome.EventKind, old.Address, old.Status);
                    }
                    else if (probe.Responded)
                    {
                        var host = new NetworkScanHostRecord {
                            Id = Guid.NewGuid(), SiteId = job.SiteId, Address = probe.Address,
                            Status = "responsive", ConsecutiveMisses = 0,
                            IcmpResponded = probe.Icmp,
                            TcpPorts = string.Join(",", probe.OpenPorts),
                            LastProbedAtUtc = now, LastSeenAtUtc = now, LastJobId = id
                        };
                        db.NetworkScanHosts.Add(host);
                        known.Add(host.Address, host);
                        Emit(db, job, "host-discovered", host.Address, host.Status);
                    }
                    // An unresponsive address with no prior positive evidence is not an asset.
                }
                Emit(db, job, "progress");
                await db.SaveChangesAsync(stop);
            }
            job.Cycle++;
            job.LastSweepAtUtc = DateTimeOffset.UtcNow;
            Emit(db, job, "sweep");
            await db.SaveChangesAsync(stop);
            // Next sweep is re-queued only after the configured interval.
        }
    }

    private static async Task CancelAsync(InfraGraphDbContext db, NetworkScanJobRecord job,
        CancellationToken token)
    {
        job.Status = "cancelled";
        job.CompletedAtUtc = DateTimeOffset.UtcNow;
        Emit(db, job, "cancelled");
        await db.SaveChangesAsync(token);
    }

    private static void Emit(InfraGraphDbContext db, NetworkScanJobRecord job,
        string kind, string? address = null, string? state = null)
    {
        db.NetworkScanEvents.Add(new NetworkScanEventRecord {
            SiteId = job.SiteId, JobId = job.Id, Kind = kind,
            Address = address, Status = state, ProbedCount = job.ProbedCount,
            TargetCount = job.TargetCount, AtUtc = DateTimeOffset.UtcNow
        });
    }

    private sealed record ProbeResult(string Address, bool Icmp, int[] OpenPorts)
    {
        public bool Responded => Icmp || OpenPorts.Length != 0;
    }

    private static async Task<ProbeResult> ProbeAsync(IPAddress ip, CancellationToken token)
    {
        // The outer queue admits at most 16 hosts at a time. Within each host,
        // ICMP and the fixed five TCP ports run concurrently, capping in-flight
        // sockets at 80 rather than performing 5 serial timeout waits per host.
        token.ThrowIfCancellationRequested();
        var icmp = TryIcmpAsync(ip, token);
        var tcp = ProbePorts.Select(port => TryTcpAsync(ip, port, token)).ToArray();
        await Task.WhenAll(tcp.Cast<Task>().Append(icmp));
        var open = ProbePorts.Where((_, index) => tcp[index].Result).ToArray();
        return new ProbeResult(ip.ToString(), icmp.Result, open);
    }

    private static async Task<bool> TryIcmpAsync(IPAddress ip, CancellationToken token)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(ip, 650)
                .WaitAsync(TimeSpan.FromMilliseconds(750), token);
            return reply.Status == IPStatus.Success;
        }
        catch (PingException) { return false; }
        catch (PlatformNotSupportedException) { return false; }
        catch (SocketException) { return false; }
        catch (TimeoutException) { return false; }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { return false; }
    }

    private static async Task<bool> TryTcpAsync(IPAddress ip, int port, CancellationToken token)
    {
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork,
                SocketType.Stream, ProtocolType.Tcp);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
            timeout.CancelAfter(TimeSpan.FromMilliseconds(350));
            await socket.ConnectAsync(ip, port, timeout.Token);
            return socket.Connected;
        }
        catch (SocketException) { return false; }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { return false; }
    }
}
