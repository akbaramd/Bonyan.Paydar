using System.Security.Claims;
using System.Threading.RateLimiting;
using InfraGraph.Contracts.System;
using InfraGraph.ControlPlane.Access;
using InfraGraph.ControlPlane.Discovery;
using InfraGraph.ControlPlane.Diagnostics;
using InfraGraph.ControlPlane.Hubs;
using InfraGraph.ControlPlane.Inventory;
using InfraGraph.ControlPlane.Operations;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("ControlPlane");
builder.Services.AddDbContext<InfraGraphDbContext>(o =>
{
    if (!string.IsNullOrWhiteSpace(connection)) o.UseNpgsql(connection);
});
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<INetworkDiagnosticProbe, NetworkDiagnosticProbe>();
builder.Services.AddSingleton<DiagnosticConcurrencyLimiter>();
builder.Services.AddScoped<IPasswordHasher<OperatorRecord>, PasswordHasher<OperatorRecord>>();
builder.Services.AddHealthChecks();
builder.Services.AddSignalR();
if (!string.IsNullOrWhiteSpace(connection))
    builder.Services.AddHostedService<ScanEventBroadcaster>();
builder.Services.AddAntiforgery(o => {
    o.HeaderName = "X-CSRF-TOKEN";
    o.Cookie.Name = "__Host-InfraGraph-Csrf";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
});
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o => {
    o.Cookie.Name = "__Host-InfraGraph-Session";
    o.Cookie.HttpOnly = true;
    o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.SlidingExpiration = false;
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    o.Events.OnValidatePrincipal = async ctx => {
        if (string.IsNullOrWhiteSpace(ctx.HttpContext.RequestServices.GetRequiredService<IConfiguration>()
                .GetConnectionString("ControlPlane")) ||
            !Guid.TryParse(ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
        { ctx.RejectPrincipal(); return; }
        try {
            var db = ctx.HttpContext.RequestServices.GetRequiredService<InfraGraphDbContext>();
            var op = await db.Operators.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
            if (op is not { IsActive: true } ||
                op.SecurityStamp.ToString() != ctx.Principal!.FindFirstValue("stamp") ||
                op.Role != ctx.Principal.FindFirstValue(ClaimTypes.Role) ||
                op.SiteId != ctx.Principal.FindFirstValue("site"))
                ctx.RejectPrincipal();
        }
        catch { ctx.RejectPrincipal(); }
    };
});
builder.Services.AddAuthorization(o =>
    o.AddPolicy(AccessEndpoints.AdminPolicy, p => p.RequireRole("admin")));
builder.Services.AddRateLimiter(o => {
    o.RejectionStatusCode = 429;
    o.AddPolicy("write", ctx => RateLimitPartition.GetFixedWindowLimiter(
        $"{ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous"}:{ctx.Connection.RemoteIpAddress}",
        _ => new FixedWindowRateLimiterOptions {
            PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
            AutoReplenishment = true
        }));
    o.AddPolicy("diagnostic", ctx => RateLimitPartition.GetFixedWindowLimiter(
        $"{ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous"}:{ctx.Connection.RemoteIpAddress}:diagnostic",
        _ => new FixedWindowRateLimiterOptions {
            PermitLimit = 6, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
            AutoReplenishment = true
        }));
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions {
            PermitLimit = 8, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
            AutoReplenishment = true
        }));
});

var app = builder.Build();
if (args.Contains("--seed-admin", StringComparer.OrdinalIgnoreCase))
{
    if (string.IsNullOrWhiteSpace(connection))
        throw new InvalidOperationException("ControlPlane connection string is mandatory for seeding.");
    await AdminSeed.RunAsync(app.Services);
    return;
}

app.UseDefaultFiles();
app.UseStaticFiles();
// Fail closed for all operational endpoints if persistence is unconfigured.
app.Use(async (ctx, next) => {
    if (ctx.Request.Path.StartsWithSegments("/api/v1") &&
        !ctx.Request.Path.Equals("/api/v1/system/snapshot", StringComparison.OrdinalIgnoreCase))
    {
        // Prevent the login secret and scoped inventory from using the plaintext
        // development HTTP launch profile or an incorrectly terminated reverse proxy.
        ctx.Response.Headers.CacheControl = "no-store";
        if (!ctx.Request.IsHttps)
        { ctx.Response.StatusCode = StatusCodes.Status426UpgradeRequired; return; }
        if (string.IsNullOrWhiteSpace(ctx.RequestServices.GetRequiredService<IConfiguration>()
                .GetConnectionString("ControlPlane")))
        { ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable; return; }
    }
    await next();
});
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapHealthChecks("/health/live");
app.MapGet("/health/ready", () => Results.Problem(
    title: "Not ready",
    detail: "Agent enrollment, gateway identity and active discovery not deployed.",
    statusCode: StatusCodes.Status503ServiceUnavailable));
app.MapGet("/api/v1/system/snapshot", (IHostEnvironment environment, TimeProvider clock) =>
    Results.Ok(new SystemSnapshotV1("InfraGraph", environment.EnvironmentName, "ScaffoldOnly",
        clock.GetUtcNow(), 0, 0)));

app.MapAccessEndpoints();
app.MapAccountEndpoints();
app.MapOperatorAccessEndpoints();
app.MapDiscoveryEndpoints();
app.MapHostScopeEndpoints();
app.MapNetworkScanEndpoints();
app.MapNetworkDiagnosticEndpoints();
app.MapInventoryEndpoints();
app.MapOperationsEndpoints();
app.MapAgentApprovalEndpoints();
app.MapHub<StatusHub>("/hubs/status").RequireAuthorization();
// Unknown API routes must never be served as index.html.
app.Map("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");
app.Run();
