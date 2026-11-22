using System.Net;
using InfraGraph.Infrastructure.Persistence;
using InfraGraph.Modules.Discovery;
using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InfraGraph.Worker;

/// <summary>
/// Opt-in, read-only SNMPv3/authPriv evidence collector. This does not discover
/// new scan scopes, guess passwords, use SNMP SET or traverse LLDP neighbors.
/// Credential material is read from environment only, never the database.
/// </summary>
public sealed class SnmpV3EvidenceWorker(
    IConfiguration configuration, IServiceScopeFactory scopes,
    ILogger<SnmpV3EvidenceWorker> log) : BackgroundService
{
    private const int MaxRowsPerSubtree = 4096;
    private const int MaxRowsPerSnapshot = 12000;

    // Reject excess SNMP rows *while* the library walks a device, not after it
    // has potentially allocated an unbounded response list.
    private sealed class BoundedVariables : System.Collections.ObjectModel.Collection<Variable>
    {
        protected override void InsertItem(int index, Variable item)
        {
            if (Count >= MaxRowsPerSubtree)
                throw new InvalidDataException("SNMP subtree budget exceeded.");
            base.InsertItem(index, item);
        }
    }
    private static readonly string[] Roots = [
        "1.3.6.1.2.1.1",               // SNMPv2-MIB system
        "1.0.8802.1.1.2.1.3",           // LLDP local chassis and ports
        "1.0.8802.1.1.2.1.4.1.1",       // LLDP remote neighbors
        "1.3.6.1.2.1.17.4.3.1.2",      // BRIDGE-MIB forwarding database
        "1.3.6.1.2.1.17.1.4.1.2",      // bridge port -> ifIndex
        "1.3.6.1.2.1.31.1.1.1.1",      // IF-MIB ifName
    ];

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        var configFile = configuration["INFRAGRAPH_SNMP_TARGETS_PATH"];
        if (string.IsNullOrWhiteSpace(configFile) || !File.Exists(configFile))
        {
            log.LogInformation("SNMPv3 collection disabled: no explicit target inventory.");
            return;
        }
        var user = configuration["INFRAGRAPH_SNMPV3_USERNAME"];
        var authPhrase = configuration["INFRAGRAPH_SNMPV3_AUTH_PASSPHRASE"];
        var privPhrase = configuration["INFRAGRAPH_SNMPV3_PRIV_PASSPHRASE"];
        if (string.IsNullOrWhiteSpace(user) || user.Length > 64 ||
            authPhrase is not { Length: >= 8 and <= 128 } ||
            privPhrase is not { Length: >= 8 and <= 128 })
        {
            log.LogWarning("SNMPv3 collection disabled: authPriv credentials missing or invalid.");
            return;
        }
        var connection = configuration.GetConnectionString("ControlPlane");
        if (string.IsNullOrWhiteSpace(connection)) return;

        // Separate election domain from the ICMP/TCP worker.
        while (!stop.IsCancellationRequested)
        {
            try
            {
                await using var lease = new NpgsqlConnection(connection);
                await lease.OpenAsync(stop);
                await using var cmd = new NpgsqlCommand("SELECT pg_try_advisory_lock(174813, 2027)", lease);
                if (await cmd.ExecuteScalarAsync(stop) is true)
                {
                    try
                    {
                    var file = new FileInfo(configFile);
                    if (file.Length is < 10 or > 16384)
                        throw new InvalidDataException("Invalid SNMP targets file size.");
                    var targets = SnmpTargetPolicy.Parse(await File.ReadAllTextAsync(configFile, stop));
                    foreach (var target in targets)
                    {
                        stop.ThrowIfCancellationRequested();
                        try
                        {
                            if (!await InApprovedScopeAsync(target, stop)) continue;
                            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop);
                            timeout.CancelAfter(TimeSpan.FromSeconds(24));
                            var snapshot = await ReadSnapshotAsync(target.Address,
                                user, authPhrase, privPhrase, timeout.Token);
                            // Recheck after the network call: an operator may
                            // cancel the site job while the device responds.
                            if (!await InApprovedScopeAsync(target, stop)) continue;
                            await StoreSnapshotAsync(target, snapshot, stop);
                            log.LogInformation("SNMPv3 evidence updated for approved site {Site} endpoint {Address}.",
                                target.SiteId, target.Address);
                        }
                        catch (OperationCanceledException) when (stop.IsCancellationRequested) { throw; }
                        catch (Exception)
                        {
                            // A rejected SNMPv3 authentication or unsupported MIB does not
                            // establish that a host is down. Do not log secret-bearing errors.
                            log.LogWarning("SNMPv3 endpoint {Address} unavailable; no topology evidence asserted.",
                                target.Address);
                        }
                    }
                    }
                    finally
                    {
                        // PostgreSQL advisory locks are SESSION-scoped, not
                        // transaction-scoped. Always release before returning
                        // this Npgsql connection to its pool.
                        try
                        {
                            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                            await using var release = new NpgsqlCommand(
                                "SELECT pg_advisory_unlock(174813, 2027)", lease);
                            _ = await release.ExecuteScalarAsync(deadline.Token);
                        }
                        catch (Exception)
                        {
                            log.LogWarning("SNMP lease release unavailable; closing connection.");
                            NpgsqlConnection.ClearPool(lease);
                        }
                    }
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception)
            {
                log.LogWarning("SNMPv3 evidence loop unavailable; no network status inferred.");
            }
            await Task.Delay(TimeSpan.FromMinutes(5), stop);
        }
    }

    private async Task<bool> InApprovedScopeAsync(SnmpTargetPolicy.Target target, CancellationToken token)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
        // Cancelled, failed and historical jobs do not authorize ongoing
        // management traffic, even if they previously covered this address.
        var activeJobs = await db.NetworkScanJobs.AsNoTracking()
            .Where(x => x.SiteId == target.SiteId && x.Status == "running")
            .OrderByDescending(x => x.StartedAtUtc)
            .Select(x => new {
                x.SiteId, x.Cidrs, x.Status, x.StartedAtUtc,
                x.LastSweepAtUtc, x.IntervalSeconds
            }).Take(16).ToArrayAsync(token);
        return SnmpTargetPolicy.IsApprovedByRunningJob(target,
            activeJobs.Select(x => new SnmpTargetPolicy.ActiveScope(
                x.SiteId, x.Cidrs, x.Status, x.StartedAtUtc,
                x.LastSweepAtUtc, x.IntervalSeconds)), DateTimeOffset.UtcNow);
    }

    private static async Task<SnmpTopologyParser.Snapshot> ReadSnapshotAsync(
        string address, string username, string authPhrase, string privPhrase,
        CancellationToken cancellationToken)
    {
        var endpoint = new IPEndPoint(IPAddress.Parse(address), 161);
        var auth = new SHA256AuthenticationProvider(new OctetString(authPhrase));
        var privacy = new AESPrivacyProvider(new OctetString(privPhrase), auth);
        var identity = new OctetString(username);
        var context = new OctetString("");
        var discovery = Messenger.GetNextDiscovery(SnmpType.GetBulkRequestPdu);
        var report = await discovery.GetResponseAsync(endpoint)
            .WaitAsync(TimeSpan.FromSeconds(3), cancellationToken);
        var results = new List<SnmpTopologyParser.Binding>();
        for (var i = 0; i < Roots.Length; i++)
        {
            var variables = new BoundedVariables();
            try
            {
                await Messenger.BulkWalkAsync(VersionCode.V3, endpoint, identity, context,
                    new ObjectIdentifier(Roots[i]), variables, 8, WalkMode.WithinSubtree,
                    privacy, report, cancellationToken);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex) when (i > 0 && ex is not InvalidDataException)
            {
                continue; // An unsupported optional MIB is not a device failure.
            }
            if (results.Count + variables.Count > MaxRowsPerSnapshot)
                throw new InvalidDataException("SNMP snapshot row budget exceeded.");
            foreach (var variable in variables)
            {
                var oid = variable.Id.ToString();
                var binaryChassis = oid == "1.0.8802.1.1.2.1.3.2.0" ||
                    oid.StartsWith("1.0.8802.1.1.2.1.4.1.1.5.", StringComparison.Ordinal);
                var portIdentifier = oid.StartsWith("1.0.8802.1.1.2.1.3.7.1.3.", StringComparison.Ordinal) ||
                    oid.StartsWith("1.0.8802.1.1.2.1.4.1.1.7.", StringComparison.Ordinal);
                var value = variable.Data is OctetString octets && (binaryChassis || portIdentifier)
                    ? (portIdentifier ? "0x" : "") + Convert.ToHexString(octets.GetRaw())
                    : variable.Data.ToString() ?? "";
                results.Add(new SnmpTopologyParser.Binding(oid, value));
            }
        }
        // GET-BULK starts *after* the requested OID. Walking a scalar as a
        // subtree cannot return the scalar itself (ipForwarding.0).
        // Query it explicitly with authenticated/encrypted SNMPv3 GET.
        const string forwardingOid = "1.3.6.1.2.1.4.1.0";
        try
        {
            var request = new GetRequestMessage(VersionCode.V3, Messenger.NextMessageId,
                Messenger.NextRequestId, identity, context,
                new List<Variable> { new(new ObjectIdentifier(forwardingOid)) },
                privacy, Messenger.MaxMessageSize, report);
            var reply = await request.GetResponseAsync(endpoint)
                .WaitAsync(TimeSpan.FromSeconds(3), cancellationToken);
            if (reply.Pdu().ErrorStatus.ToInt32() == 0)
            {
                foreach (var variable in reply.Pdu().Variables)
                {
                    var value = variable.Data.ToString();
                    if (variable.Id.ToString() == forwardingOid && value is ("1" or "2"))
                        results.Add(new SnmpTopologyParser.Binding(forwardingOid, value));
                }
            }
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception) { /* Optional IP-MIB evidence unavailable: keep role unknown. */ }

        if (!results.Any(x => x.Oid == "1.3.6.1.2.1.1.1.0" ||
            x.Oid == "1.3.6.1.2.1.1.5.0"))
            throw new InvalidDataException("No authenticated system identity in SNMP response.");
        return SnmpTopologyParser.Parse(address, results);
    }

    private async Task StoreSnapshotAsync(SnmpTargetPolicy.Target target, SnmpTopologyParser.Snapshot evidence,
        CancellationToken token)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
        var now = DateTimeOffset.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        var stored = await db.ManagedNetworkDevices.SingleOrDefaultAsync(
            x => x.SiteId == target.SiteId && x.Address == target.Address, token);
        if (stored is null)
        {
            stored = new ManagedNetworkDeviceRecord { SiteId = target.SiteId, Address = target.Address };
            db.ManagedNetworkDevices.Add(stored);
        }
        stored.SystemName = evidence.SystemName;
        stored.SystemDescription = evidence.Description;
        stored.SystemObjectId = evidence.SystemObjectId;
        stored.Kind = evidence.Kind;
        stored.ChassisId = evidence.ChassisId;
        stored.LastSeenAtUtc = now;
        var obsoleteNeighbors = await db.LldpNeighbors.Where(x =>
            x.SiteId == target.SiteId && x.LocalAddress == target.Address).ToArrayAsync(token);
        var obsoleteFdb = await db.FdbLearnedMacs.Where(x =>
            x.SiteId == target.SiteId && x.BridgeAddress == target.Address).ToArrayAsync(token);
        db.LldpNeighbors.RemoveRange(obsoleteNeighbors);
        db.FdbLearnedMacs.RemoveRange(obsoleteFdb);
        foreach (var peer in evidence.Neighbors)
            db.LldpNeighbors.Add(new LldpNeighborRecord {
                Id = Guid.NewGuid(), SiteId = target.SiteId, LocalAddress = target.Address,
                LocalPort = peer.LocalPort, RemotePort = peer.RemotePort,
                RemoteChassisId = peer.RemoteChassisId,
                RemoteSystemName = peer.RemoteSystemName, ObservedAtUtc = now
            });
        foreach (var mac in evidence.LearnedMacs)
            db.FdbLearnedMacs.Add(new FdbLearnedMacRecord {
                Id = Guid.NewGuid(), SiteId = target.SiteId, BridgeAddress = target.Address,
                MacAddress = mac.Address, LearnedPort = mac.Port, ObservedAtUtc = now
            });
        // Existing approved job outbox provides site-group SignalR refresh; no
        // traffic is generated by the broadcaster.
        var relatedJob = await db.NetworkScanJobs.AsNoTracking()
            .Where(x => x.SiteId == target.SiteId)
            .OrderByDescending(x => x.RequestedAtUtc).FirstOrDefaultAsync(token);
        if (relatedJob is not null)
            db.NetworkScanEvents.Add(new NetworkScanEventRecord {
                SiteId = target.SiteId, JobId = relatedJob.Id,
                Kind = "topology-updated", Address = target.Address,
                ProbedCount = relatedJob.ProbedCount, TargetCount = relatedJob.TargetCount,
                AtUtc = now
            });
        await db.SaveChangesAsync(token);
        await transaction.CommitAsync(token);
    }
}