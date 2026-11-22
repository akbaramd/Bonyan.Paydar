using System.Text.Json;

namespace InfraGraph.Modules.Discovery;

/// <summary>
/// Fail-closed operator approval for read-only SNMPv3 management endpoints.
/// It is deliberately independent of sockets, credentials and persistence.
/// </summary>
public static class SnmpTargetPolicy
{
    public const int MaxTargets = 16;

    public sealed record Target(string SiteId, string Address, bool Approved);
    public sealed record ActiveScope(string SiteId, string Cidrs, string Status,
        DateTimeOffset? StartedAtUtc, DateTimeOffset? LastSweepAtUtc, int IntervalSeconds);

    private sealed record TargetFile(Target[] Targets);

    public static Target[] Parse(string json)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        if (json.Length > 16384) throw new ArgumentException("SNMP target configuration exceeds size limit.");
        var settings = JsonSerializer.Deserialize<TargetFile>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        if (settings?.Targets is not { Length: > 0 and <= MaxTargets })
            throw new ArgumentException("Between 1 and 16 approved SNMP targets are required.");
        var duplicates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var target in settings.Targets)
        {
            if (!target.Approved ||
                string.IsNullOrWhiteSpace(target.SiteId) ||
                target.SiteId.Length > 120 || target.SiteId.Any(char.IsControl) ||
                string.IsNullOrWhiteSpace(target.Address) ||
                target.Address.Length > 15)
                throw new ArgumentException("Site, canonical private IPv4, and explicit approval are mandatory.");
            // /32 is a single authorized IPv4 endpoint: the existing scope
            // planner rejects DNS names, public IPs, noncanonical notation etc.
            _ = Ipv4ScanPlanner.Plan([$"{target.Address}/32"]);
            if (!duplicates.Add(target.SiteId + "|" + target.Address))
                throw new ArgumentException("Duplicate SNMP management endpoint.");
        }
        return settings.Targets;
    }

    public static bool IsApprovedByRunningJob(
        Target target, IEnumerable<ActiveScope> scopes, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(target);
        ArgumentNullException.ThrowIfNull(scopes);
        if (!target.Approved || string.IsNullOrWhiteSpace(target.SiteId))
            return false;
        // The target must remain valid even when callers bypass the JSON parser.
        try
        {
            var address = Ipv4ScanPlanner.Plan([$"{target.Address}/32"]);
            if (address.Count != 1 ||
                !string.Equals(address[0].ToString(), target.Address, StringComparison.Ordinal))
                return false;
        }
        catch (ArgumentException) { return false; }

        foreach (var scope in scopes.Where(x => x.SiteId == target.SiteId &&
            x.Status == "running"))
        {
            if (scope.IntervalSeconds is < 30 or > 3600 ||
                scope.StartedAtUtc is not { } started ||
                started > now)
                continue;
            var latest = scope.LastSweepAtUtc ?? started;
            if (latest < started || latest > now ||
                now - latest > TimeSpan.FromSeconds(scope.IntervalSeconds) +
                    TimeSpan.FromMinutes(5))
                continue; // A crashed/stale worker cannot authorize indefinite SNMP traffic.
            try
            {
                var cidrs = JsonSerializer.Deserialize<string[]>(scope.Cidrs);
                if (cidrs is null) continue;
                if (Ipv4ScanPlanner.Plan(cidrs).Any(x =>
                    string.Equals(x.ToString(), target.Address, StringComparison.Ordinal)))
                    return true;
            }
            catch (Exception ex) when (ex is ArgumentException or JsonException) { }
        }
        return false;
    }
}
