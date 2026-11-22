namespace InfraGraph.Modules.Discovery;

/// <summary>
/// Probe evidence is not host health. A first miss is only suspect, and an
/// unmonitored host becomes stale rather than remaining falsely online.
/// </summary>
public static class ProbeHealth
{
    public const int MissesUntilUnresponsive = 2;

    public sealed record Result(string Status, int ConsecutiveMisses, string? EventKind);

    public static Result Observe(string previousStatus, int previousMisses, bool responded)
    {
        if (previousStatus is not ("responsive" or "suspect" or "unresponsive"))
            throw new ArgumentException("Invalid persisted probe state.", nameof(previousStatus));
        if (previousMisses < 0)
            throw new ArgumentOutOfRangeException(nameof(previousMisses));

        if (responded)
            return new Result("responsive", 0,
                previousStatus == "responsive" ? null : "host-recovered");

        var misses = Math.Min(previousMisses + 1, MissesUntilUnresponsive);
        var status = misses >= MissesUntilUnresponsive ? "unresponsive" : "suspect";
        var kind = previousStatus == status ? null
            : status == "suspect" ? "host-suspect" : "host-unresponsive";
        return new Result(status, misses, kind);
    }

    public static string EffectiveStatus(string storedStatus, Guid hostJobId,
        Guid? activeJobId, DateTimeOffset lastProbe, DateTimeOffset now, int intervalSeconds)
    {
        if (activeJobId is null || hostJobId != activeJobId ||
            intervalSeconds is < 30 or > 3600 ||
            lastProbe > now.AddSeconds(5) ||
            now - lastProbe > TimeSpan.FromSeconds(Math.Max(90, 2L * intervalSeconds + 30)))
            return "stale";
        return storedStatus;
    }
}
