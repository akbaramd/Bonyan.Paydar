using System.Security.Claims;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using InfraGraph.ControlPlane.Access;

namespace InfraGraph.ControlPlane.Access;

/// <summary>Credential rotation always invalidates previously issued sessions.</summary>
public static class AccountEndpoints
{
    public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
    public sealed record ResetPasswordRequest(string NewPassword);

    public static void MapAccountEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/password", ChangeOwnPassword).RequireAuthorization()
            .RequireRateLimiting("login");
        app.MapPost("/api/v1/admin/users/{id:guid}/reset-password", ResetPassword)
            .RequireAuthorization(AccessEndpoints.AdminPolicy).RequireRateLimiting("write");
        app.MapPost("/api/v1/admin/users/{id:guid}/enable", Enable)
            .RequireAuthorization(AccessEndpoints.AdminPolicy).RequireRateLimiting("write");
    }

    private static async Task<IResult> ChangeOwnPassword(ChangePasswordRequest body, HttpContext ctx,
        IAntiforgery anti, InfraGraphDbContext db, IPasswordHasher<OperatorRecord> hasher,
        TimeProvider time, CancellationToken ct)
    {
        if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest(new { error = "Invalid CSRF token" });
        if (!AccessEndpoints.ValidPassword(body.NewPassword) ||
            string.Equals(body.CurrentPassword, body.NewPassword, StringComparison.Ordinal))
            return Results.BadRequest(new { error = "New password must be different and 14-256 characters." });
        if (!Guid.TryParse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
            return Results.Unauthorized();
        var user = await db.Operators.SingleOrDefaultAsync(x => x.Id == id && x.IsActive, ct);
        if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, body.CurrentPassword)
            == PasswordVerificationResult.Failed) return Results.Unauthorized();
        user.PasswordHash = hasher.HashPassword(user, body.NewPassword);
        user.SecurityStamp = Guid.NewGuid();
        user.FailedLogins = 0;
        user.LockedUntilUtc = null;
        db.OperatorAudit.Add(new OperatorAuditRecord { Id = Guid.NewGuid(),
            Actor = user.Email, Action = "access.password.change", Target = user.Email,
            Success = true, AtUtc = time.GetUtcNow() });
        await db.SaveChangesAsync(ct);
        await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.NoContent();
    }

    private static async Task<IResult> ResetPassword(Guid id, ResetPasswordRequest body,
        HttpContext ctx, IAntiforgery anti, InfraGraphDbContext db,
        IPasswordHasher<OperatorRecord> hasher, TimeProvider time, CancellationToken ct)
    {
        if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
        if (!AccessEndpoints.ValidPassword(body.NewPassword)) return Results.BadRequest();
        var target = await db.Operators.FindAsync([id], ct);
        if (target is null) return Results.NotFound();
        target.PasswordHash = hasher.HashPassword(target, body.NewPassword);
        target.SecurityStamp = Guid.NewGuid();
        target.FailedLogins = 0;
        target.LockedUntilUtc = null;
        Audit(ctx, db, "access.password.reset", target.Email, time.GetUtcNow());
        await db.SaveChangesAsync(ct);
        if (ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) == id.ToString())
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.NoContent();
    }

    private static async Task<IResult> Enable(Guid id, HttpContext ctx,
        IAntiforgery anti, InfraGraphDbContext db, TimeProvider time, CancellationToken ct)
    {
        if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
        var target = await db.Operators.FindAsync([id], ct);
        if (target is null) return Results.NotFound();
        target.IsActive = true;
        target.SecurityStamp = Guid.NewGuid();
        target.LockedUntilUtc = null;
        target.FailedLogins = 0;
        Audit(ctx, db, "access.enable", target.Email, time.GetUtcNow());
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static void Audit(HttpContext ctx, InfraGraphDbContext db, string action,
        string target, DateTimeOffset when) => db.OperatorAudit.Add(new OperatorAuditRecord {
            Id = Guid.NewGuid(), Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
            Action = action, Target = target, AtUtc = when, Success = true
        });
}
