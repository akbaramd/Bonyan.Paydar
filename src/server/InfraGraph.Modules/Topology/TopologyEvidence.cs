using InfraGraph.SharedKernel;

namespace InfraGraph.Modules.Topology;

public enum TopologyLayer { PhysicalL1, EthernetL2, NetworkL3, Dependency }
public enum EvidenceConfidence { Unknown, Inferred, Confirmed }

public sealed record TopologyEndpoint(AssetId AssetId, string? PortKey);

public sealed record TopologyEvidence(
    Guid EvidenceId,
    string Protocol,
    string ObserverId,
    DateTimeOffset ObservedAtUtc,
    TimeSpan TimeToLive,
    TopologyLayer Layer,
    EvidenceConfidence Confidence)
{
    public bool IsFresh(DateTimeOffset nowUtc) =>
        TimeToLive > TimeSpan.Zero &&
        nowUtc >= ObservedAtUtc &&
        nowUtc - ObservedAtUtc <= TimeToLive;
}

public sealed record TopologyEdge(
    TopologyEndpoint A,
    TopologyEndpoint B,
    TopologyLayer Layer,
    EvidenceConfidence Confidence,
    IReadOnlyCollection<Guid> EvidenceIds)
{
    public static TopologyEdge Create(
        TopologyEndpoint a, TopologyEndpoint b,
        TopologyLayer layer, EvidenceConfidence confidence,
        IReadOnlyCollection<Guid> evidenceIds)
    {
        ArgumentNullException.ThrowIfNull(a);
        ArgumentNullException.ThrowIfNull(b);
        ArgumentNullException.ThrowIfNull(evidenceIds);
        if (a == b) throw new ArgumentException("A topology edge cannot connect an endpoint to itself.");
        if (a.AssetId.Value == Guid.Empty || b.AssetId.Value == Guid.Empty)
            throw new ArgumentException("A topology edge requires stable asset identities.");
        if (confidence == EvidenceConfidence.Confirmed && evidenceIds.Count == 0)
            throw new ArgumentException("Confirmed links require traceable evidence.");
        return new(a, b, layer, confidence, evidenceIds.ToArray());
    }
}
