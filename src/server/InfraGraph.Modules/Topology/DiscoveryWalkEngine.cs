namespace InfraGraph.Modules.Topology;

/// <summary>Read-only neighbor collection boundary; never propagates code or broadens scope.</summary>
public interface INeighborEvidenceReader
{
    Task<IReadOnlyList<TopologyGraphEngine.Observation>> ReadAsync(
        string assetKey, CancellationToken cancellationToken);
}

public sealed record DiscoveryWalkPolicy(
    string SiteId, IReadOnlySet<string> ApprovedAssets,
    int MaxNodes = 256, int MaxDepth = 8, int MaxNeighborsPerNode = 64,
    TimeSpan? PerAssetTimeout = null, TimeSpan? MaxTotalDuration = null);

public sealed record DiscoveryWalkResult(
    TopologyGraphEngine.Graph Graph, IReadOnlyList<string> FailedAssets,
    int ProbedAssets, int SkippedOutOfScope, bool TimedOut);

/// <summary>A sequential, bounded traversal of explicitly preapproved assets.</summary>
public static class DiscoveryWalkEngine
{
    public static async Task<DiscoveryWalkResult> RunAsync(
        DiscoveryWalkPolicy policy, IEnumerable<string> seeds,
        INeighborEvidenceReader reader, TimeProvider clock,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(policy);
        ArgumentNullException.ThrowIfNull(seeds);
        ArgumentNullException.ThrowIfNull(reader);
        ArgumentNullException.ThrowIfNull(clock);
        var perAsset = policy.PerAssetTimeout ?? TimeSpan.FromSeconds(3);
        var total = policy.MaxTotalDuration ?? TimeSpan.FromMinutes(2);
        if (string.IsNullOrWhiteSpace(policy.SiteId) ||
            policy.MaxNodes is < 1 or > 512 || policy.MaxDepth is < 0 or > 16 ||
            policy.MaxNeighborsPerNode is < 1 or > 128 ||
            perAsset <= TimeSpan.Zero || perAsset > TimeSpan.FromSeconds(30) ||
            total <= TimeSpan.Zero || total > TimeSpan.FromMinutes(10))
            throw new ArgumentException("Invalid discovery limits.");
        if (policy.ApprovedAssets is null || policy.ApprovedAssets.Count == 0)
            throw new ArgumentException("Explicit approved scope required.");

        var roots = seeds.Where(s => policy.ApprovedAssets.Contains(s))
            .Distinct(StringComparer.Ordinal).Take(policy.MaxNodes).ToArray();
        if (roots.Length == 0) throw new ArgumentException("No approved seed provided.");

        using var overall = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        overall.CancelAfter(total);
        var q = new Queue<(string Key, int Depth)>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var key in roots)
            if (seen.Add(key)) q.Enqueue((key, 0));
        var evidence = new List<TopologyGraphEngine.Observation>();
        var failures = new List<string>();
        var skipped = 0;
        var probed = 0;
        var timedOut = false;
        var truncated = false;

        while (q.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (overall.IsCancellationRequested) { timedOut = true; break; }
            var (key, depth) = q.Dequeue();
            if (depth >= policy.MaxDepth) { truncated = true; continue; }

            IReadOnlyList<TopologyGraphEngine.Observation> neighbors;
            using var probe = CancellationTokenSource.CreateLinkedTokenSource(overall.Token);
            probe.CancelAfter(perAsset);
            try
            {
                // WaitAsync prevents a non-cooperative Reader from blocking the Worker.
                neighbors = await reader.ReadAsync(key, probe.Token).WaitAsync(probe.Token);
                if (neighbors is null) throw new InvalidOperationException("Null neighbor results.");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (OperationCanceledException) when (overall.IsCancellationRequested)
            {
                timedOut = true;
                failures.Add(key);
                break;
            }
            catch
            {
                failures.Add(key);
                truncated = true;
                continue;
            }

            probed++;
            if (neighbors.Count > policy.MaxNeighborsPerNode) truncated = true;
            foreach (var o in neighbors.Take(policy.MaxNeighborsPerNode))
            {
                if (evidence.Count >= 10000) { truncated = true; break; }
                if (o.SiteId != policy.SiteId || o.SourceKey != key ||
                    !policy.ApprovedAssets.Contains(o.TargetKey))
                { skipped++; continue; }
                evidence.Add(o);
                if (!seen.Contains(o.TargetKey))
                {
                    if (seen.Count >= policy.MaxNodes) truncated = true;
                    else if (seen.Add(o.TargetKey)) q.Enqueue((o.TargetKey, depth + 1));
                }
            }
            if (evidence.Count >= 10000) break;
        }

        var graph = TopologyGraphEngine.Build(policy.SiteId, roots, evidence,
            clock.GetUtcNow(), policy.MaxNodes, policy.MaxDepth);
        if (timedOut || truncated) graph = graph with { Truncated = true };
        return new DiscoveryWalkResult(graph, failures, probed, skipped, timedOut);
    }
}