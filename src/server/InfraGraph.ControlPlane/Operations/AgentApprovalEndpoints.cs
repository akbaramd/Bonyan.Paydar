using System.Security.Claims;
using System.Text.RegularExpressions;
using InfraGraph.ControlPlane.Access;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Operations;

/// <summary>
/// Administrator approval of already-issued per-device client certificates.
/// This is NOT a certificate issuer, and does not enable anonymous self-enrollment.
/// </summary>
public static class AgentApprovalEndpoints
{
    public sealed record ApproveAgentRequest(
        Guid AgentId, Guid InstallationEpoch, string SiteId, string ClientCertificateThumbprint);

    public static void MapAgentApprovalEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/admin/agents/approve", async (
            ApproveAgentRequest request, HttpContext ctx, IAntiforgery anti,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
            if (!ctx.User.IsInRole("admin")) return Results.Forbid();
            if (request.AgentId == Guid.Empty || request.InstallationEpoch == Guid.Empty ||
                !ValidSite(request.SiteId) || !ValidThumbprint(request.ClientCertificateThumbprint))
                return Results.BadRequest(new { error = "Invalid agent approval details" });

            var thumbprint = request.ClientCertificateThumbprint.ToUpperInvariant();
            if (await db.AgentInstallations.AnyAsync(
                    x => x.AgentId == request.AgentId ||
                        x.InstallationEpoch == request.InstallationEpoch ||
                        x.ClientCertificateThumbprint == thumbprint, ct))
                return Results.Conflict(new { error = "Agent identity or certificate already registered" });

            db.AgentInstallations.Add(new AgentInstallationRecord {
                AgentId = request.AgentId, InstallationEpoch = request.InstallationEpoch,
                SiteId = request.SiteId, AgentVersion = "pending",
                ClientCertificateThumbprint = thumbprint
            });
            Audit(db, ctx, request.AgentId, "agent.approve", clock.GetUtcNow());
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) {
                return Results.Conflict(new { error = "Agent approval conflicted with existing identity" });
            }
            return Results.Created($"/api/v1/agents/{request.AgentId}", new {
                request.AgentId, request.SiteId, status = "approved-awaiting-first-inventory"
            });
        }).RequireAuthorization("admin").RequireRateLimiting("write");

        app.MapPost("/api/v1/admin/agents/{id:guid}/revoke", async (
            Guid id, HttpContext ctx, IAntiforgery anti,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
            if (!ctx.User.IsInRole("admin")) return Results.Forbid();
            var record = await db.AgentInstallations.SingleOrDefaultAsync(x => x.AgentId == id, ct);
            if (record is null) return Results.NotFound();
            if (record.RevokedAtUtc is not null) return Results.NoContent();
            record.RevokedAtUtc = clock.GetUtcNow();
            Audit(db, ctx, id, "agent.revoke", record.RevokedAtUtc.Value);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization("admin").RequireRateLimiting("write");
    }

    private static bool ValidSite(string? site) =>
        !string.IsNullOrWhiteSpace(site) &&
        Regex.IsMatch(site, @"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$", RegexOptions.CultureInvariant);
    private static bool ValidThumbprint(string? value) =>
        value is { Length: 40 } &&
        Regex.IsMatch(value, @"^[0-9a-fA-F]{40}$", RegexOptions.CultureInvariant);

    private static void Audit(InfraGraphDbContext db, HttpContext ctx, Guid agent,
        string action, DateTimeOffset atUtc) =>
        db.OperatorAudit.Add(new OperatorAuditRecord {
            Id = Guid.NewGuid(), Action = action, Target = agent.ToString(),
            Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
            Success = true, AtUtc = atUtc
        });
}
