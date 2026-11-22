namespace InfraGraph.Infrastructure.Persistence;

public sealed class NetworkScanJobRecord
{
    public Guid Id { get; set; }
    public required string SiteId { get; set; }
    public required string Cidrs { get; set; } // JSON serialized array, validated at creation.
    public required string Status { get; set; } // pending|running|cancelling|cancelled|failed
    public int IntervalSeconds { get; set; }
    public int TargetCount { get; set; }
    public int ProbedCount { get; set; }
    public int ResponsiveCount { get; set; }
    public int Cycle { get; set; }
    public required string RequestedBy { get; set; }
    public DateTimeOffset RequestedAtUtc { get; set; }
    public DateTimeOffset? StartedAtUtc { get; set; }
    public DateTimeOffset? LastSweepAtUtc { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }
    public string? Error { get; set; }
}

public sealed class NetworkScanHostRecord
{
    public Guid Id { get; set; }
    public required string SiteId { get; set; }
    public required string Address { get; set; }
    public required string Status { get; set; } // responsive|suspect|unresponsive; not device health.
    public int ConsecutiveMisses { get; set; }
    public bool IcmpResponded { get; set; }
    public required string TcpPorts { get; set; }
    public DateTimeOffset LastProbedAtUtc { get; set; }
    public DateTimeOffset LastSeenAtUtc { get; set; }
    public Guid LastJobId { get; set; }
}

public sealed class NetworkScanEventRecord
{
    public long Id { get; set; }
    public required string SiteId { get; set; }
    public Guid JobId { get; set; }
    public required string Kind { get; set; }
    public string? Address { get; set; }
    public string? Status { get; set; }
    public int ProbedCount { get; set; }
    public int TargetCount { get; set; }
    public DateTimeOffset AtUtc { get; set; }
}