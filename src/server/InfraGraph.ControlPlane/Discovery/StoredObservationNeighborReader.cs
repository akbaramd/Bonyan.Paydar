using InfraGraph.Modules.Topology;

namespace InfraGraph.ControlPlane.Discovery;

/// <summary>
/// Adapts already persisted, manually reported evidence to the bounded walk engine.
/// This implementation is completely offline and cannot emit packets or touch devices.
/// Each observation can be traversed in either direction without creating new evidence.
/// </summary>
internal sealed class StoredObservationNeighborReader : INeighborEvidenceReader
{
    private readonly IReadOnlyDictionary<string, IReadOnlyList<TopologyGraphEngine.Observation>> _byNode;

    public StoredObservationNeighborReader(IEnumerable<TopologyGraphEngine.Observation> observations)
    {
        var map = new Dictionary<string, List<TopologyGraphEngine.Observation>>(StringComparer.Ordinal);
        foreach (var item in observations)
        {
            if (!map.TryGetValue(item.SourceKey, out var source))
                map[item.SourceKey] = source = [];
            source.Add(item);
            if (!map.TryGetValue(item.TargetKey, out var target))
                map[item.TargetKey] = target = [];
            target.Add(item with {
                SourceKey = item.TargetKey, TargetKey = item.SourceKey,
                SourcePort = item.TargetPort, TargetPort = item.SourcePort
            });
        }
        _byNode = map.ToDictionary(
            kvp => kvp.Key, kvp => (IReadOnlyList<TopologyGraphEngine.Observation>)kvp.Value,
            StringComparer.Ordinal);
    }

    public Task<IReadOnlyList<TopologyGraphEngine.Observation>> ReadAsync(
        string assetKey, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_byNode.TryGetValue(assetKey, out var links)
            ? links : (IReadOnlyList<TopologyGraphEngine.Observation>)[]);
    }
}
