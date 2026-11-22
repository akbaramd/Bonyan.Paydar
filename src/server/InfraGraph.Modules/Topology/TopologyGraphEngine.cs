namespace InfraGraph.Modules.Topology;

/// <summary>Bounded, evidence-driven L2 traversal. Never sends packets.
/// A cycle means a possible redundant path, not proof of a forwarding loop.</summary>
public static class TopologyGraphEngine
{
    public sealed record Observation(Guid Id, string SiteId, string SourceKey, string TargetKey,
        string? SourcePort, string? TargetPort, string Protocol, DateTimeOffset ObservedAtUtc, int TtlSeconds);
    public sealed record Node(string Id, int Depth);
    public sealed record Link(string Id, string Source, string Target, string? SourcePort, string? TargetPort,
        string Protocol, IReadOnlyList<Guid> EvidenceIds, bool PossibleCycle);
    public sealed record Graph(string SiteId, IReadOnlyList<Node> Nodes, IReadOnlyList<Link> Links,
        int StaleObservations, bool Truncated, DateTimeOffset GeneratedAtUtc);

    public static Graph Build(string siteId, IEnumerable<string> seeds,
        IEnumerable<Observation> observations, DateTimeOffset nowUtc,
        int maxNodes = 512, int maxDepth = 12)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(siteId);
        ArgumentNullException.ThrowIfNull(seeds);
        ArgumentNullException.ThrowIfNull(observations);
        if (maxNodes is < 1 or > 4096 || maxDepth is < 0 or > 32)
            throw new ArgumentOutOfRangeException(nameof(maxNodes), "Traversal limits exceeded.");
        var inputs = observations.Take(10001).ToArray();
        if (inputs.Length > 10000) throw new ArgumentException("Observation budget exceeded.");
        var stale = inputs.Count(o => o.SiteId == siteId &&
            (o.TtlSeconds <= 0 || o.ObservedAtUtc > nowUtc ||
             nowUtc - o.ObservedAtUtc > TimeSpan.FromSeconds(o.TtlSeconds)));
        var valid = inputs.Where(o => o.SiteId == siteId &&
            o.Id != Guid.Empty && o.SourceKey is { Length: > 0 and <= 160 } &&
            o.TargetKey is { Length: > 0 and <= 160 } &&
            !string.IsNullOrWhiteSpace(o.SourceKey) &&
            !string.IsNullOrWhiteSpace(o.TargetKey) && o.SourceKey != o.TargetKey &&
            (o.SourcePort?.Length ?? 0) <= 80 && (o.TargetPort?.Length ?? 0) <= 80 &&
            o.Protocol is { Length: > 0 and <= 32 } &&
            o.TtlSeconds > 0 && o.TtlSeconds <= 86400 &&
            o.ObservedAtUtc <= nowUtc &&
            nowUtc - o.ObservedAtUtc <= TimeSpan.FromSeconds(o.TtlSeconds)).ToArray();
        var links = valid.GroupBy(o => Canonical(o.SourceKey, o.SourcePort, o.TargetKey, o.TargetPort))
            .Select(group =>
            {
                var o = group.First();
                return new Link(group.Key, o.SourceKey, o.TargetKey, o.SourcePort, o.TargetPort,
                    string.Join(",", group.Select(x => x.Protocol).Distinct().Order()),
                    group.Select(x => x.Id).Distinct().Order().ToArray(), false);
            }).OrderBy(x => x.Id, StringComparer.Ordinal).ToArray();
        var adjacency = new Dictionary<string, List<Link>>(StringComparer.Ordinal);
        foreach (var link in links)
        {
            if (!adjacency.TryGetValue(link.Source, out var a)) adjacency[link.Source] = a = [];
            if (!adjacency.TryGetValue(link.Target, out var b)) adjacency[link.Target] = b = [];
            a.Add(link); b.Add(link);
        }
        var queue = new Queue<(string Key, int Depth)>();
        var depths = new Dictionary<string, int>(StringComparer.Ordinal);
        // A user-supplied focus key is not evidence that an asset exists.
        // Never render an isolated phantom node when no fresh observation refers to it.
        var rootKeys = seeds.Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.Ordinal).Take(maxNodes + 1).ToArray();
        var truncated = rootKeys.Length > maxNodes;
        foreach (var seed in rootKeys.Take(maxNodes))
            if (adjacency.ContainsKey(seed) && depths.TryAdd(seed, 0))
                queue.Enqueue((seed, 0));
        while (queue.Count > 0)
        {
            var (key, depth) = queue.Dequeue();
            if (!adjacency.TryGetValue(key, out var neighbors)) continue;
            foreach (var link in neighbors)
            {
                var next = link.Source == key ? link.Target : link.Source;
                if (depths.ContainsKey(next)) continue;
                if (depth >= maxDepth || depths.Count >= maxNodes) { truncated = true; continue; }
                depths[next] = depth + 1;
                queue.Enqueue((next, depth + 1));
            }
        }
        // Independent seeds may meet through a tree path. A disjoint-set forest
        // detects actual undirected cycles, including parallel port links.
        var parent = depths.Keys.ToDictionary(x => x, x => x, StringComparer.Ordinal);
        string Root(string x)
        {
            while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
            return x;
        }
        var included = links.Where(x => depths.ContainsKey(x.Source) && depths.ContainsKey(x.Target))
            .Select(x => {
                var a = Root(x.Source);
                var b = Root(x.Target);
                if (a == b) return x with { PossibleCycle = true };
                parent[a] = b;
                return x;
            }).ToArray();
        return new Graph(siteId, depths.Select(x => new Node(x.Key, x.Value))
                .OrderBy(x => x.Depth).ThenBy(x => x.Id, StringComparer.Ordinal).ToArray(),
            included, stale, truncated, nowUtc);
    }

    private static string Canonical(string a, string? ap, string b, string? bp)
    {
        var left = $"{a.Length}:{a}:{ap?.Length ?? 0}:{ap}";
        var right = $"{b.Length}:{b}:{bp?.Length ?? 0}:{bp}";
        return string.CompareOrdinal(left, right) < 0 ? left + "|" + right : right + "|" + left;
    }
}