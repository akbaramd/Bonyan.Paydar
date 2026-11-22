using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.RateLimiting;
using InfraGraph.Contracts.Agents;
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
    try { return await db.Database.CanConnectAsync(ct) ? Results.Ok(new { status = "ready" }) :
        Results.StatusCode(503); }
    catch { return Results.StatusCode(503); }
});

// Legacy untrusted heartbeat remains closed until certificate enrollment is fully verified.
app.MapPost("/api/v1/agents/heartbeat", () => Results.StatusCode(503));
app.MapPost("/api/v1/agents/inventory", async (HttpContext ctx, AgentInventoryV1 body,
    InfraGraphDbContext db, CancellationToken ct) =>
{
    if (!ctx.Request.IsHttps || string.IsNullOrWhiteSpace(connection))
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    var cert = await ctx.Connection.GetClientCertificateAsync(ct);
    if (cert is null || cert.NotBefore.ToUniversalTime() > DateTime.UtcNow || cert.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
        return Results.Unauthorized();
    if (body.AgentId == Guid.Empty || body.InstallationEpoch == Guid.Empty ||
        string.IsNullOrWhiteSpace(body.HostName) || body.HostName.Length > 240 || body.CpuName.Length > 256 ||
        body.Disks.Count > 64 || body.Gpus.Count > 32 || body.Networks.Count > 64 ||
        body.Devices.Count > 500)
        return Results.BadRequest();
    var now = DateTimeOffset.UtcNow;
    if (body.CollectedAtUtc > now.AddMinutes(2) || body.CollectedAtUtc < now.AddMinutes(-20))
        return Results.BadRequest(new { error = "Stale observation" });
    var device = await db.AgentInstallations.SingleOrDefaultAsync(x => x.AgentId == body.AgentId, ct);
    if (device is null || device.InstallationEpoch != body.InstallationEpoch ||
        device.RevokedAtUtc != null ||
        string.IsNullOrWhiteSpace(device.ClientCertificateThumbprint))
        return Results.Unauthorized();
    var presented = cert.Thumbprint.Replace(" ", "", StringComparison.Ordinal);
    var expected = device.ClientCertificateThumbprint.Replace(" ", "", StringComparison.Ordinal);
    try {
        if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(presented),
                                                       Convert.FromHexString(expected)))
            return Results.Unauthorized();
    }
    catch (FormatException) { return Results.Unauthorized(); }
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
    return Results.Ok(new { accepted = true, receivedAtUtc = now });
}).RequireRateLimiting("inventory").WithMetadata(new RequestSizeLimitAttribute(512_000));
app.Run();


