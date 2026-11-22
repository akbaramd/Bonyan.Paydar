using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using InfraGraph.Infrastructure.Persistence;

namespace InfraGraph.ControlPlane.Access;

public static class AccessEndpoints
{
    public const string AdminPolicy = "admin";
    public sealed record LoginRequest(string Email, string Password);
    public sealed record CreateOperatorRequest(string Email, string Password, string Role, string? SiteId);

    public static void MapAccessEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/auth/csrf", (HttpContext ctx, IAntiforgery anti) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { token = anti.GetAndStoreTokens(ctx).RequestToken });
        });
        app.MapPost("/api/v1/auth/login", Login).RequireRateLimiting("login");
        app.MapPost("/api/v1/auth/logout", Logout).RequireAuthorization();
        app.MapGet("/api/v1/auth/me", (ClaimsPrincipal user) =>
            Results.Ok(new { id = user.FindFirstValue(ClaimTypes.NameIdentifier),
                email = user.FindFirstValue(ClaimTypes.Email), role = user.FindFirstValue(ClaimTypes.Role),
                siteId = user.FindFirstValue("site") })).RequireAuthorization();
        app.MapGet("/api/v1/admin/users", async (InfraGraphDbContext db, CancellationToken ct) =>
            Results.Ok(await db.Operators.AsNoTracking().OrderBy(x => x.Email)
                .Select(x => new { x.Id, x.Email, x.Role, x.SiteId, x.IsActive, x.CreatedAtUtc })
                .Take(500).ToListAsync(ct))).RequireAuthorization(AdminPolicy);
        app.MapGet("/api/v1/admin/audit", async (int? page, int? pageSize,
            InfraGraphDbContext db, CancellationToken ct) =>
        {
            if (page is < 1 or > 10000 || pageSize is < 1 or > 100)
                return Results.BadRequest();
            var current = page ?? 1;
            var size = pageSize ?? 25;
            var query = db.OperatorAudit.AsNoTracking();
            var total = await query.CountAsync(ct);
            var rows = await query.OrderByDescending(x => x.AtUtc).ThenByDescending(x => x.Id)
                .Skip((current - 1) * size).Take(size)
                .Select(x => new { x.Id, x.Actor, x.Action, x.Target, x.Success, x.AtUtc })
                .ToArrayAsync(ct);
            return Results.Ok(new { page = current, pageSize = size, total, items = rows });
        }).RequireAuthorization(AdminPolicy);
        app.MapPost("/api/v1/admin/users", CreateOperator).RequireAuthorization(AdminPolicy).RequireRateLimiting("write");
        app.MapPost("/api/v1/admin/users/{id:guid}/disable", DisableOperator).RequireAuthorization(AdminPolicy).RequireRateLimiting("write");
    }

    public static string? NormalizeEmail(string? email)
    {
        var value = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(value) || value.Length > 254 || value.Any(char.IsWhiteSpace) ||
            !System.Net.Mail.MailAddress.TryCreate(value, out var parsed) ||
            parsed.Address != value) return null;
        return value;
    }

    public static bool ValidPassword(string? password) => password is { Length: >= 14 and <= 256 };

    private static async Task<IResult> Login(LoginRequest body, HttpContext ctx, IAntiforgery anti,
        InfraGraphDbContext db, IPasswordHasher<OperatorRecord> hasher, TimeProvider clock, CancellationToken ct)
    {
        if (!await SafeCsrf(ctx, anti)) return Results.BadRequest(new { error = "Invalid CSRF token" });
        var email = NormalizeEmail(body.Email);
        if (email is null || body.Password is not { Length: > 0 and <= 256 })
            return Results.Unauthorized();
        var record = await db.Operators.SingleOrDefaultAsync(x => x.Email == email, ct);
        var now = clock.GetUtcNow();
        var ok = false;
        if (record is { IsActive: true } && (record.LockedUntilUtc is null || record.LockedUntilUtc <= now))
        {
            if (record.LockedUntilUtc <= now) { record.LockedUntilUtc = null; record.FailedLogins = 0; }
            var result = hasher.VerifyHashedPassword(record, record.PasswordHash, body.Password);
            ok = result != PasswordVerificationResult.Failed;
            if (ok)
            {
                record.FailedLogins = 0;
                if (result == PasswordVerificationResult.SuccessRehashNeeded)
                    record.PasswordHash = hasher.HashPassword(record, body.Password);
            }
            else
            {
                record.FailedLogins++;
                if (record.FailedLogins >= 5)
                    record.LockedUntilUtc = now.AddMinutes(15);
            }
        }
        db.OperatorAudit.Add(new OperatorAuditRecord { Id = Guid.NewGuid(), Actor = email,
            Target = email, Action = "auth.login", Success = ok, AtUtc = now });
        await db.SaveChangesAsync(ct);
        if (!ok || record is null) return Results.Unauthorized();
        var claims = new List<Claim> {
            new(ClaimTypes.NameIdentifier, record.Id.ToString()),
            new(ClaimTypes.Email, record.Email),
            new(ClaimTypes.Role, record.Role),
            new("stamp", record.SecurityStamp.ToString())
        };
        if (record.SiteId is not null) claims.Add(new Claim("site", record.SiteId));
        await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)),
            new AuthenticationProperties { IsPersistent = false, ExpiresUtc = now.AddHours(8), AllowRefresh = false });
        return Results.Ok(new { record.Id, record.Email, record.Role, record.SiteId });
    }

    private static async Task<IResult> Logout(HttpContext ctx, IAntiforgery anti)
    {
        if (!await SafeCsrf(ctx, anti)) return Results.BadRequest();
        await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.NoContent();
    }

    private static async Task<IResult> CreateOperator(CreateOperatorRequest body, HttpContext ctx,
        IAntiforgery anti, InfraGraphDbContext db, IPasswordHasher<OperatorRecord> hasher,
        TimeProvider clock, CancellationToken ct)
    {
        if (!await SafeCsrf(ctx, anti)) return Results.BadRequest();
        var email = NormalizeEmail(body.Email);
        if (email is null || !ValidPassword(body.Password) ||
            body.Role is not ("admin" or "operator" or "viewer") ||
            (body.Role != "admin" && (string.IsNullOrWhiteSpace(body.SiteId) || body.SiteId.Length > 120)) ||
            (body.SiteId is { Length: > 120 }))
            return Results.BadRequest(new { error = "Invalid operator details" });
        if (await db.Operators.AnyAsync(x => x.Email == email, ct))
            return Results.Conflict(new { error = "Operator exists" });
        var item = new OperatorRecord { Id = Guid.NewGuid(), Email = email,
            Role = body.Role, SiteId = body.Role == "admin" ? null : body.SiteId,
            PasswordHash = "", CreatedAtUtc = clock.GetUtcNow() };
        item.PasswordHash = hasher.HashPassword(item, body.Password);
        db.Operators.Add(item);
        db.OperatorAudit.Add(new OperatorAuditRecord { Id = Guid.NewGuid(),
            Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
            Action = "access.create", Target = email, Success = true, AtUtc = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/admin/users/{item.Id}", new { item.Id, item.Email, item.Role, item.SiteId });
    }

    private static async Task<IResult> DisableOperator(Guid id, HttpContext ctx, IAntiforgery anti,
        InfraGraphDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (!await SafeCsrf(ctx, anti)) return Results.BadRequest();
        if (ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) == id.ToString())
            return Results.BadRequest(new { error = "Cannot disable self" });
        var target = await db.Operators.FindAsync([id], ct);
        if (target is null) return Results.NotFound();
        target.IsActive = false;
        target.SecurityStamp = Guid.NewGuid();
        db.OperatorAudit.Add(new OperatorAuditRecord { Id = Guid.NewGuid(),
            Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
            Action = "access.disable", Target = target.Email, Success = true, AtUtc = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    public static async Task<bool> SafeCsrf(HttpContext ctx, IAntiforgery anti)
    {
        try { await anti.ValidateRequestAsync(ctx); return true; }
        catch (AntiforgeryValidationException) { return false; }
    }
}

public static class AdminSeed
{
    public static async Task RunAsync(IServiceProvider provider)
    {
        var email = AccessEndpoints.NormalizeEmail(Environment.GetEnvironmentVariable("INFRAGRAPH_ADMIN_EMAIL"));
        var password = Environment.GetEnvironmentVariable("INFRAGRAPH_ADMIN_PASSWORD");
        if (email is null || !AccessEndpoints.ValidPassword(password))
            throw new InvalidOperationException("Seed needs INFRAGRAPH_ADMIN_EMAIL and a 14-256 char INFRAGRAPH_ADMIN_PASSWORD.");
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
        if (await db.Operators.AnyAsync(x => x.Email == email))
            throw new InvalidOperationException("Account exists; seeding cannot reset an existing password.");
        var item = new OperatorRecord { Id = Guid.NewGuid(), Email = email, PasswordHash = "",
            Role = "admin", CreatedAtUtc = DateTimeOffset.UtcNow };
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<OperatorRecord>>();
        item.PasswordHash = hasher.HashPassword(item, password!);
        db.Operators.Add(item);
        db.OperatorAudit.Add(new OperatorAuditRecord { Id = Guid.NewGuid(), Actor = "bootstrap",
            Action = "access.seed", Target = email, Success = true, AtUtc = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        Console.WriteLine("Administrator account created; password was not logged.");
    }
}
