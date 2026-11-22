using InfraGraph.Modules.Inventory;
using InfraGraph.Modules.Monitoring;
using InfraGraph.Modules.Topology;
using InfraGraph.SharedKernel;

namespace InfraGraph.UnitTests;

public class DomainRulesTests
{
    [Fact]
    public void MissingHeartbeat_IsUnknown_NotDown()
    {
        var state = HealthAssessment.FromHeartbeat(null, DateTimeOffset.UtcNow, TimeSpan.FromMinutes(5), true);
        Assert.Equal(HealthState.Unknown, state);
    }

    [Fact]
    public void ObserverOffline_IsUnknown_EvenWithRecentHeartbeat()
    {
        var now = DateTimeOffset.UtcNow;
        var state = HealthAssessment.FromHeartbeat(now, now, TimeSpan.FromMinutes(5), false);
        Assert.Equal(HealthState.Unknown, state);
    }

    [Fact]
    public void OldHeartbeat_IsStale_NotDown()
    {
        var now = DateTimeOffset.UtcNow;
        var state = HealthAssessment.FromHeartbeat(now.AddMinutes(-10), now, TimeSpan.FromMinutes(5), true);
        Assert.Equal(HealthState.Stale, state);
    }

    [Fact]
    public void FreshHeartbeat_IsHealthy()
    {
        var now = DateTimeOffset.UtcNow;
        Assert.Equal(HealthState.Healthy,
            HealthAssessment.FromHeartbeat(now.AddSeconds(-10), now, TimeSpan.FromMinutes(5), true));
    }

    [Fact]
    public void ConfirmedEdge_WithoutEvidence_IsRejected()
    {
        var a = new TopologyEndpoint(AssetId.New(), "Gi1");
        var b = new TopologyEndpoint(AssetId.New(), "Gi2");
        Assert.Throws<ArgumentException>(() => TopologyEdge.Create(
            a, b, TopologyLayer.EthernetL2, EvidenceConfidence.Confirmed, []));
    }

    [Fact]
    public void EdgeWithEvidence_PreservesLayerAndReference()
    {
        var evidenceId = Guid.NewGuid();
        var edge = TopologyEdge.Create(
            new(AssetId.New(), "Gi1"), new(AssetId.New(), "Gi2"),
            TopologyLayer.EthernetL2, EvidenceConfidence.Confirmed, [evidenceId]);
        Assert.Equal(TopologyLayer.EthernetL2, edge.Layer);
        Assert.Contains(evidenceId, edge.EvidenceIds);
    }

    [Fact]
    public void AssetId_DoesNotDependOnIpAddress()
    {
        var id = AssetId.New();
        var asset = new Asset(id, "head-office");
        asset.Observe(new("agent", "10.0.0.1", null, DateTimeOffset.UtcNow.AddHours(-1)));
        asset.Observe(new("agent", "10.0.1.2", null, DateTimeOffset.UtcNow));
        Assert.Equal(id, asset.Id);
        Assert.Equal(2, asset.Observations.Count);
    }
}
