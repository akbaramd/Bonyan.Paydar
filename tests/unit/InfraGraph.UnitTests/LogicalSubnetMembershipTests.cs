using InfraGraph.Modules.Discovery;

namespace InfraGraph.UnitTests;

public sealed class LogicalSubnetMembershipTests
{
    [Fact]
    public void GroupsOnlyObservedIPsInsideExplicitApprovedCIDRs()
    {
        var result = LogicalSubnetMembership.Build(
            ["[\"192.168.88.0/22\"]"],
            ["192.168.88.34", "192.168.90.65", "192.168.203.255",
             "192.168.199.4", "8.8.8.8"]);
        var segment = Assert.Single(result);
        Assert.Equal("subnet:192.168.88.0/22", segment.Id);
        Assert.Equal("192.168.88.0/22", segment.Cidr);
        Assert.Equal(["192.168.88.34", "192.168.90.65"], segment.HostIds);
    }

    [Fact]
    public void DoesNotCreatePhysicalLinksOrGuessOutsideUnapprovedScopes()
    {
        var result = LogicalSubnetMembership.Build(
            ["[\"10.1.0.0/24\"]", "not-json", "[\"192.168.0.0/16\"]"],
            ["10.1.0.55", "192.168.88.34"]);
        var segment = Assert.Single(result);
        Assert.Equal(["10.1.0.55"], segment.HostIds);
        Assert.Equal("10.1.0.0/24", segment.Cidr);
    }

    [Fact]
    public void EmptyJobsOrEmptyEvidenceProduceNoConnections()
    {
        Assert.Empty(LogicalSubnetMembership.Build([], ["192.168.88.34"]));
        Assert.Empty(LogicalSubnetMembership.Build(["[\"192.168.88.0/22\"]"], []));
    }
}

