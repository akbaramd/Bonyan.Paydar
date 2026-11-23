using System.Security.Claims;
using InfraGraph.ControlPlane.Access;
using InfraGraph.ControlPlane.Inventory;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Operations;

/// <summary>
/// Site-scoped manual incident workflow and read-only agent registry.
/// Neither endpoint claims live monitoring, trusted alert correlation or enrollment.
/// </summary>
public static class OperationsEndpoints
{
    public sealed record CreateIncidentRequest(string SiteId, string Title, string? Description, string Severity);
    public sealed record ChangeIncidentStatusRequest(string Status);

    public static void MapOperationsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/agents/capabilities", () => Results.Ok(new {
            enrollmentEnabled = false, certificateApprovalEnabled = true, heartbeatVerified = false,
            signedUpdatesEnabled = false, status = "gateway-not-ready"
        })).RequireAuthorization();

        app.MapGet("/api/v1/agents", async (string siteId, int? page, int? pageSize,
            ClaimsPrincipal user, InfraGraphDbContext db, CancellationToken ct) =>
        {
            if (!InventoryEndpoints.CanReadSite(user, siteId)) return Results.Forbid();
            if (!ValidPage(page, pageSize)) return Results.BadRequest();
            var current = page ?? 1;
            var size = pageSize ?? 25;
            var query = db.AgentInstallations.AsNoTracking().Where(x => x.SiteId == siteId);
            var total = await query.CountAsync(ct);
            var now = DateTimeOffset.UtcNow;
            var recentAfter = now.AddMinutes(-15);
            var items = await query.OrderBy(x => x.AgentId)
                .Skip((current - 1) * size).Take(size)
                .Select(x => new { x.AgentId, x.SiteId, x.AgentVersion, x.LastReceivedAtUtc,
                    x.LastInventoryAtUtc, x.RevokedAtUtc,
                    evidenceStatus = x.RevokedAtUtc != null ? "revoked"
                        : x.LastReceivedAtUtc == null ? "pending"
                        : x.LastReceivedAtUtc >= recentAfter ? "recent" : "stale" })
                .ToArrayAsync(ct);
            return Results.Ok(new { siteId, page = current, pageSize = size, total,
                items, provenance = "registration-only-not-verified",
                monitoring = "disabled" });
        }).RequireAuthorization();

        app.MapGet("/api/v1/incidents", async (string siteId, string? status,
            int? page, int? pageSize, ClaimsPrincipal user,
            InfraGraphDbContext db, CancellationToken ct) =>
        {
            if (!InventoryEndpoints.CanReadSite(user, siteId)) return Results.Forbid();
            if (!ValidPage(page, pageSize) || status is not (null or "open" or "acknowledged" or "resolved"))
                return Results.BadRequest();
            var current = page ?? 1;
            var size = pageSize ?? 25;
            var query = db.Incidents.AsNoTracking().Where(x => x.SiteId == siteId);
            if (status is not null) query = query.Where(x => x.Status == status);
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.CreatedAtUtc)
                .ThenByDescending(x => x.Id)
                .Skip((current - 1) * size).Take(size)
                .Select(x => new {
                    x.Id, x.SiteId, x.Title, x.Description, x.Severity,
                    x.Status, x.Origin, x.CreatedBy, x.AcknowledgedBy, x.ResolvedBy,
                    x.CreatedAtUtc, x.UpdatedAtUtc
                }).ToArrayAsync(ct);
            return Results.Ok(new { siteId, page = current, pageSize = size, total, items,
                provenance = "operator-reported-unverified",
                automatedDetection = false });
        }).RequireAuthorization();

        app.MapPost("/api/v1/incidents", async (CreateIncidentRequest body,
            HttpContext ctx, IAntiforgery anti, InfraGraphDbContext db,
            TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
            if (!CanWrite(ctx.User)) return Results.Forbid();
            if (!InventoryEndpoints.CanReadSite(ctx.User, body.SiteId)) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(body.Title) || body.Title.Length > 240 ||
                body.Title.Any(char.IsControl) ||
                body.Description is { Length: > 1000 } ||
                body.Description?.Contains((char)0) == true ||
                body.Severity is not ("low" or "medium" or "high" or "critical"))
                return Results.BadRequest(new { error = "Invalid incident details" });
            var now = clock.GetUtcNow();
            var actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown";
            var incident = new OperatorIncidentRecord {
                Id = Guid.NewGuid(), SiteId = body.SiteId,
                Title = body.Title.Trim(), Description = body.Description?.Trim(),
                Severity = body.Severity, CreatedBy = actor,
                CreatedAtUtc = now, UpdatedAtUtc = now
            };
            db.Incidents.Add(incident);
            Audit(db, actor, "incident.create", incident.Id, now);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/incidents/{incident.Id}", new {
                incident.Id, incident.SiteId, incident.Title, incident.Description,
                incident.Severity, incident.Status, incident.Origin,
                incident.CreatedBy, incident.CreatedAtUtc, incident.UpdatedAtUtc
            });
        }).RequireAuthorization().RequireRateLimiting("write");

        app.MapPost("/api/v1/incidents/{id:guid}/status", async (
            Guid id, ChangeIncidentStatusRequest body, HttpContext ctx,
            IAntiforgery anti, InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
            if (!CanWrite(ctx.User)) return Results.Forbid();
            if (body.Status is not ("acknowledged" or "resolved")) return Results.BadRequest();
            var incident = await db.Incidents.FindAsync([id], ct);
            if (incident is null || !InventoryEndpoints.CanReadSite(ctx.User, incident.SiteId))
                return Results.NotFound();
            if (incident.Status == body.Status) return Results.NoContent();
            if (incident.Status == "resolved" ||
                (body.Status == "acknowledged" && incident.Status != "open"))
                return Results.Conflict(new { error = "Invalid state transition" });
            var now = clock.GetUtcNow();
            var actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown";
            incident.Status = body.Status;
            incident.UpdatedAtUtc = now;
            if (body.Status == "acknowledged") incident.AcknowledgedBy = actor;
            if (body.Status == "resolved") incident.ResolvedBy = actor;
            Audit(db, actor, "incident." + body.Status, id, now);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) {
                return Results.Conflict(new { error = "Incident was changed concurrently" });
            }
            return Results.NoContent();
        }).RequireAuthorization().RequireRateLimiting("write");
    }

    private static bool ValidPage(int? page, int? pageSize) =>
        page is null or >= 1 and <= 10000 && pageSize is null or >= 1 and <= 100;

    private static bool CanWrite(ClaimsPrincipal user) =>
        user.IsInRole("admin") || user.IsInRole("operator");

    private static void Audit(InfraGraphDbContext db, string actor, string action,
        Guid target, DateTimeOffset now) => db.OperatorAudit.Add(new OperatorAuditRecord {
            Id = Guid.NewGuid(), Actor = actor, Action = action, Target = target.ToString(),
            Success = true, AtUtc = now
        });
}