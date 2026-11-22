using System.Security.Claims;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using InfraGraph.Contracts.Agents;
using InfraGraph.ControlPlane.Access;
using InfraGraph.Modules.Discovery;
using InfraGraph.Infrastructure.Persistence;
using InfraGraph.Modules.Topology;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.ControlPlane.Discovery;

public static class DiscoveryEndpoints
{
    public sealed record NetworkEvidenceLink(string Id, string Source, string Target,
        string? SourcePort, string? TargetPort, string Protocol,
        IReadOnlyList<Guid> EvidenceIds, bool PossibleCycle, string EvidenceSource,
        string? Corroboration = null);
    public sealed record ReportedLink(string SiteId, string SourceKey, string TargetKey,
        string? SourcePort, string? TargetPort, string Protocol,
        DateTimeOffset ObservedAtUtc, int TtlSeconds);
    public sealed record WalkPreviewRequest(
        string SiteId, string[] ApprovedAssets, string[] Seeds,
        int MaxNodes = 256, int MaxDepth = 8, int MaxNeighborsPerNode = 64);


    private static bool CanAccess(ClaimsPrincipal user, string? siteId) =>
        !string.IsNullOrWhiteSpace(siteId) && siteId.Length <= 120 &&
        (user.IsInRole("admin") || user.FindFirstValue("site") == siteId);

    public static void MapDiscoveryEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/discovery/capabilities", () => Results.Ok(new {
            activeProbe = true,
            mode = "explicitly-authorized-RFC1918-IPv4-ICMP-TCP",
            snmp = true,
            lldp = true,
            snmpRequiresExplicitTargetsAndCredentials = true,
            reportedEvidenceImport = true,
            note = "ICMP/TCP probing uses approved CIDRs. SNMPv3 authPriv LLDP/FDB requires separate approved targets and runtime credentials; only LLDP creates device adjacency."
        })).RequireAuthorization();
        app.MapGet("/api/v1/topology/graph", async (string siteId, string? seed,
            ClaimsPrincipal user, InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!CanAccess(user, siteId)) return Results.Forbid();
            var now = clock.GetUtcNow();
            var input = await db.DiscoveryObservations.AsNoTracking()
                .Where(x => x.SiteId == siteId && x.RetractedAtUtc == null && x.ObservedAtUtc > now.AddDays(-1))
                .OrderBy(x => x.Id).Take(10001).ToListAsync(ct);
            if (input.Count > 10000) return Results.Problem("Too many observations in scope.", statusCode: 422);
            var records = input.Select(x => new TopologyGraphEngine.Observation(x.Id, x.SiteId,
                x.SourceKey, x.TargetKey, x.SourcePort, x.TargetPort, x.Protocol, x.ObservedAtUtc, x.TtlSeconds));
            if (seed is { Length: > 160 }) return Results.BadRequest();
            // Without an explicit focus seed, include every fresh connected component,
            // not just the component containing the earliest ingested link.
            var roots = !string.IsNullOrWhiteSpace(seed)
                ? new[] { seed }
                : input.Where(x => x.TtlSeconds > 0 && x.TtlSeconds <= 86400 &&
                    x.ObservedAtUtc <= now &&
                    now - x.ObservedAtUtc <= TimeSpan.FromSeconds(x.TtlSeconds))
                    .SelectMany(x => new[] { x.SourceKey, x.TargetKey })
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Distinct(StringComparer.Ordinal).Take(513).ToArray();
            var graph = TopologyGraphEngine.Build(siteId, roots.Take(512), records, now);
            if (roots.Length > 512) graph = graph with { Truncated = true };
            var scanned = await db.NetworkScanHosts.AsNoTracking()
                .Where(x => x.SiteId == siteId).OrderBy(x => x.Address)
                .Take(1025).ToArrayAsync(ct);
            if (scanned.Length > 1024)
                return Results.Problem("Scan host cap exceeded.", statusCode: 422);
            var agentRows = await db.AgentInventories.AsNoTracking()
                .Where(x => x.SiteId == siteId).OrderByDescending(x => x.ReceivedAtUtc)
                .Take(513).Select(x => new { x.AgentId, x.Snapshot, x.ReceivedAtUtc })
                .ToArrayAsync(ct);
            if (agentRows.Length > 512)
                return Results.Problem("Agent observation cap exceeded.", statusCode: 422);
            // Agent-reported IP addresses identify nodes, but never assert physical links.
            var endpointByIp = new Dictionary<string, (Guid AgentId, string HostName, DateTimeOffset ReceivedAtUtc)>(StringComparer.Ordinal);
            var ambiguousIp = new HashSet<string>(StringComparer.Ordinal);
            foreach (var row in agentRows)
            {
                AgentInventoryV1? report = null;
                try { report = JsonSerializer.Deserialize<AgentInventoryV1>(row.Snapshot,
                    new JsonSerializerOptions(JsonSerializerDefaults.Web)); }
                catch (JsonException) { /* Corrupt row cannot create an asserted topology identity. */ }
                if (report is null) continue;
                foreach (var ip in report.Networks.SelectMany(n => n.IpAddresses).Distinct(StringComparer.Ordinal))
                {
                    if (!IPAddress.TryParse(ip, out var parsed) ||
                        parsed.AddressFamily != AddressFamily.InterNetwork ||
                        IPAddress.IsLoopback(parsed) || ambiguousIp.Contains(ip)) continue;
                    if (endpointByIp.ContainsKey(ip)) { endpointByIp.Remove(ip); ambiguousIp.Add(ip); continue; }
                    endpointByIp.Add(ip, (row.AgentId, report.HostName, row.ReceivedAtUtc));
                }
            }
            var jobScopes = await db.NetworkScanJobs.AsNoTracking()
                .Where(x => x.SiteId == siteId)
                .OrderByDescending(x => x.RequestedAtUtc).Take(20)
                .Select(x => x.Cidrs).ToArrayAsync(ct);
            var logicalSegments = LogicalSubnetMembership.Build(
                jobScopes, scanned.Select(x => x.Address));
            // Authenticated SNMPv3 identities and LLDP port records are separate
            // from ping reachability. Unmatched LLDP chassis IDs remain provisional.
            var managedDevices = await db.ManagedNetworkDevices.AsNoTracking()
                .Where(x => x.SiteId == siteId)
                .OrderByDescending(x => x.LastSeenAtUtc).Take(129).ToArrayAsync(ct);
            var lldpNeighbors = await db.LldpNeighbors.AsNoTracking()
                .Where(x => x.SiteId == siteId && x.ObservedAtUtc >= now.AddMinutes(-20))
                .OrderByDescending(x => x.ObservedAtUtc).Take(1025).ToArrayAsync(ct);
            if (managedDevices.Length > 128 || lldpNeighbors.Length > 1024)
                return Results.Problem("SNMP topology evidence cap exceeded.", statusCode: 422);
            var fdbEvidence = await db.FdbLearnedMacs.AsNoTracking()
                .Where(x => x.SiteId == siteId && x.ObservedAtUtc >= now.AddMinutes(-20))
                .OrderByDescending(x => x.ObservedAtUtc).Take(8193).ToArrayAsync(ct);
            if (fdbEvidence.Length > 8192)
                return Results.Problem("FDB evidence cap exceeded.", statusCode: 422);
            var reconciliation = SnmpTopologyReconciler.Build(
                managedDevices.Select(x => new SnmpTopologyReconciler.Device(
                    x.Address, x.ChassisId, x.SystemName, x.Kind, x.LastSeenAtUtc)),
                lldpNeighbors.Select(x => new SnmpTopologyReconciler.Neighbor(
                    x.Id, x.LocalAddress, x.LocalPort, x.RemoteChassisId,
                    x.RemotePort, x.RemoteSystemName, x.ObservedAtUtc)), now);
            var freshManaged = managedDevices.Where(x => x.LastSeenAtUtc >= now.AddMinutes(-20) &&
                x.LastSeenAtUtc <= now).ToDictionary(x => x.Address, StringComparer.Ordinal);
            var snmpNodes = reconciliation.Nodes.ToDictionary(x => x.Id, StringComparer.Ordinal);
            var learnedCounts = fdbEvidence.GroupBy(x => x.BridgeAddress, StringComparer.Ordinal)
                .ToDictionary(x => x.Key, x => x.Count(), StringComparer.Ordinal);
            var activeScan = await db.NetworkScanJobs.AsNoTracking()
                .Where(x => x.SiteId == siteId && x.Status == "running")
                .Select(x => new { x.Id, x.IntervalSeconds }).SingleOrDefaultAsync(ct);
            var byAddress = scanned.ToDictionary(x => x.Address, StringComparer.Ordinal);
            var nodes = graph.Nodes.Select(x => (x.Id, x.Depth))
                .Concat(scanned.Select(x => (Id: x.Address, Depth: 0)))
                .Concat(endpointByIp.Keys.Select(x => (Id: x, Depth: 0)))
                .Concat(reconciliation.Nodes.Select(x => (x.Id, Depth: 0)))
                .DistinctBy(x => x.Id, StringComparer.Ordinal).Take(2048)
                .Select(x => {
                    byAddress.TryGetValue(x.Id, out var host);
                    freshManaged.TryGetValue(x.Id, out var managed);
                    snmpNodes.TryGetValue(x.Id, out var observed);
                    var hasAgent = endpointByIp.TryGetValue(x.Id, out var endpoint);
                    return new {
                        x.Id, x.Depth,
                        address = host?.Address ?? managed?.Address,
                        systemName = managed?.SystemName ?? observed?.SystemName ??
                            (hasAgent ? endpoint.HostName : null),
                        systemDescription = managed?.SystemDescription,
                        systemObjectId = managed?.SystemObjectId,
                        deviceKind = managed?.Kind ?? observed?.Kind ??
                            (hasAgent ? "workstation" : "unknown"),
                        snmpObservedAtUtc = managed?.LastSeenAtUtc,
                        learnedMacCount = learnedCounts.GetValueOrDefault(x.Id),
                        identitySource = managed is not null ? "snmpv3-authpriv" :
                            observed is not null ? "lldp-remote" :
                            hasAgent ? "agent-self-reported-ip" : null,
                        agentId = hasAgent ? endpoint.AgentId : (Guid?)null,
                        agentLastSeenAtUtc = hasAgent ? endpoint.ReceivedAtUtc : (DateTimeOffset?)null,
                        probeStatus = host is null ? null : ProbeHealth.EffectiveStatus(
                            host.Status, host.LastJobId, activeScan?.Id,
                            host.LastProbedAtUtc, now, activeScan?.IntervalSeconds ?? 0),
                        consecutiveMisses = host?.ConsecutiveMisses,
                        icmpResponded = host?.IcmpResponded,
                        tcpPorts = host is null || host.TcpPorts.Length == 0
                            ? Array.Empty<int>() : host.TcpPorts.Split(',').Select(int.Parse).ToArray(),
                        lastSeenAtUtc = host?.LastSeenAtUtc,
                        lastProbedAtUtc = host?.LastProbedAtUtc
                    };
                }).ToArray();
            // LLDP is an authenticated neighbor protocol, while FDB is only a
            // learned-MAC port association and MUST NOT create a physical edge.
            var knownNodeIds = nodes.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
            var links = graph.Links.Select(x => new NetworkEvidenceLink(
                    x.Id, x.Source, x.Target, x.SourcePort, x.TargetPort,
                    x.Protocol, x.EvidenceIds, x.PossibleCycle, "operator-reported-unverified"))
                .Concat(reconciliation.Links.Select(x => new NetworkEvidenceLink(
                    x.Id, x.Source, x.Target, x.SourcePort, x.TargetPort,
                    "LLDP", x.EvidenceIds, false, "snmpv3-authpriv", x.Corroboration)))
                .Where(x => knownNodeIds.Contains(x.Source) && knownNodeIds.Contains(x.Target))
                .ToArray();
            return Results.Ok(new { graph.SiteId, nodes, links, logicalSegments,
                graph.StaleObservations, graph.Truncated, graph.GeneratedAtUtc,
                provenance = freshManaged.Count > 0 ? "snmpv3-and-active-ipv4-evidence" :
                    scanned.Length > 0 ? "active-ipv4-and-reported-evidence"
                        : "operator-reported-unverified" });
        }).RequireAuthorization();

        // Historical observations remain auditable after expiry or retraction.
        app.MapGet("/api/v1/discovery/observations", async (
            string siteId, int? page, int? pageSize, ClaimsPrincipal user,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!CanAccess(user, siteId)) return Results.Forbid();
            if (page is < 1 or > 10000 || pageSize is < 1 or > 100) return Results.BadRequest();
            var current = page ?? 1;
            var size = pageSize ?? 25;
            var query = db.DiscoveryObservations.AsNoTracking().Where(x => x.SiteId == siteId);
            var total = await query.CountAsync(ct);
            var rows = await query.OrderByDescending(x => x.ReceivedAtUtc)
                .ThenByDescending(x => x.Id).Skip((current - 1) * size).Take(size)
                .ToArrayAsync(ct);
            var now = clock.GetUtcNow();
            return Results.Ok(new {
                siteId, page = current, pageSize = size, total,
                items = rows.Select(x => new {
                    x.Id, x.SiteId, x.SourceKey, x.TargetKey, x.SourcePort, x.TargetPort,
                    x.Protocol, x.ObservedAtUtc, x.ReceivedAtUtc, x.TtlSeconds,
                    x.RetractedAtUtc, x.Source,
                    status = x.RetractedAtUtc is not null ? "retracted"
                        : x.ObservedAtUtc > now ||
                          now - x.ObservedAtUtc > TimeSpan.FromSeconds(x.TtlSeconds)
                            ? "expired" : "fresh"
                }).ToArray()
            });
        }).RequireAuthorization();

        app.MapPost("/api/v1/discovery/observations/{id:guid}/retract", async (
            Guid id, HttpContext ctx, IAntiforgery anti, InfraGraphDbContext db,
            TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti))
                return Results.BadRequest(new { error = "Invalid CSRF token" });
            if (!ctx.User.IsInRole("admin") && !ctx.User.IsInRole("operator"))
                return Results.Forbid();
            var observation = await db.DiscoveryObservations.FindAsync([id], ct);
            if (observation is null || !CanAccess(ctx.User, observation.SiteId))
                return Results.NotFound();
            if (observation.RetractedAtUtc is not null) return Results.NoContent();
            var now = clock.GetUtcNow();
            observation.RetractedAtUtc = now;
            db.OperatorAudit.Add(new OperatorAuditRecord {
                Id = Guid.NewGuid(),
                Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
                Action = "discovery.retract", Target = observation.Id.ToString(),
                Success = true, AtUtc = now
            });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization().RequireRateLimiting("write");

        // Deliberately OFFLINE: walk already stored operator evidence only.
        // No socket, SNMP client, CIDR expansion, or device contact is involved.
        app.MapPost("/api/v1/discovery/walk-preview", async (
            WalkPreviewRequest body, HttpContext ctx, IAntiforgery anti,
            InfraGraphDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest();
            if (!CanAccess(ctx.User, body.SiteId)) return Results.Forbid();
            if (body.ApprovedAssets is not { Length: > 0 and <= 512 } ||
                body.Seeds is not { Length: > 0 and <= 32 } ||
                body.MaxNodes is < 1 or > 512 || body.MaxDepth is < 0 or > 16 ||
                body.MaxNeighborsPerNode is < 1 or > 128 ||
                body.ApprovedAssets.Any(x => !KeyOk(x, 160)) ||
                body.Seeds.Any(x => !KeyOk(x, 160)) ||
                body.Seeds.Any(x => !body.ApprovedAssets.Contains(x, StringComparer.Ordinal)))
                return Results.BadRequest(new { error = "Explicit approved asset scope required." });
            var now = clock.GetUtcNow();
            var input = await db.DiscoveryObservations.AsNoTracking()
                .Where(x => x.SiteId == body.SiteId && x.RetractedAtUtc == null &&
                    x.ObservedAtUtc > now.AddDays(-1))
                .OrderBy(x => x.Id).Take(10001).ToArrayAsync(ct);
            if (input.Length > 10000)
                return Results.Problem("Too many observations in scope.", statusCode: 422);
            var evidence = input.Where(x => x.TtlSeconds is > 0 and <= 86400 &&
                    x.ObservedAtUtc <= now &&
                    now - x.ObservedAtUtc <= TimeSpan.FromSeconds(x.TtlSeconds) &&
                    KeyOk(x.SourceKey, 160) && KeyOk(x.TargetKey, 160) &&
                    x.SourceKey != x.TargetKey)
                .Select(x => new TopologyGraphEngine.Observation(x.Id, x.SiteId,
                    x.SourceKey, x.TargetKey, x.SourcePort, x.TargetPort, x.Protocol,
                    x.ObservedAtUtc, x.TtlSeconds))
                .ToArray();
            var policy = new DiscoveryWalkPolicy(body.SiteId,
                new HashSet<string>(body.ApprovedAssets, StringComparer.Ordinal),
                body.MaxNodes, body.MaxDepth, body.MaxNeighborsPerNode);
            var result = await DiscoveryWalkEngine.RunAsync(policy, body.Seeds,
                new StoredObservationNeighborReader(evidence), clock, ct);
            return Results.Ok(new {
                mode = "stored-evidence-only",
                result.ProbedAssets, result.SkippedOutOfScope,
                result.FailedAssets, result.TimedOut,
                graph = new {
                    result.Graph.SiteId, result.Graph.Nodes, result.Graph.Links,
                    result.Graph.StaleObservations, result.Graph.Truncated,
                    result.Graph.GeneratedAtUtc,
                    provenance = "operator-reported-unverified"
                }
            });
        }).RequireAuthorization().RequireRateLimiting("write");

        app.MapPost("/api/v1/discovery/observations", async (ReportedLink[] body,
            HttpContext ctx, IAntiforgery anti, InfraGraphDbContext db,
            TimeProvider clock, CancellationToken ct) =>
        {
            if (!await AccessEndpoints.SafeCsrf(ctx, anti)) return Results.BadRequest(new { error = "Invalid CSRF token" });
            if (!ctx.User.IsInRole("admin") && !ctx.User.IsInRole("operator")) return Results.Forbid();
            if (body is not { Length: > 0 and <= 100 }) return Results.BadRequest();
            var now = clock.GetUtcNow();
            foreach (var x in body)
            {
                if (!CanAccess(ctx.User, x.SiteId) ||
                    !KeyOk(x.SourceKey, 160) || !KeyOk(x.TargetKey, 160) ||
                    x.SourceKey == x.TargetKey || !KeyOk(x.Protocol, 32) ||
                    !OptionalPortOk(x.SourcePort) || !OptionalPortOk(x.TargetPort) ||
                    x.TtlSeconds is < 1 or > 86400 ||
                    x.ObservedAtUtc > now || x.ObservedAtUtc < now.AddDays(-1))
                    return Results.BadRequest(new { error = "Invalid or unauthorized observation" });
            }
            foreach (var x in body)
                db.DiscoveryObservations.Add(new DiscoveryObservationRecord {
                    Id = Guid.NewGuid(), SiteId = x.SiteId, SourceKey = x.SourceKey,
                    TargetKey = x.TargetKey, SourcePort = x.SourcePort,
                    TargetPort = x.TargetPort, Protocol = x.Protocol,
                    ObservedAtUtc = x.ObservedAtUtc, ReceivedAtUtc = now,
                    TtlSeconds = x.TtlSeconds, Source = "operator-reported"
                });
            db.OperatorAudit.Add(new OperatorAuditRecord {
                Id = Guid.NewGuid(), Actor = ctx.User.FindFirstValue(ClaimTypes.Email) ?? "unknown",
                Action = "discovery.report", Target = string.Join(",", body.Select(x => x.SiteId).Distinct()),
                Success = true, AtUtc = now
            });
            await db.SaveChangesAsync(ct);
            return Results.Accepted(value: new { accepted = body.Length, provenance = "operator-reported-unverified" });
        }).RequireAuthorization().RequireRateLimiting("write");
    }

    private static bool OptionalPortOk(string? port) =>
        port is null || (port.Length <= 80 && !port.Any(char.IsControl));

    private static bool KeyOk(string? input, int max) =>
        !string.IsNullOrWhiteSpace(input) && input.Length <= max &&
        !input.Any(char.IsControl);
}
