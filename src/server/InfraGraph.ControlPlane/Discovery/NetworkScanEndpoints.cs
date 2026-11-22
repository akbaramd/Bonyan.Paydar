using System.Security.Claims;
using System.Text.Json;
using InfraGraph.ControlPlane.Access;
using InfraGraph.Infrastructure.Persistence;
using InfraGraph.Modules.Discovery;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Discovery;

public static class NetworkScanEndpoints
{
    public sealed record StartScanRequest(string SiteId, string[] Cidrs,
        int IntervalSeconds = 60, bool Approved = false);

    private static bool CanRead(ClaimsPrincipal user, string? site) =>
        !string.IsNullOrWhiteSpace(site) && site.Length <= 120 &&
        (user.IsInRole("admin") || user.FindFirstValue("site") == site);

    public static void MapNetworkScanEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/discovery/scans", async (
            StartScanRequest body, HttpContext ctx, IAntiforgery anti,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti))
                return Results.BadRequest(new { error = "Invalid CSRF token." });
            if (!ctx.User.IsInRole("admin") || !CanRead(ctx.User, body.SiteId))
                return Results.Forbid();
            if (!body.Approved)
                return Results.BadRequest(new { error = "Explicit network-scope approval is required." });
            if (body.IntervalSeconds is < 30 or > 3600)
                return Results.BadRequest(new { error = "Scan interval must be 30–3600 seconds." });
            IReadOnlyList<System.Net.IPAddress> targets;
            try { targets = Ipv4ScanPlanner.Plan(body.Cidrs); }
            catch (ArgumentException ex) { return Results.BadRequest(new { error = ex.Message }); }
            if (await db.NetworkScanJobs.AnyAsync(x => x.SiteId == body.SiteId &&
                (x.Status == "pending" || x.Status == "running" || x.Status == "cancelling"), ct))
                return Results.Conflict(new { error = "A scan is already active for this site." });

            var job = new NetworkScanJobRecord {
                Id = Guid.NewGuid(), SiteId = body.SiteId,
                Cidrs = JsonSerializer.Serialize(body.Cidrs),
                Status = "pending", TargetCount = targets.Count,
                IntervalSeconds = body.IntervalSeconds,
                RequestedBy = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
                RequestedAtUtc = clock.GetUtcNow()
            };
            db.NetworkScanJobs.Add(job);
            db.OperatorAudit.Add(new OperatorAuditRecord {
                Id = Guid.NewGuid(), Actor = job.RequestedBy,
                Action = "discovery.scan.start", Target = job.Id.ToString(),
                Success = true, AtUtc = job.RequestedAtUtc
            });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new {
                error = "Scan could not be queued; scope or active-job constraint."
            }); }
            return Results.Created($"/api/v1/discovery/scans/{job.Id}",
                new { job.Id, job.SiteId, job.Status, job.TargetCount, job.IntervalSeconds });
        }).RequireAuthorization().RequireRateLimiting("write");

        app.MapGet("/api/v1/discovery/scans", async (
            string siteId, ClaimsPrincipal user, InfraGraphDbContext db, CancellationToken ct) =>
        {
            if (!CanRead(user, siteId)) return Results.Forbid();
            var jobs = await db.NetworkScanJobs.AsNoTracking().Where(x => x.SiteId == siteId)
                .OrderByDescending(x => x.RequestedAtUtc).Take(20).ToArrayAsync(ct);
            return Results.Ok(new { siteId, items = jobs.Select(x => new {
                x.Id, x.Status, cidrs = JsonSerializer.Deserialize<string[]>(x.Cidrs),
                x.IntervalSeconds, x.TargetCount, x.ProbedCount, x.ResponsiveCount,
                x.Cycle, x.RequestedAtUtc, x.StartedAtUtc, x.LastSweepAtUtc,
                x.CompletedAtUtc, x.Error
            }) });
        }).RequireAuthorization();

        app.MapGet("/api/v1/discovery/hosts", async (
            string siteId, ClaimsPrincipal user, InfraGraphDbContext db,
            TimeProvider clock, CancellationToken ct) =>
        {
            if (!CanRead(user, siteId)) return Results.Forbid();
            var items = await db.NetworkScanHosts.AsNoTracking().Where(x => x.SiteId == siteId)
                .OrderBy(x => x.Address).Take(1025).ToArrayAsync(ct);
            var active = await db.NetworkScanJobs.AsNoTracking()
                .Where(x => x.SiteId == siteId && x.Status == "running")
                .Select(x => new { x.Id, x.IntervalSeconds }).SingleOrDefaultAsync(ct);
            var now = clock.GetUtcNow();
            if (items.Length > 1024)
                return Results.Problem("Host result cap exceeded.", statusCode: 422);
            return Results.Ok(new { siteId, items = items.Select(x => new {
                x.Id, x.Address,
                status = ProbeHealth.EffectiveStatus(x.Status, x.LastJobId,
                    active?.Id, x.LastProbedAtUtc, now, active?.IntervalSeconds ?? 0),
                x.ConsecutiveMisses, x.IcmpResponded,
                tcpPorts = x.TcpPorts.Length == 0 ? Array.Empty<int>() :
                    x.TcpPorts.Split(',').Select(int.Parse).ToArray(),
                x.LastSeenAtUtc, x.LastProbedAtUtc, x.LastJobId,
                provenance = "active-ipv4-probe"
            }) });
        }).RequireAuthorization();

        app.MapGet("/api/v1/discovery/scans/{id:guid}/events", async (
            Guid id, long? afterId, ClaimsPrincipal user, InfraGraphDbContext db, CancellationToken ct) =>
        {
            var job = await db.NetworkScanJobs.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (job is null || !CanRead(user, job.SiteId)) return Results.NotFound();
            if (afterId is < 0) return Results.BadRequest();
            var rows = await db.NetworkScanEvents.AsNoTracking()
                .Where(x => x.JobId == id && x.Id > (afterId ?? 0))
                .OrderBy(x => x.Id).Take(201).ToArrayAsync(ct);
            return Results.Ok(new { items = rows.Take(200).Select(x => new {
                x.Id, x.SiteId, x.JobId, x.Kind, x.Address, x.Status,
                x.ProbedCount, x.TargetCount, x.AtUtc
            }), truncated = rows.Length > 200 });
        }).RequireAuthorization();

        app.MapPost("/api/v1/discovery/scans/{id:guid}/cancel", async (
            Guid id, HttpContext ctx, IAntiforgery anti, InfraGraphDbContext db,
            TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
            if (!ctx.User.IsInRole("admin")) return Results.Forbid();
            var job = await db.NetworkScanJobs.FindAsync([id], ct);
            if (job is null || !CanRead(ctx.User, job.SiteId)) return Results.NotFound();
            if (job.Status is "cancelled" or "failed") return Results.NoContent();
            job.Status = "cancelling";
            db.OperatorAudit.Add(new OperatorAuditRecord {
                Id = Guid.NewGuid(), Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
                Action = "discovery.scan.cancel", Target = id.ToString(),
                Success = true, AtUtc = clock.GetUtcNow()
            });
            await db.SaveChangesAsync(ct);
            return Results.Accepted();
        }).RequireAuthorization().RequireRateLimiting("write");
    }
}