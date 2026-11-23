using System.Text.Json;
using System.Threading.RateLimiting;
using InfraGraph.Contracts.Agents;
using InfraGraph.AgentGateway;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("AgentGateway");
builder.WebHost.ConfigureKestrel(k => k.ConfigureHttpsDefaults(https =>
    https.ClientCertificateMode = ClientCertificateMode.RequireCertificate));
builder.Services.AddDbContext<InfraGraphDbContext>(o => {
    if (!string.IsNullOrWhiteSpace(connection)) o.UseNpgsql(connection);
});
builder.Services.AddHealthChecks();
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = 429;
    options.AddPolicy("inventory", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.ClientCertificate?.Thumbprint ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions {
            PermitLimit = 4, Window = TimeSpan.FromMinutes(1), QueueLimit = 0,
            AutoReplenishment = true
        }));
});
var app = builder.Build();
app.UseRateLimiter();
app.MapHealthChecks("/health/live");
app.MapGet("/health/ready", async (InfraGraphDbContext db, CancellationToken ct) => {
    if (string.IsNullOrWhiteSpace(connection)) return Results.StatusCode(503);
    try {
        if (!await db.Database.CanConnectAsync(ct)) return Results.StatusCode(503);
        // Verify that required tables, columns and runtime SELECT grants are usable.
        await db.AgentInstallations.AsNoTracking().Select(x => new {
            x.AgentId, x.ClientCertificateThumbprint, x.LastInventoryAtUtc
        }).Take(1).ToArrayAsync(ct);
        await db.AgentInventories.AsNoTracking().Select(x => new {
            x.AgentId, x.Snapshot
        }).Take(1).ToArrayAsync(ct);
        return Results.Ok(new { status = "ready-for-approved-agents" });
    }
    catch { return Results.StatusCode(503); }
});

// The tray checks exact per-device approval without sending hardware data.
app.MapPost("/api/v1/agents/check", async (HttpContext ctx, AgentIdentityRequest body,
    InfraGraphDbContext db, CancellationToken ct) =>
{
    if (!ctx.Request.IsHttps || string.IsNullOrWhiteSpace(connection))
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    var device = await AgentIdentityVerifier.FindApprovedAsync(
        ctx, body.AgentId, body.InstallationEpoch, db, ct);
    if (device is null) return Results.Unauthorized();
    return Results.Ok(new {
        device.AgentId, device.SiteId, device.LastReceivedAtUtc,
        approved = true, inventoryReceived = device.LastInventoryAtUtc is not null
    });
}).RequireRateLimiting("inventory").WithMetadata(new RequestSizeLimitAttribute(4096));

// Legacy untrusted heartbeat remains closed until certificate enrollment is fully verified.
app.MapPost("/api/v1/agents/heartbeat", () => Results.StatusCode(503));
app.MapPost("/api/v1/agents/inventory", async (HttpContext ctx, AgentInventoryV1 body,
    InfraGraphDbContext db, CancellationToken ct) =>
{
    if (!ctx.Request.IsHttps || string.IsNullOrWhiteSpace(connection))
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);

    if (body.AgentId == Guid.Empty || body.InstallationEpoch == Guid.Empty ||
        string.IsNullOrWhiteSpace(body.HostName) || body.HostName.Length > 240 ||
        string.IsNullOrWhiteSpace(body.AgentVersion) || body.AgentVersion.Length > 64 ||
        body.CpuName is null || body.CpuName.Length > 256 ||
        body.Disks is null || body.Gpus is null || body.Networks is null ||
        body.Devices is null || body.Disks.Count > 64 ||
        body.Gpus.Count > 32 || body.Networks.Count > 64 ||
        body.Devices.Count > 500)
        return Results.BadRequest();
    var now = DateTimeOffset.UtcNow;
    if (body.CollectedAtUtc > now.AddMinutes(2) || body.CollectedAtUtc < now.AddMinutes(-20))
        return Results.BadRequest(new { error = "Stale observation" });
    var device = await AgentIdentityVerifier.FindApprovedAsync(
        ctx, body.AgentId, body.InstallationEpoch, db, ct);
    if (device is null) return Results.Unauthorized();
    if (device.LastInventoryAtUtc is not null && device.LastInventoryAtUtc >= body.CollectedAtUtc)
        return Results.Conflict(new { error = "Replay or stale agent observation" });
    var record = await db.AgentInventories.SingleOrDefaultAsync(x => x.AgentId == body.AgentId, ct);
    var json = JsonSerializer.Serialize(body, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    if (json.Length > 300_000) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
    if (record is null) {
        db.AgentInventories.Add(new AgentInventoryRecord {
            AgentId = body.AgentId, SiteId = device.SiteId, Snapshot = json,
            CollectedAtUtc = body.CollectedAtUtc, ReceivedAtUtc = now
        });
    } else {
        record.SiteId = device.SiteId; record.Snapshot = json;
        record.CollectedAtUtc = body.CollectedAtUtc; record.ReceivedAtUtc = now;
    }
    device.AgentVersion = body.AgentVersion[..Math.Min(body.AgentVersion.Length, 64)];
    device.LastInventoryAtUtc = body.CollectedAtUtc;
    device.LastReceivedAtUtc = now;
    try { await db.SaveChangesAsync(ct); }
    catch (DbUpdateConcurrencyException) {
        return Results.Conflict(new { error = "Concurrent agent observation" });
    }
    catch (DbUpdateException) {
        return Results.Conflict(new { error = "Conflicting or invalid agent observation" });
    }
    return Results.Ok(new { accepted = true, receivedAtUtc = now });
}).RequireRateLimiting("inventory").WithMetadata(new RequestSizeLimitAttribute(512_000));
app.Run();
public sealed record AgentIdentityRequest(Guid AgentId, Guid InstallationEpoch);