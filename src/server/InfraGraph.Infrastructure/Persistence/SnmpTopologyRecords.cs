namespace InfraGraph.Infrastructure.Persistence;

// SNMPv3 authentication and privacy passphrases are never persisted in PostgreSQL.
public sealed class ManagedNetworkDeviceRecord
{
    public required string SiteId { get; set; }
    public required string Address { get; set; }
    public string? SystemName { get; set; }
    public string? SystemDescription { get; set; }
    public string? SystemObjectId { get; set; }
    public string Kind { get; set; } = "unknown";
    public string? ChassisId { get; set; }
    public DateTimeOffset LastSeenAtUtc { get; set; }
}
public sealed class LldpNeighborRecord
{
    public Guid Id { get; set; }
    public required string SiteId { get; set; }
    public required string LocalAddress { get; set; }
    public required string LocalPort { get; set; }
    public required string RemotePort { get; set; }
    public required string RemoteChassisId { get; set; }
    public string? RemoteSystemName { get; set; }
    public DateTimeOffset ObservedAtUtc { get; set; }
}
public sealed class FdbLearnedMacRecord
{
    public Guid Id { get; set; }
    public required string SiteId { get; set; }
    public required string BridgeAddress { get; set; }
    public required string MacAddress { get; set; }
    public required string LearnedPort { get; set; }
    public DateTimeOffset ObservedAtUtc { get; set; }
}
