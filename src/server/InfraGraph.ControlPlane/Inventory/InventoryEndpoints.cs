using System.Security.Claims;
using System.Text.Json;
using InfraGraph.Contracts.Agents;
using InfraGraph.ControlPlane.Access;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Inventory;

/// <summary>
/// Explicitly entered inventory only. Does not imply discovered, monitored or healthy.
/// Every request is filtered by authenticated site scope on the server.
/// </summary>
public static class InventoryEndpoints
{
    public sealed record CreateAssetRequest(string SiteId, string DisplayName);

    public static bool CanReadSite(ClaimsPrincipal principal, string? siteId) =>
        !string.IsNullOrWhiteSpace(siteId) && siteId.Length <= 120 &&
        (principal.IsInRole("admin") || principal.FindFirstValue("site") == siteId);

    public static void MapInventoryEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/sites", async (ClaimsPrincipal user, InfraGraphDbContext db, CancellationToken ct) =>
        {
            if (!user.IsInRole("admin"))
                return Results.Ok(new { sites = new[] { user.FindFirstValue("site")! } });
            var inventory = await db.Assets.AsNoTracking().Select(x => x.SiteId)
                .Distinct().Take(500).ToListAsync(ct);
            var agentSites = await db.AgentInventories.AsNoTracking().Select(x => x.SiteId).Distinct().Take(500).ToListAsync(ct);
            var evidence = await db.DiscoveryObservations.AsNoTracking().Select(x => x.SiteId)
                .Distinct().Take(500).ToListAsync(ct);
            // A scan-only site is still a real workspace and must remain selectable.
            var scanSites = await db.NetworkScanJobs.AsNoTracking().Select(x => x.SiteId)
                .Distinct().Take(500).ToListAsync(ct);
            // Operators can be assigned a site before that site contains assets or links.
            var assigned = await db.Operators.AsNoTracking().Where(x => x.SiteId != null)
                .Select(x => x.SiteId!).Distinct().Take(500).ToListAsync(ct);
            return Results.Ok(new { sites = inventory.Concat(agentSites).Concat(evidence).Concat(scanSites).Concat(assigned)
                .Distinct(StringComparer.Ordinal).OrderBy(x => x, StringComparer.Ordinal).Take(500).ToArray() });
        }).RequireAuthorization();

        // One-Agent details for a helpdesk operator. Cross-site IDs remain hidden.
        app.MapGet("/api/v1/agents/{id:guid}/inventory", async (Guid id,
            ClaimsPrincipal user, InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var row = await db.AgentInventories.AsNoTracking().SingleOrDefaultAsync(
                x => x.AgentId == id, ct);
            if (row is null || !CanReadSite(user, row.SiteId)) return Results.NotFound();
            AgentInventoryV1? inventory;
            try {
                inventory = JsonSerializer.Deserialize<AgentInventoryV1>(
                    row.Snapshot, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            }
            catch (JsonException) {
                return Results.Problem("Stored inventory is unreadable.", statusCode: 500);
            }
            if (inventory is null) return Results.Problem("Stored inventory is empty.", statusCode: 500);
            return Results.Ok(new {
                row.AgentId, row.SiteId, inventory, row.CollectedAtUtc, row.ReceivedAtUtc,
                evidenceStatus = row.ReceivedAtUtc >= clock.GetUtcNow().AddMinutes(-15)
                    ? "recent" : "stale",
                provenance = "agent-self-reported"
            });
        }).RequireAuthorization();

        app.MapGet("/api/v1/agents/inventory", async (string siteId, ClaimsPrincipal user,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!CanReadSite(user, siteId)) return Results.Forbid();
            var rows = await db.AgentInventories.AsNoTracking().Where(x => x.SiteId == siteId)
                .OrderByDescending(x => x.ReceivedAtUtc).Take(501).ToArrayAsync(ct);
            if (rows.Length > 500) return Results.Problem("Agent inventory cap exceeded.", statusCode: 422);
            return Results.Ok(new {
                siteId, items = rows.Select(x => {
                    AgentInventoryV1? report = null;
                    try { report = JsonSerializer.Deserialize<AgentInventoryV1>(x.Snapshot, new JsonSerializerOptions(JsonSerializerDefaults.Web)); }
                    catch (JsonException) { }
                    return new { x.AgentId, x.ReceivedAtUtc, x.CollectedAtUtc, inventory = report,
                        status = x.ReceivedAtUtc < clock.GetUtcNow().AddMinutes(-15) ? "stale" : "recent",
                        provenance = "agent-self-reported" };
                }).ToArray()
            });
        }).RequireAuthorization();

        app.MapGet("/api/v1/assets", async (string siteId, string? search, int? page, int? pageSize,
            ClaimsPrincipal user, InfraGraphDbContext db, CancellationToken ct) =>
        {
            if (!CanReadSite(user, siteId)) return Results.Forbid();
            if (page is < 1 or > 10000 || pageSize is < 1 or > 100 ||
                search is { Length: > 100 }) return Results.BadRequest();
            var currentPage = page ?? 1;
            var size = pageSize ?? 25;
            var query = db.Assets.AsNoTracking().Where(x => x.SiteId == siteId);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(x => x.DisplayName != null && x.DisplayName.Contains(search));
            var total = await query.CountAsync(ct);
            var rows = await query.OrderBy(x => x.DisplayName).ThenBy(x => x.Id)
                .Skip((currentPage - 1) * size).Take(size)
                .Select(x => new { x.Id, x.DisplayName, x.SiteId, x.CreatedAtUtc })
                .ToArrayAsync(ct);
            return Results.Ok(new { siteId, page = currentPage, pageSize = size, total,
                items = rows, provenance = "operator-registered-unverified" });
        }).RequireAuthorization();

        app.MapGet("/api/v1/assets/{id:guid}", async (Guid id, ClaimsPrincipal user,
            InfraGraphDbContext db, CancellationToken ct) =>
        {
            var asset = await db.Assets.AsNoTracking()
                .Where(x => x.Id == id)
                .Select(x => new { x.Id, x.DisplayName, x.SiteId, x.CreatedAtUtc })
                .FirstOrDefaultAsync(ct);
            // A cross-site identifier must be indistinguishable from a missing asset.
            if (asset is null || !CanReadSite(user, asset.SiteId)) return Results.NotFound();
            return Results.Ok(new { asset.Id, asset.DisplayName, asset.SiteId, asset.CreatedAtUtc,
                provenance = "operator-registered-unverified" });
        }).RequireAuthorization();

        app.MapPost("/api/v1/assets", async (CreateAssetRequest body, HttpContext ctx,
            IAntiforgery anti, InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest(new { error = "Invalid CSRF token" });
            if (!ctx.User.IsInRole("admin") && !ctx.User.IsInRole("operator")) return Results.Forbid();
            if (!CanReadSite(ctx.User, body.SiteId) ||
                string.IsNullOrWhiteSpace(body.DisplayName) ||
                body.DisplayName.Length > 240 || body.DisplayName.Any(char.IsControl))
                return Results.BadRequest(new { error = "Invalid or unauthorized asset" });
            var now = clock.GetUtcNow();
            var asset = new AssetRecord { Id = Guid.NewGuid(), SiteId = body.SiteId,
                DisplayName = body.DisplayName.Trim(), CreatedAtUtc = now };
            db.Assets.Add(asset);
            db.OperatorAudit.Add(new OperatorAuditRecord {
                Id = Guid.NewGuid(), Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
                Action = "inventory.register", Target = asset.Id.ToString(), Success = true, AtUtc = now
            });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/assets/{asset.Id}",
                new { asset.Id, asset.DisplayName, asset.SiteId, asset.CreatedAtUtc,
                    provenance = "operator-registered-unverified" });
        }).RequireAuthorization().RequireRateLimiting("write");

        app.MapGet("/api/v1/overview/summary", async (string siteId, ClaimsPrincipal user,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!CanReadSite(user, siteId)) return Results.Forbid();
            var now = clock.GetUtcNow();
            var assets = await db.Assets.AsNoTracking().CountAsync(x => x.SiteId == siteId, ct);
            var observations = await db.DiscoveryObservations.AsNoTracking()
                .Where(x => x.SiteId == siteId && x.RetractedAtUtc == null &&
                    x.ObservedAtUtc <= now && x.ObservedAtUtc > now.AddDays(-1))
                .Select(x => new { x.ObservedAtUtc, x.TtlSeconds })
                .Take(10001).ToArrayAsync(ct);
            if (observations.Length > 10000)
                return Results.Problem("Observation budget exceeded.", statusCode: 422);
            var fresh = observations.Count(x => x.TtlSeconds > 0 &&
                now - x.ObservedAtUtc <= TimeSpan.FromSeconds(x.TtlSeconds));
            var scannedHosts = await db.NetworkScanHosts.AsNoTracking()
                .CountAsync(x => x.SiteId == siteId, ct);
            var activeScan = await db.NetworkScanJobs.AsNoTracking()
                .Where(x => x.SiteId == siteId && x.Status == "running")
                .Select(x => new { x.Id, x.IntervalSeconds, x.LastSweepAtUtc })
                .SingleOrDefaultAsync(ct);
            var respondingNow = 0;
            if (activeScan is not null)
            {
                var validAfter = now.AddSeconds(-Math.Max(90L,
                    2L * activeScan.IntervalSeconds + 30));
                respondingNow = await db.NetworkScanHosts.AsNoTracking().CountAsync(
                    x => x.SiteId == siteId && x.LastJobId == activeScan.Id &&
                        x.LastProbedAtUtc >= validAfter &&
                        x.Status == "responsive", ct);
            }
            return Results.Ok(new { siteId, registeredAssets = assets,
                freshReportedObservations = fresh, scannedHosts, respondingNow,
                scanActive = activeScan is not null,
                lastSweepAtUtc = activeScan?.LastSweepAtUtc,
                observedAtUtc = now,
                status = activeScan is null ? "unverified-no-active-monitoring"
                    : "active-ipv4-probing" });
        }).RequireAuthorization();
    }
}