using InfraGraph.Modules.Discovery;

namespace InfraGraph.UnitTests;

public sealed class Ipv4ScanPlannerTests
{
    [Theory]
    [InlineData("192.168.30.0/24", 254, "192.168.30.1", "192.168.30.254")]
    [InlineData("10.4.0.0/22", 1022, "10.4.0.1", "10.4.3.254")]
    [InlineData("172.16.5.1/32", 1, "172.16.5.1", "172.16.5.1")]
    public void EnumeratesOnlyApprovedPrivateAddresses(
        string cidr, int count, string first, string last)
    {
        var targets = Ipv4ScanPlanner.Plan([cidr]).Select(x => x.ToString()).ToArray();
        Assert.Equal(count, targets.Length);
        Assert.Equal(first, targets[0]);
        Assert.Equal(last, targets[^1]);
    }

    [Theory]
    [InlineData("0.0.0.0/0")]
    [InlineData("8.8.8.8/32")]
    [InlineData("127.0.0.1/32")]
    [InlineData("169.254.3.1/32")]
    [InlineData("224.0.0.1/32")]
    [InlineData("192.168.2.1/24")]
    [InlineData("192.168.0.0/21")]
    [InlineData("192.169.0.0/24")]
    [InlineData("172.32.0.0/24")]
    [InlineData("192.168.0.0/0")]
    [InlineData("not-a-cidr")]
    public void RejectsUnsafeOrMalformedScope(string cidr)
    {
        Assert.Throws<ArgumentException>(() => Ipv4ScanPlanner.Plan([cidr]));
    }

    [Fact]
    public void DeduplicatesOverlappingApprovedScope()
    {
        var targets = Ipv4ScanPlanner.Plan(["10.0.0.0/24", "10.0.0.2/32"]);
        Assert.Equal(254, targets.Count);
    }

    [Fact]
    public void RejectsTooManyCombinedTargets()
    {
        Assert.Throws<ArgumentException>(() =>
            Ipv4ScanPlanner.Plan(["10.0.0.0/22", "10.0.4.0/24"]));
    }

    [Fact]
    public void RejectsMissingOrExcessiveCidrs()
    {
        Assert.Throws<ArgumentException>(() => Ipv4ScanPlanner.Plan([]));
        Assert.Throws<ArgumentException>(() =>
            Ipv4ScanPlanner.Plan(Enumerable.Repeat("10.0.0.1/32", 9)));
    }
}
