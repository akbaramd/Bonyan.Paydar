using System.Net;
using System.Net.NetworkInformation;

namespace InfraGraph.ControlPlane.Diagnostics;

public sealed record DiagnosticStep(int Ttl, string Status, string? From, long? RttMs);
public sealed record DiagnosticResult(
    string Kind, string Address, string Source, DateTimeOffset ObservedAtUtc,
    IReadOnlyList<DiagnosticStep> Steps, bool ReachedDestination, int Responses, int Attempts,
    double? AverageRttMs, string Interpretation);

public interface INetworkDiagnosticProbe
{
    Task<DiagnosticResult> RunAsync(IPAddress target, string kind, CancellationToken ct);
}

/// <summary>
/// Bounded ICMP from the ControlPlane host. No shell execution, DNS lookup, port scans,
/// destination redirects or arbitrary user-selected hosts. HTTP endpoint authorizes IP first.
/// </summary>
public sealed class NetworkDiagnosticProbe(TimeProvider clock) : INetworkDiagnosticProbe
{
    public async Task<DiagnosticResult> RunAsync(IPAddress target, string kind, CancellationToken ct)
    {
        if (kind is not ("ping" or "traceroute"))
            throw new ArgumentOutOfRangeException(nameof(kind));
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(12));
        using var ping = new Ping();
        var steps = new List<DiagnosticStep>(kind == "ping" ? 3 : 12);
        var reached = false;
        var count = kind == "ping" ? 3 : 12;
        for (var ttl = 1; ttl <= count; ttl++)
        {
            deadline.Token.ThrowIfCancellationRequested();
            var hopTtl = kind == "ping" ? 64 : ttl;
            try
            {
                var result = await ping.SendPingAsync(target, TimeSpan.FromMilliseconds(750), new byte[32],
                    new PingOptions(hopTtl, true), deadline.Token);
                var status = result.Status switch
                {
                    IPStatus.Success => "reply",
                    IPStatus.TtlExpired => "ttl-expired",
                    IPStatus.TimedOut => "timeout",
                    IPStatus.DestinationHostUnreachable or IPStatus.DestinationNetworkUnreachable
                        => "unreachable",
                    _ => "icmp-error"
                };
                steps.Add(new DiagnosticStep(ttl, status,
                    result.Address?.ToString(), result.Status is IPStatus.Success or IPStatus.TtlExpired
                        ? result.RoundtripTime : null));
                if (kind == "traceroute" && result.Status == IPStatus.Success)
                {
                    reached = true;
                    break;
                }
            }
            catch (PingException)
            {
                steps.Add(new DiagnosticStep(ttl, "icmp-error", null, null));
            }
        }

        if (kind == "ping") reached = steps.Any(s => s.Status == "reply");
        var replies = steps.Where(s => s.Status == "reply").ToArray();
        return new DiagnosticResult(kind, target.ToString(), "controlplane", clock.GetUtcNow(),
            steps, reached, replies.Length, steps.Count,
            replies.Length > 0 ? Math.Round(replies.Average(s => (double)s.RttMs!.Value), 1) : null,
            kind == "ping"
                ? "ICMP response only; no reply is not proof that the device or a link is down."
                : "Route from the ControlPlane host, not the browser. Layer-2 switches are invisible to traceroute; timeouts do not prove a broken path.");
    }
}