using InfraGraph.Contracts.Agent;

namespace InfraGraph.ContractTests;

public class AgentProtocolTests
{
    [Fact]
    public void VersionOneWithIdentity_IsCompatible()
    {
        var message = new AgentHeartbeatV1(1, Guid.NewGuid(), Guid.NewGuid(), 10, DateTimeOffset.UtcNow, "0.1.0");
        Assert.True(AgentProtocol.IsCompatible(message));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public void WrongProtocolVersion_IsRejected(int version)
    {
        var message = new AgentHeartbeatV1(version, Guid.NewGuid(), Guid.NewGuid(), 1, DateTimeOffset.UtcNow, "0.1.0");
        Assert.False(AgentProtocol.IsCompatible(message));
    }

    [Fact]
    public void MissingIdentity_IsRejected()
    {
        var message = new AgentHeartbeatV1(1, Guid.Empty, Guid.NewGuid(), 1, DateTimeOffset.UtcNow, "0.1.0");
        Assert.False(AgentProtocol.IsCompatible(message));
    }
}
