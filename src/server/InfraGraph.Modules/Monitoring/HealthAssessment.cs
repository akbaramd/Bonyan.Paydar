namespace InfraGraph.Modules.Monitoring;

public enum HealthState
{
    Unknown,
    Healthy,
    Degraded,
    DownConfirmed,
    Stale,
    Maintenance
}

/// <summary>Heartbeat silence is not proof that a computer is powered off.</summary>
public static class HealthAssessment
{
    public static HealthState FromHeartbeat(
        DateTimeOffset? lastReceivedAtUtc,
        DateTimeOffset nowUtc,
        TimeSpan freshnessWindow,
        bool observerAvailable,
        bool maintenance = false)
    {
        if (freshnessWindow <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(freshnessWindow));
        if (maintenance) return HealthState.Maintenance;
        if (!observerAvailable) return HealthState.Unknown;
        if (lastReceivedAtUtc is null) return HealthState.Unknown;
        return nowUtc - lastReceivedAtUtc.Value > freshnessWindow
            ? HealthState.Stale
            : HealthState.Healthy;
    }
}
