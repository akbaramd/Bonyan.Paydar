using System.Security.Claims;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Access;

/// <summary>Administrator-only role/site rotation with immediate cookie revocation.</summary>
public static class OperatorAccessEndpoints
{
    public sealed record UpdateAccessRequest(string Role, string? SiteId);

    public static void MapOperatorAccessEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/admin/users/{id:guid}/access", async (
            Guid id, UpdateAccessRequest body, HttpContext ctx, IAntiforgery anti,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
            if (id.ToString() == ctx.User.FindFirstValue(ClaimTypes.NameIdentifier))
                return Results.BadRequest(new { error = "Self role changes are not allowed." });
            if (body.Role is not ("admin" or "operator" or "viewer") ||
                (body.Role != "admin" &&
                    (string.IsNullOrWhiteSpace(body.SiteId) || body.SiteId.Length > 120)) ||
                body.SiteId is { Length: > 120 })
                return Results.BadRequest(new { error = "Role and site scope are invalid." });
            var item = await db.Operators.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            item.Role = body.Role;
            item.SiteId = body.Role == "admin" ? null : body.SiteId;
            item.SecurityStamp = Guid.NewGuid(); // No old cookie may retain previous site permissions.
            db.OperatorAudit.Add(new OperatorAuditRecord {
                Id = Guid.NewGuid(), Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
                Action = "access.scope.change", Target = item.Email,
                Success = true, AtUtc = clock.GetUtcNow()
            });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization(AccessEndpoints.AdminPolicy).RequireRateLimiting("write");
    }
}
