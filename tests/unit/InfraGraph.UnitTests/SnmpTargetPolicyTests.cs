using InfraGraph.Modules.Discovery;

namespace InfraGraph.UnitTests;

public sealed class SnmpTargetPolicyTests
{
    [Fact]
    public void ParsesExplicitPrivateManagementAddressesWithoutSendingPackets()
    {
        var targets = SnmpTargetPolicy.Parse("""
            {"targets":[
                {"siteId":"lan","address":"192.168.88.34","approved":true},
                {"siteId":"site2","address":"10.20.1.10","approved":true}
            ]}
            """);
        Assert.Equal(2, targets.Length);
        Assert.Equal("192.168.88.34", targets[0].Address);
    }

    [Theory]
    [InlineData("""{"targets":[{"siteId":"lan","address":"192.168.88.34","approved":false}]}""")]
    [InlineData("""{"targets":[{"siteId":"lan","address":"8.8.8.8","approved":true}]}""")]
    [InlineData("""{"targets":[{"siteId":"lan","address":"localhost","approved":true}]}""")]
    [InlineData("""{"targets":[{"siteId":"lan","address":"192.168.88.034","approved":true}]}""")]
    [InlineData("""{"targets":[{"siteId":"lan","address":"192.168.88.34","approved":true},{"siteId":"lan","address":"192.168.88.34","approved":true}]}""")]
    [InlineData("""{"targets":[]}""")]
    public void RejectsUnapprovedOrInvalidManagementTargets(string json)
    {
        Assert.Throws<ArgumentException>(() => SnmpTargetPolicy.Parse(json));
    }

    [Fact]
    public void RequiresFreshRunningJobInSameSiteAndMatchingIp()
    {
        var now = new DateTimeOffset(2026, 11, 21, 8, 0, 0, TimeSpan.Zero);
        var target = new SnmpTargetPolicy.Target("lan", "192.168.88.34", true);
        SnmpTargetPolicy.ActiveScope Running(string site, string cidrs) =>
            new(site, cidrs, "running", now.AddMinutes(-10), now.AddMinutes(-1), 300);
        var running = Running("lan", """["192.168.88.0/22"]""");
        bool Allowed(SnmpTargetPolicy.Target device, params SnmpTargetPolicy.ActiveScope[] jobs) =>
            SnmpTargetPolicy.IsApprovedByRunningJob(device, jobs, now);

        Assert.True(Allowed(target, running));
        Assert.True(Allowed(target, Running("lan", """["10.1.1.0/24"]"""), running));
        Assert.True(Allowed(target, running with {
            StartedAtUtc = now.AddMinutes(-1), LastSweepAtUtc = null
        }));
        Assert.False(Allowed(target, running with { Status = "cancelled" }));
        Assert.False(Allowed(target, running with { Status = "cancelling" }));
        Assert.False(Allowed(target, running with { Status = "failed" }));
        Assert.False(Allowed(target, running with { Status = "pending" }));
        Assert.False(Allowed(target, running with { SiteId = "another-site" }));
        Assert.False(Allowed(target, Running("lan", """["192.168.100.0/24"]""")));
        Assert.False(Allowed(target, Running("lan", "not-json")));
        Assert.False(Allowed(target with { Approved = false }, running));
        Assert.False(Allowed(target with { Address = "8.8.8.8" }, running));
        Assert.False(Allowed(target with { Address = "192.168.88.034" }, running));
    }

    [Fact]
    public void StaleOrInconsistentRunningJobCannotAuthorizeSnmp()
    {
        var now = new DateTimeOffset(2026, 11, 21, 8, 0, 0, TimeSpan.Zero);
        var target = new SnmpTargetPolicy.Target("lan", "10.20.1.10", true);
        var running = new SnmpTargetPolicy.ActiveScope("lan",
            """["10.20.1.0/24"]""", "running",
            now.AddHours(-2), now.AddMinutes(-1), 300);
        bool Allowed(SnmpTargetPolicy.ActiveScope job) =>
            SnmpTargetPolicy.IsApprovedByRunningJob(target, [job], now);

        Assert.True(Allowed(running));
        Assert.False(Allowed(running with { StartedAtUtc = null }));
        Assert.False(Allowed(running with { StartedAtUtc = now.AddMinutes(1) }));
        Assert.False(Allowed(running with { LastSweepAtUtc = now.AddSeconds(1) }));
        Assert.False(Allowed(running with { LastSweepAtUtc = now.AddHours(-3) }));
        Assert.False(Allowed(running with { LastSweepAtUtc = now.AddMinutes(-11) }));
        Assert.False(Allowed(running with { LastSweepAtUtc = null }));
        Assert.False(Allowed(running with { IntervalSeconds = 0 }));
        Assert.False(Allowed(running with { IntervalSeconds = 3601 }));
        // No sweep yet is allowed only for a recently started job.
        Assert.True(Allowed(running with {
            StartedAtUtc = now.AddMinutes(-1), LastSweepAtUtc = null
        }));
    }

    [Fact]
    public void RefusesExcessiveManagementTargets()
    {
        var targets = string.Join(",", Enumerable.Range(1, 17).Select(n =>
            $$"""{"siteId":"lan","address":"10.0.0.{{n}}","approved":true}"""));
        Assert.Throws<ArgumentException>(() =>
            SnmpTargetPolicy.Parse("""{"targets":[""" + targets + "]}"));
    }
}
