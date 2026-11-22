namespace InfraGraph.Modules.Discovery;

/// <summary>
/// Converts fresh, authenticated LLDP port evidence into topology adjacency.
/// Chassis IDs are resolved to IPs only when there is exactly one fresh
/// SNMPv3 identity with that chassis ID within the same site. This prevents
/// false physical links caused by duplicate MACs or unreliable sysNames.
/// </summary>
public static class SnmpTopologyReconciler
{
    public sealed record Device(string Address, string? ChassisId, string? SystemName,
        string Kind, DateTimeOffset LastSeenAtUtc);
    public sealed record Neighbor(Guid Id, string LocalAddress, string LocalPort,
        string RemoteChassisId, string RemotePort, string? RemoteSystemName,
        DateTimeOffset ObservedAtUtc);
    public sealed record Node(string Id, string? SystemName, string Kind);
    // LLDP proves a reported adjacency, not an independently inspected cable.
    // A reverse observation corroborates the two endpoint/port identities.
    public sealed record Link(string Id, string Source, string Target, string SourcePort,
        string TargetPort, Guid[] EvidenceIds, string Corroboration);
    public sealed record Result(Node[] Nodes, Link[] Links);

    public static Result Build(IEnumerable<Device> devices, IEnumerable<Neighbor> neighbors,
        DateTimeOffset now)
    {
        var freshAfter = now.AddMinutes(-20);
        var fresh = devices.Where(d => d.LastSeenAtUtc >= freshAfter && d.LastSeenAtUtc <= now)
            .Take(129).ToArray();
        var matchable = fresh.Where(d => !string.IsNullOrEmpty(d.ChassisId))
            .GroupBy(d => d.ChassisId!, StringComparer.Ordinal)
            .Where(group => group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.Single().Address, StringComparer.Ordinal);
        var resultNodes = fresh.Select(d => new Node(d.Address, d.SystemName, d.Kind))
            .ToDictionary(d => d.Id, StringComparer.Ordinal);
        var rows = new List<(string Source, string Target, string SourcePort, string TargetPort, Guid Id)>();
        foreach (var x in neighbors.Where(x => x.ObservedAtUtc >= freshAfter &&
            x.ObservedAtUtc <= now).Take(1025))
        {
            if (x.Id == Guid.Empty || x.LocalAddress is not { Length: > 0 and <= 15 } ||
                x.RemoteChassisId is not { Length: >= 2 and <= 64 } ||
                x.LocalPort is not { Length: > 0 and <= 80 } ||
                x.RemotePort is not { Length: > 0 and <= 80 } ||
                !resultNodes.ContainsKey(x.LocalAddress))
                continue;
            var target = matchable.GetValueOrDefault(x.RemoteChassisId);
            if (target is null)
            {
                target = "lldp:" + x.RemoteChassisId;
                if (!resultNodes.ContainsKey(target))
                    resultNodes[target] = new Node(target, x.RemoteSystemName, "unknown");
            }
            if (target == x.LocalAddress) continue;
            rows.Add((x.LocalAddress, target, x.LocalPort, x.RemotePort, x.Id));
        }
        // Index both ends: a port implicated in multiple distinct LLDP links
        // is not evidence of a unique direct cable (aggregation, sharing,
        // inconsistent port labels or stale MIB data are all possible).
        var conflictingEndpoints = rows
            .SelectMany(x => new[] {
                (Device: x.Source, Port: x.SourcePort,
                    Link: Canonical(x.Source, x.SourcePort, x.Target, x.TargetPort)),
                (Device: x.Target, Port: x.TargetPort,
                    Link: Canonical(x.Source, x.SourcePort, x.Target, x.TargetPort))
            })
            .GroupBy(x => (x.Device, x.Port))
            .Where(g => g.Select(x => x.Link).Distinct(StringComparer.Ordinal).Skip(1).Any())
            .Select(g => g.Key)
            .ToHashSet();

        // A reciprocal report is only corroborated when both freshly
        // authenticated managed endpoints report *matching port pairs*.
        // Multiple rows from one device never count as a reverse observation.
        var links = rows.GroupBy(x => Canonical(x.Source, x.SourcePort, x.Target, x.TargetPort))
            .Select(g => {
                var first = g.First();
                var conflict = g.Any(x =>
                    conflictingEndpoints.Contains((x.Source, x.SourcePort)) ||
                    conflictingEndpoints.Contains((x.Target, x.TargetPort)));
                var unresolved = first.Source.StartsWith("lldp:", StringComparison.Ordinal) ||
                    first.Target.StartsWith("lldp:", StringComparison.Ordinal);
                var reciprocal = !unresolved &&
                    g.Any(x => x.Source == first.Source) &&
                    g.Any(x => x.Source == first.Target);
                var corroboration = conflict ? "ambiguous-port" :
                    unresolved ? "unresolved" :
                    reciprocal ? "reciprocal" : "single-sided";
                return new Link("lldp:" + g.Key, first.Source, first.Target,
                    first.SourcePort, first.TargetPort,
                    g.Select(x => x.Id).Distinct().OrderBy(x => x).ToArray(),
                    corroboration);
            }).OrderBy(x => x.Id, StringComparer.Ordinal).Take(1024).ToArray();
        return new Result(resultNodes.Values.ToArray(), links);
    }

    private static string Canonical(string source, string local, string target, string remote)
    {
        var a = $"{source.Length}:{source}:{local.Length}:{local}";
        var b = $"{target.Length}:{target}:{remote.Length}:{remote}";
        return string.CompareOrdinal(a, b) <= 0 ? a + "|" + b : b + "|" + a;
    }
}