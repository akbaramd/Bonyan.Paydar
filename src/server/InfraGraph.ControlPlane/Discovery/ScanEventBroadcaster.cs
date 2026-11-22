using InfraGraph.ControlPlane.Hubs;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Discovery;

/// <summary>
/// PostgreSQL outbox projector. Polling is deliberately bounded, and browser
/// clients also periodically reconcile via HTTP after a missed disconnect.
/// </summary>
public sealed class ScanEventBroadcaster(
    IServiceScopeFactory scopes, IHubContext<StatusHub> hub, ILogger<ScanEventBroadcaster> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        long cursor = 0;
        var initialized = false;
        while (!stop.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
                if (!initialized)
                {
                    cursor = await db.NetworkScanEvents.AsNoTracking()
                        .MaxAsync(x => (long?)x.Id, stop) ?? 0;
                    initialized = true;
                }
                var events = await db.NetworkScanEvents.AsNoTracking()
                    .Where(x => x.Id > cursor).OrderBy(x => x.Id).Take(200)
                    .ToArrayAsync(stop);
                foreach (var item in events)
                {
                    await hub.Clients.Group("site:" + item.SiteId).SendAsync("scanEvent",
                        new { item.Id, item.SiteId, item.JobId, item.Kind, item.Address,
                            item.Status, item.ProbedCount, item.TargetCount, item.AtUtc },
                        stop);
                    cursor = item.Id;
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogWarning(ex, "Scan event projection unavailable; retrying."); }
            await Task.Delay(1000, stop);
        }
    }
}
