using InfraGraph.Modules.Discovery;

namespace InfraGraph.UnitTests;

public sealed class ProbeHealthTests
{
    [Fact]
    public void FirstMissIsSuspectNotOffline()
    {
        var first = ProbeHealth.Observe("responsive", 0, false);
        Assert.Equal("suspect", first.Status);
        Assert.Equal(1, first.ConsecutiveMisses);
        Assert.Equal("host-suspect", first.EventKind);
    }

    [Fact]
    public void SecondMissChangesStateAndRepeatedMissesDoNotSpam()
    {
        var second = ProbeHealth.Observe("suspect", 1, false);
        Assert.Equal("unresponsive", second.Status);
        Assert.Equal("host-unresponsive", second.EventKind);
        var third = ProbeHealth.Observe(second.Status, second.ConsecutiveMisses, false);
        Assert.Equal("unresponsive", third.Status);
        Assert.Null(third.EventKind);
    }

    [Fact]
    public void PositiveProbeResetsMissesAndRecoversOnlyAfterStateChange()
    {
        var result = ProbeHealth.Observe("suspect", 1, true);
        Assert.Equal("responsive", result.Status);
        Assert.Equal(0, result.ConsecutiveMisses);
        Assert.Equal("host-recovered", result.EventKind);
        Assert.Null(ProbeHealth.Observe("responsive", 0, true).EventKind);
    }

    [Fact]
    public void CancelledOrDifferentJobNeverLooksFresh()
    {
        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        Assert.Equal("stale", ProbeHealth.EffectiveStatus("responsive", id,
            null, now, now, 60));
        Assert.Equal("stale", ProbeHealth.EffectiveStatus("responsive", id,
            Guid.NewGuid(), now, now, 60));
    }

    [Fact]
    public void OldAndFutureEvidenceIsStale()
    {
        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        Assert.Equal("responsive", ProbeHealth.EffectiveStatus("responsive", id, id,
            now.AddSeconds(-80), now, 30));
        Assert.Equal("stale", ProbeHealth.EffectiveStatus("responsive", id, id,
            now.AddSeconds(-91), now, 30));
        Assert.Equal("stale", ProbeHealth.EffectiveStatus("responsive", id, id,
            now.AddMinutes(2), now, 30));
    }
}
