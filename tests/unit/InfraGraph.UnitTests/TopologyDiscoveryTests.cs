using InfraGraph.Modules.Topology;

namespace InfraGraph.UnitTests;

public sealed class TopologyDiscoveryTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 20, 10, 0, 0, TimeSpan.Zero);

    private static TopologyGraphEngine.Observation Obs(string a, string b, int ttl = 3600,
        string site = "alpha", string? aPort = null, string? bPort = null,
        int ageMinutes = 1) =>
        new(Guid.NewGuid(), site, a, b, aPort, bPort, "LLDP",
            Now.AddMinutes(-ageMinutes), ttl);

    [Fact]
    public void ChainIsTraversed_WithoutFalseLoop()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A"], [Obs("A","B"), Obs("B","C")], Now);
        Assert.Equal(3, graph.Nodes.Count);
        Assert.Equal(2, graph.Links.Count);
        Assert.DoesNotContain(graph.Links, x => x.PossibleCycle);
    }

    [Fact]
    public void TriangleReportsPotentialCycle_NotConfirmedForwardingLoop()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A"],
            [Obs("A","B"), Obs("B","C"), Obs("C","A")], Now);
        Assert.Equal(3, graph.Nodes.Count);
        Assert.Single(graph.Links, x => x.PossibleCycle);
    }

    [Fact]
    public void ParallelLinksAreDistinct_AndOneIsRedundant()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A"],
            [Obs("A","B",aPort:"1",bPort:"1"), Obs("A","B",aPort:"2",bPort:"2")], Now);
        Assert.Equal(2, graph.Links.Count);
        Assert.Single(graph.Links, x => x.PossibleCycle);
    }

    [Fact]
    public void MultipleSeedsDoNotMakeAnAcyclicChainLookCyclic()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A", "C"],
            [Obs("A","B"), Obs("B","C")], Now);
        Assert.DoesNotContain(graph.Links, x => x.PossibleCycle);
    }

    [Fact]
    public void ExpiredOrCrossSiteEvidenceNeverEntersCurrentGraph()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A"], [
            Obs("A", "B"), Obs("B", "C", ttl:30), Obs("B", "D", site:"beta")
        ], Now);
        Assert.Equal(2, graph.Nodes.Count);
        Assert.Equal(1, graph.StaleObservations);
        Assert.DoesNotContain(graph.Nodes, x => x.Id == "D" || x.Id == "C");
    }

    [Fact]
    public void DisconnectedComponentsRemainVisibleWhenBothAreSeeded()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A", "X"],
            [Obs("A", "B"), Obs("X", "Y")], Now);
        Assert.Equal(4, graph.Nodes.Count);
        Assert.Equal(2, graph.Links.Count);
        Assert.DoesNotContain(graph.Links, link => link.PossibleCycle);
    }

    [Fact]
    public void UnknownFocusSeedDoesNotCreatePhantomDevice()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["not-seen"],
            [Obs("A", "B")], Now);
        Assert.Empty(graph.Nodes);
        Assert.Empty(graph.Links);
    }

    [Fact]
    public void StaleOnlyEvidenceDoesNotCreatePhantomDevice()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A"],
            [Obs("A", "B", ttl: 10)], Now);
        Assert.Empty(graph.Nodes);
        Assert.Equal(1, graph.StaleObservations);
    }

    [Fact]
    public void ScopeBudgetTruncatesTraversal()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A"],
            [Obs("A","B"), Obs("B","C")], Now, maxNodes:2);
        Assert.True(graph.Truncated);
        Assert.Equal(2, graph.Nodes.Count);
    }

    [Fact]
    public async Task WalkOnlyVisitsApprovedAssetsOnceEvenWithCycles()
    {
        var reader = new FakeReader(new Dictionary<string, (string, string)[]> {
            ["A"] = [("A","B"), ("A","X")],
            ["B"] = [("B","C")],
            ["C"] = [("C","A")]
        });
        var result = await DiscoveryWalkEngine.RunAsync(
            new("alpha", new HashSet<string> { "A","B","C" }), ["A"], reader, TimeProvider.System);
        Assert.Equal(3, result.ProbedAssets);
        Assert.Equal(1, result.SkippedOutOfScope);
        Assert.Equal(3, result.Graph.Nodes.Count);
        Assert.Single(result.Graph.Links, x => x.PossibleCycle);
        Assert.Equal(3, reader.ReadCount);
    }

    [Fact]
    public async Task WalkRequiresExplicitApprovedSeed()
    {
        var reader = new FakeReader([]);
        await Assert.ThrowsAsync<ArgumentException>(() => DiscoveryWalkEngine.RunAsync(
            new("alpha", new HashSet<string> { "A" }), ["outside"], reader, TimeProvider.System));
    }

    [Fact]
    public async Task PerAssetDeadlineFailsAnUnresponsiveDeviceWithoutBlockingTheWalk()
    {
        var policy = new DiscoveryWalkPolicy("alpha", new HashSet<string> { "A" },
            PerAssetTimeout: TimeSpan.FromMilliseconds(40),
            MaxTotalDuration: TimeSpan.FromSeconds(2));
        var result = await DiscoveryWalkEngine.RunAsync(policy, ["A"],
            new BlockingReader(), TimeProvider.System);
        Assert.False(result.TimedOut);
        Assert.Equal(0, result.ProbedAssets);
        Assert.Contains("A", result.FailedAssets);
    }

    [Fact]
    public async Task TotalDeadlineMarksGraphTruncated()
    {
        var policy = new DiscoveryWalkPolicy("alpha", new HashSet<string> { "A" },
            PerAssetTimeout: TimeSpan.FromSeconds(2),
            MaxTotalDuration: TimeSpan.FromMilliseconds(40));
        var result = await DiscoveryWalkEngine.RunAsync(policy, ["A"],
            new BlockingReader(), TimeProvider.System);
        Assert.True(result.TimedOut);
        Assert.True(result.Graph.Truncated);
        Assert.Contains("A", result.FailedAssets);
    }

    [Fact]
    public async Task CallerCancellationPropagates()
    {
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(40));
        var policy = new DiscoveryWalkPolicy("alpha", new HashSet<string> { "A" },
            PerAssetTimeout: TimeSpan.FromSeconds(1));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            DiscoveryWalkEngine.RunAsync(policy, ["A"],
                new BlockingReader(), TimeProvider.System, cancellation.Token));
    }

    [Fact]
    public void ReversedNeighborEvidenceIsOneLinkWithBothEvidenceIds()
    {
        var outbound = Obs("A", "B", aPort: "1", bPort: "2");
        var inbound = Obs("B", "A", aPort: "2", bPort: "1");
        var graph = TopologyGraphEngine.Build("alpha", ["A"], [outbound, inbound], Now);
        var link = Assert.Single(graph.Links);
        Assert.Equal(2, link.EvidenceIds.Count);
        Assert.False(link.PossibleCycle);
    }

    [Fact]
    public void ExcessIndependentSeedsMarkGraphIncomplete()
    {
        var graph = TopologyGraphEngine.Build("alpha", ["A", "X"],
            [Obs("A", "B"), Obs("X", "Y")], Now, maxNodes: 1);
        Assert.True(graph.Truncated);
        Assert.Single(graph.Nodes);
    }

    [Fact]
    public async Task FanoutAndNodeBudgetsNeverSilentlyClaimCompleteDiscovery()
    {
        var reader = new FakeReader(new Dictionary<string, (string, string)[]> {
            ["A"] = [("A", "B"), ("A", "C"), ("A", "D")],
            ["B"] = [], ["C"] = [], ["D"] = []
        });
        var scope = new HashSet<string> { "A", "B", "C", "D" };
        var fanout = await DiscoveryWalkEngine.RunAsync(
            new("alpha", scope, MaxNeighborsPerNode: 1), ["A"], reader, TimeProvider.System);
        Assert.True(fanout.Graph.Truncated);
        Assert.Equal(2, fanout.Graph.Nodes.Count);
        var nodeLimit = await DiscoveryWalkEngine.RunAsync(
            new("alpha", scope, MaxNodes: 2), ["A"], reader, TimeProvider.System);
        Assert.True(nodeLimit.Graph.Truncated);
        Assert.Equal(2, nodeLimit.Graph.Nodes.Count);
    }

    [Fact]
    public async Task DepthBudgetAndReaderFailureAreShownAsPartialEvidence()
    {
        var reader = new FakeReader(new Dictionary<string, (string, string)[]> {
            ["A"] = [("A", "B")], ["B"] = [("B", "C")]
        });
        var scope = new HashSet<string> { "A", "B", "C" };
        var byDepth = await DiscoveryWalkEngine.RunAsync(
            new("alpha", scope, MaxDepth: 1), ["A"], reader, TimeProvider.System);
        Assert.True(byDepth.Graph.Truncated);
        Assert.Equal(2, byDepth.Graph.Nodes.Count);
        var failure = await DiscoveryWalkEngine.RunAsync(
            new("alpha", scope), ["A"], new FailingReader(), TimeProvider.System);
        Assert.True(failure.Graph.Truncated);
        Assert.Contains("A", failure.FailedAssets);
    }

    private sealed class FailingReader : INeighborEvidenceReader
    {
        public Task<IReadOnlyList<TopologyGraphEngine.Observation>> ReadAsync(
            string key, CancellationToken ct) => throw new InvalidOperationException("Unavailable");
    }

    private sealed class BlockingReader : INeighborEvidenceReader
    {
        public async Task<IReadOnlyList<TopologyGraphEngine.Observation>> ReadAsync(
            string assetKey, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return [];
        }
    }

    private sealed class FakeReader(Dictionary<string, (string, string)[]> entries) : INeighborEvidenceReader
    {
        public int ReadCount { get; private set; }
        public Task<IReadOnlyList<TopologyGraphEngine.Observation>> ReadAsync(
            string key, CancellationToken ct)
        {
            ReadCount++;
            var now = DateTimeOffset.UtcNow;
            IReadOnlyList<TopologyGraphEngine.Observation> observations =
                (entries.GetValueOrDefault(key) ?? [])
                .Select(e => new TopologyGraphEngine.Observation(Guid.NewGuid(), "alpha", e.Item1,
                    e.Item2, null, null, "LLDP", now, 3600)).ToArray();
            return Task.FromResult(observations);
        }
    }
}