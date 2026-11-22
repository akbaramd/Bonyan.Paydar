using InfraGraph.Modules.Discovery;

namespace InfraGraph.UnitTests;

public sealed class SnmpTopologyReconcilerTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 20, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void CorrelatesUniqueChassisIdsIntoDeviceAndMergesReciprocalPortEvidence()
    {
        var devices = new[] {
            new SnmpTopologyReconciler.Device("192.168.88.10", "AABB", "switch-a",
                "switch", Now),
            new SnmpTopologyReconciler.Device("192.168.88.11", "CCDD", "switch-b",
                "switch", Now),
        };
        var neighbors = new[] {
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "192.168.88.10",
                "Gi1", "CCDD", "Gi2", "switch-b", Now),
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "192.168.88.11",
                "Gi2", "AABB", "Gi1", "switch-a", Now)
        };
        var result = SnmpTopologyReconciler.Build(devices, neighbors, Now);
        Assert.Equal(2, result.Nodes.Length);
        var link = Assert.Single(result.Links);
        Assert.Equal(2, link.EvidenceIds.Length);
        Assert.Equal("reciprocal", link.Corroboration);
        Assert.Contains(link.Source, new[] { "192.168.88.10", "192.168.88.11" });
        Assert.Contains(link.Target, new[] { "192.168.88.10", "192.168.88.11" });
    }

    [Fact]
    public void AmbiguousChassisRemainsUnresolvedInsteadOfCreatingFalsePhysicalIpLink()
    {
        var nodes = new[] {
            new SnmpTopologyReconciler.Device("192.168.1.1", "AABB", "switch",
                "switch", Now),
            new SnmpTopologyReconciler.Device("192.168.1.2", "CCDD", "duplicate-1",
                "unknown", Now),
            new SnmpTopologyReconciler.Device("192.168.1.3", "CCDD", "duplicate-2",
                "unknown", Now),
        };
        var evidence = new [] {
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "192.168.1.1",
                "port1", "CCDD", "port9", "dup", Now)
        };
        var result = SnmpTopologyReconciler.Build(nodes, evidence, Now);
        Assert.Equal("lldp:CCDD", Assert.Single(result.Links).Target);
        Assert.Equal("unresolved", Assert.Single(result.Links).Corroboration);
        Assert.Contains(result.Nodes, x => x.Id == "lldp:CCDD");
    }

    [Fact]
    public void StaleOrSelfNeighborEvidenceNeverCreatesActiveLink()
    {
        var devices = new[] {
            new SnmpTopologyReconciler.Device("192.168.1.1", "AABB", "switch",
                "switch", Now),
        };
        var edges = new[] {
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "192.168.1.1",
                "port1", "AABB", "port2", "self", Now),
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "192.168.1.1",
                "port4", "CCDD", "port1", "expired", Now.AddMinutes(-30)),
        };
        Assert.Empty(SnmpTopologyReconciler.Build(devices, edges, Now).Links);
    }

    [Fact]
    public void SingleSidedObservationDoesNotClaimReciprocalLink()
    {
        var devices = new[] {
            new SnmpTopologyReconciler.Device("10.0.0.1", "AABB", "core", "switch", Now),
            new SnmpTopologyReconciler.Device("10.0.0.2", "CCDD", "access", "switch", Now)
        };
        var oneDirection = new[] {
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.1",
                "Gi1", "CCDD", "Gi2", null, Now),
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.1",
                "Gi1", "CCDD", "Gi2", null, Now)
        };
        var link = Assert.Single(SnmpTopologyReconciler.Build(devices, oneDirection, Now).Links);
        Assert.Equal("single-sided", link.Corroboration);
        Assert.Equal(2, link.EvidenceIds.Length);
    }

    [Fact]
    public void ConflictingNeighborsOnSamePortAreNotTreatedAsUniqueCables()
    {
        var devices = new[] {
            new SnmpTopologyReconciler.Device("10.0.0.1", "AABB", "core", "switch", Now),
            new SnmpTopologyReconciler.Device("10.0.0.2", "CCDD", "access1", "switch", Now),
            new SnmpTopologyReconciler.Device("10.0.0.3", "EEFF", "access2", "switch", Now)
        };
        var observations = new[] {
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.1",
                "Gi1", "CCDD", "Gi2", null, Now),
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.2",
                "Gi2", "AABB", "Gi1", null, Now),
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.1",
                "Gi1", "EEFF", "Gi3", null, Now)
        };
        var result = SnmpTopologyReconciler.Build(devices, observations, Now);
        Assert.Equal(2, result.Links.Length);
        Assert.All(result.Links, link => Assert.Equal("ambiguous-port", link.Corroboration));
        Assert.Equal(3, result.Nodes.Length);
    }

    [Fact]
    public void StaleConflictsDoNotDowngradeCurrentReciprocalLink()
    {
        var devices = new[] {
            new SnmpTopologyReconciler.Device("10.0.0.1", "AABB", "core", "switch", Now),
            new SnmpTopologyReconciler.Device("10.0.0.2", "CCDD", "access", "switch", Now)
        };
        var observations = new[] {
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.1",
                "Gi1", "CCDD", "Gi2", null, Now),
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.2",
                "Gi2", "AABB", "Gi1", null, Now),
            new SnmpTopologyReconciler.Neighbor(Guid.NewGuid(), "10.0.0.1",
                "Gi1", "FFFF", "Gi9", null, Now.AddMinutes(-21))
        };
        var result = SnmpTopologyReconciler.Build(devices, observations, Now);
        Assert.Equal("reciprocal", Assert.Single(result.Links).Corroboration);
    }
}
