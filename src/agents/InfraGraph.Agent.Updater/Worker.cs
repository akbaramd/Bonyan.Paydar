namespace InfraGraph.Agent.Updater;

/// <summary>
/// Reserved for signed, rollback-capable updates. No binary downloads or
/// privileged installation happen until publisher verification is implemented.
/// </summary>
public sealed class Worker(ILogger<Worker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Paydar updater is disabled until signed-update verification and rollback are tested.");
        await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
    }
}
