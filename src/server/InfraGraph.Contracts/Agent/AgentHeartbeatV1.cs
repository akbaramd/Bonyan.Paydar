using System.ComponentModel.DataAnnotations;

namespace InfraGraph.Contracts.Agent;

/// <summary>Wire DTO; all fields are untrusted until Gateway authentication and validation.</summary>
public sealed record AgentHeartbeatV1(
    int ProtocolVersion,
    Guid AgentId,
    Guid InstallationEpoch,
    long Sequence,
    DateTimeOffset ObservedAtUtc,
    string AgentVersion);

public static class AgentProtocol
{
    public const int CurrentVersion = 1;
    public static bool IsCompatible(AgentHeartbeatV1 message) =>
        message.ProtocolVersion == CurrentVersion &&
        message.AgentId != Guid.Empty &&
        message.InstallationEpoch != Guid.Empty &&
        message.Sequence >= 0 &&
        !string.IsNullOrWhiteSpace(message.AgentVersion) &&
        message.AgentVersion.Length <= 64;
}
