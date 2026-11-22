using InfraGraph.Modules.Discovery;

namespace InfraGraph.UnitTests;

public sealed class SnmpTopologyParserTests
{
    [Fact]
    public void ParsesLldpNeighborWithActualPortsAndKeepsFdbAsLearningOnly()
    {
        var b = new[] {
            new SnmpTopologyParser.Binding("1.3.6.1.2.1.1.5.0", "acc-switch-1"),
            new SnmpTopologyParser.Binding("1.3.6.1.2.1.1.7.0", "2"),
            new SnmpTopologyParser.Binding("1.0.8802.1.1.2.1.3.1.0", "4"),
            new SnmpTopologyParser.Binding("1.0.8802.1.1.2.1.3.2.0", "AA1122334455"),
            new SnmpTopologyParser.Binding("1.0.8802.1.1.2.1.3.7.1.4.9", "Gi1/0/9"),
            new SnmpTopologyParser.Binding("1.0.8802.1.1.2.1.4.1.1.4.3.9.1", "4"),
            new SnmpTopologyParser.Binding("1.0.8802.1.1.2.1.4.1.1.5.3.9.1", "BB1122334455"),
            new SnmpTopologyParser.Binding("1.0.8802.1.1.2.1.4.1.1.8.3.9.1", "eth0"),
            new SnmpTopologyParser.Binding("1.0.8802.1.1.2.1.4.1.1.9.3.9.1", "server-1"),
            new SnmpTopologyParser.Binding("1.3.6.1.2.1.17.1.4.1.2.7", "11"),
            new SnmpTopologyParser.Binding("1.3.6.1.2.1.31.1.1.1.1.11", "Gi1/0/7"),
            new SnmpTopologyParser.Binding("1.3.6.1.2.1.17.4.3.1.2.10.20.30.40.50.60", "7"),
        };
        var result = SnmpTopologyParser.Parse("192.168.88.11", b);
        Assert.Equal("switch", result.Kind);
        Assert.Equal("acc-switch-1", result.SystemName);
        Assert.Equal("4:AA1122334455", result.ChassisId);
        var edge = Assert.Single(result.Neighbors);
        Assert.Equal("Gi1/0/9", edge.LocalPort);
        Assert.Equal("eth0", edge.RemotePort);
        Assert.Equal("4:BB1122334455", edge.RemoteChassisId);
        Assert.Equal("server-1", edge.RemoteSystemName);
        var learned = Assert.Single(result.LearnedMacs);
        Assert.Equal("0A:14:1E:28:32:3C", learned.Address);
        Assert.Equal("Gi1/0/7", learned.Port);
    }

    [Fact]
    public void DoesNotInventNeighborsFromFdbOnlyOrFromMalformedLldp()
    {
        var result = SnmpTopologyParser.Parse("192.168.88.11", [
            new("1.3.6.1.2.1.1.7.0", "4"),
            new("1.3.6.1.2.1.4.1.0", "1"),
            new("1.3.6.1.2.1.17.4.3.1.2.10.20.30.40.50.60", "8"),
            new("1.0.8802.1.1.2.1.4.1.1.5.9.1.2", "BAD_CHASSIS"),
        ]);
        Assert.Equal("unknown", result.Kind); // routed + FDB = mixed evidence
        Assert.Empty(result.Neighbors);
        Assert.Single(result.LearnedMacs);
    }

    [Fact]
    public void RouterRequiresExplicitIpForwardingEvidenceNotSysServicesBitAlone()
    {
        var alone = SnmpTopologyParser.Parse("192.168.88.1", [
            new("1.3.6.1.2.1.1.7.0", "4"),
            new("1.3.6.1.2.1.4.1.0", "2")
        ]);
        Assert.Equal("unknown", alone.Kind);
        var forwarding = SnmpTopologyParser.Parse("192.168.88.1", [
            new("1.3.6.1.2.1.1.7.0", "4"),
            new("1.3.6.1.2.1.4.1.0", "1")
        ]);
        Assert.Equal("router", forwarding.Kind);
    }

    [Fact]
    public void RejectsInvalidIpAndNeverTrustsMalformedPortIndices()
    {
        Assert.Throws<ArgumentException>(() =>
            SnmpTopologyParser.Parse("8.8.8.8.example", []));
        var snapshot = SnmpTopologyParser.Parse("10.1.1.1", [
            new("1.0.8802.1.1.2.1.4.1.1.5.hello", "AABBCCDD"),
        ]);
        Assert.Empty(snapshot.Neighbors);
    }

    [Fact]
    public void ChassisSubtypePreventsByteIdenticalIdentifiersFromColliding()
    {
        var snapshot = SnmpTopologyParser.Parse("10.0.0.1", [
            new("1.0.8802.1.1.2.1.3.1.0", "4"),
            new("1.0.8802.1.1.2.1.3.2.0", "AABBCCDDEEFF"),
            new("1.0.8802.1.1.2.1.3.7.1.2.7", "5"),
            new("1.0.8802.1.1.2.1.3.7.1.3.7", "0x4769312F3037"),
            new("1.0.8802.1.1.2.1.4.1.1.4.3.7.1", "7"),
            new("1.0.8802.1.1.2.1.4.1.1.5.3.7.1", "AABBCCDDEEFF"),
            new("1.0.8802.1.1.2.1.4.1.1.6.3.7.1", "3"),
            new("1.0.8802.1.1.2.1.4.1.1.7.3.7.1", "0x112233445566"),
        ]);
        Assert.Equal("4:AABBCCDDEEFF", snapshot.ChassisId);
        var peer = Assert.Single(snapshot.Neighbors);
        Assert.Equal("7:AABBCCDDEEFF", peer.RemoteChassisId);
        Assert.Equal("Gi1/07", peer.LocalPort);
        Assert.Equal("11:22:33:44:55:66", peer.RemotePort);
    }

    [Fact]
    public void MalformedOrAbsentChassisSubtypeCannotCreateResolvedAdjacency()
    {
        var invalid = SnmpTopologyParser.Parse("10.0.0.1", [
            new("1.0.8802.1.1.2.1.3.2.0", "AABBCCDDEEFF"),
            new("1.0.8802.1.1.2.1.4.1.1.5.3.7.1", "001122334455"),
            new("1.0.8802.1.1.2.1.4.1.1.7.3.7.1", "Gi1")
        ]);
        Assert.Null(invalid.ChassisId);
        Assert.Empty(invalid.Neighbors);

        var wrongMacLength = SnmpTopologyParser.Parse("10.0.0.1", [
            new("1.0.8802.1.1.2.1.3.1.0", "4"),
            new("1.0.8802.1.1.2.1.3.2.0", "AABB"),
            new("1.0.8802.1.1.2.1.4.1.1.4.3.7.1", "4"),
            new("1.0.8802.1.1.2.1.4.1.1.5.3.7.1", "CCDD"),
            new("1.0.8802.1.1.2.1.4.1.1.7.3.7.1", "Gi1")
        ]);
        Assert.Null(wrongMacLength.ChassisId);
        Assert.Empty(wrongMacLength.Neighbors);
    }
}
