using System.Net;
using System.Text.Json;

namespace InfraGraph.Modules.Discovery;

/// <summary>
/// A subnet is a logical IPv4 membership group, NEVER an observed physical
/// switch, cable, port, LLDP neighbor, or verified forwarding path.
/// Uses only already-approved scan-job CIDRs and already-seen host addresses;
/// does not create or transmit a single packet.
/// </summary>
public static class LogicalSubnetMembership
{
    public sealed record Segment(string Id, string Cidr, string[] HostIds);

    public static Segment[] Build(IEnumerable<string> persistedJobCidrs,
        IEnumerable<string> observedAddresses)
    {
        ArgumentNullException.ThrowIfNull(persistedJobCidrs);
        ArgumentNullException.ThrowIfNull(observedAddresses);
        var known = observedAddresses
            .Where(address => IPAddress.TryParse(address, out var ip) &&
                ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
                address == ip.ToString())
            .ToHashSet(StringComparer.Ordinal);
        var cidrs = new HashSet<string>(StringComparer.Ordinal);
        foreach (var json in persistedJobCidrs.Take(20))
        {
            string[]? scopes;
            try { scopes = JsonSerializer.Deserialize<string[]>(json); }
            catch (JsonException) { continue; }
            if (scopes is null) continue;
            foreach (var cidr in scopes.Take(Ipv4ScanPlanner.MaxCidrs))
                if (!string.IsNullOrWhiteSpace(cidr)) cidrs.Add(cidr);
        }
        var result = new List<Segment>();
        foreach (var cidr in cidrs.OrderBy(x => x, StringComparer.Ordinal).Take(64))
        {
            IReadOnlyList<IPAddress> scope;
            try { scope = Ipv4ScanPlanner.Plan([cidr]); }
            catch (ArgumentException) { continue; }
            var matches = scope.Select(x => x.ToString()).Where(known.Contains).ToArray();
            if (matches.Length == 0) continue;
            result.Add(new Segment($"subnet:{cidr}", cidr, matches));
        }
        return result.ToArray();
    }
}
