using System.Net;
using System.Net.Sockets;
using System.Security.Claims;
using System.Text.Json;
using InfraGraph.ControlPlane.Access;
using InfraGraph.Infrastructure.Persistence;
using InfraGraph.Modules.Discovery;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Diagnostics;

public sealed record DiagnosticRequest(string SiteId, string Address, string Kind, bool Confirmed);

public static class NetworkDiagnosticEndpoints
{
    // Only one-shot diagnostics on recently probed, explicitly approved site addresses.
    public static void MapNetworkDiagnosticEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/diagnostics/run", async (
            DiagnosticRequest body, HttpContext ctx, IAntiforgery anti,
            InfraGraphDbContext db, TimeProvider clock, INetworkDiagnosticProbe probe,
            DiagnosticConcurrencyLimiter limiter, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti))
                return Results.BadRequest(new { error = "Invalid CSRF token." });
            if (!ctx.User.IsInRole("admin") && !ctx.User.IsInRole("operator"))
                return Results.Forbid();
            if (string.IsNullOrWhiteSpace(body.SiteId) || body.SiteId.Length > 120 ||
                (!ctx.User.IsInRole("admin") && ctx.User.FindFirstValue("site") != body.SiteId))
                return Results.Forbid();
            if (!body.Confirmed || body.Kind is not ("ping" or "traceroute") ||
                body.Address is null || body.Address.Length > 15 ||
                !IPAddress.TryParse(body.Address, out var ip) ||
                ip.AddressFamily != AddressFamily.InterNetwork ||
                ip.ToString() != body.Address)
                return Results.BadRequest(new { error = "An explicit action and canonical IPv4 host address are required." });

            // No arbitrary IP from the browser: the exact host must have recent scan
            // evidence in the authorized site and belong to the original approved job scope.
            var host = await db.NetworkScanHosts.AsNoTracking()
                .Where(x => x.SiteId == body.SiteId && x.Address == body.Address)
                .Select(x => new { x.LastJobId, x.LastProbedAtUtc }).SingleOrDefaultAsync(ct);
            var now = clock.GetUtcNow();
            if (host is null || host.LastProbedAtUtc > now ||
                host.LastProbedAtUtc < now.AddHours(-24))
                return Results.NotFound(new { error = "Recent, approved discovery evidence is required." });
            var job = await db.NetworkScanJobs.AsNoTracking()
                .Where(x => x.Id == host.LastJobId && x.SiteId == body.SiteId)
                .Select(x => new { x.Cidrs, x.RequestedAtUtc }).SingleOrDefaultAsync(ct);
            if (job is null || job.RequestedAtUtc > now) return Results.NotFound();
            bool inApprovedScope;
            try
            {
                var scopes = JsonSerializer.Deserialize<string[]>(job.Cidrs) ?? [];
                inApprovedScope = Ipv4ScanPlanner.Plan(scopes).Contains(ip);
            }
            catch (ArgumentException) { return Results.NotFound(); }
            catch (JsonException) { return Results.NotFound(); }
            if (!inApprovedScope) return Results.NotFound();

            if (!await limiter.TryEnterAsync(ct))
                return Results.StatusCode(StatusCodes.Status429TooManyRequests);
            try
            {
                db.OperatorAudit.Add(new OperatorAuditRecord {
                    Id = Guid.NewGuid(), Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
                    Action = body.Kind == "ping" ? "diagnostic.ping" : "diagnostic.traceroute",
                    Target = body.SiteId + ":" + body.Address, Success = true, AtUtc = now
                });
                // Persist the audit record before emitting any packet.
                await db.SaveChangesAsync(ct);
                var result = await probe.RunAsync(ip, body.Kind, ct);
                return Results.Ok(result);
            }
            finally { limiter.Exit(); }
        }).RequireAuthorization().RequireRateLimiting("diagnostic");
    }
}

/// <summary>Fail fast under contention; never allow a request backlog of ICMP jobs.</summary>
public sealed class DiagnosticConcurrencyLimiter
{
    private readonly SemaphoreSlim _semaphore = new(2, 2);
    public Task<bool> TryEnterAsync(CancellationToken ct) => _semaphore.WaitAsync(0, ct);
    public void Exit() => _semaphore.Release();
}
