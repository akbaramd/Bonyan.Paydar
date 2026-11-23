using System.Net;
using InfraGraph.ControlPlane.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using InfraGraph.ControlPlane;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace InfraGraph.IntegrationTests;

/// <summary>
/// Full HTTP / cookie / CSRF / RBAC integration over an isolated EF in-memory store.
/// Does NOT replace the separate required PostgreSQL migration and SQL permissions gate.
/// </summary>
public sealed class MvpApiTests
{
    private const string Admin = "admin@example.invalid";
    private const string InitialPassword = "Strong-Initial-Password-2026!";
    private const string UserPassword = "Strong-Operator-Password-2026!";

    [Fact]
    public async Task PlainHttpCannotCarryOperationalCredentialsOrData()
    {
        using var host = new TestHost();
        using var plain = host.CreateClient();
        Assert.Equal(HttpStatusCode.UpgradeRequired,
            (await plain.GetAsync("/api/v1/auth/csrf")).StatusCode);
        Assert.Equal(HttpStatusCode.UpgradeRequired,
            (await plain.GetAsync("/api/v1/assets?siteId=alpha")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await plain.GetAsync("/api/v1/system/snapshot")).StatusCode);
    }

    [Fact]
    public async Task AnonymousApiAndInvalidCsrfAreDenied()
    {
        using var host = new TestHost();
        using var client = host.HttpsClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/assets?siteId=alpha")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/api/v1/not-an-existing-api")).StatusCode);

        await host.AddUser(Admin, InitialPassword, "admin");
        // No antiforgery token, even with correct credentials.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/auth/login",
                new { email = Admin, password = InitialPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(client, Admin, InitialPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/assets",
                new { siteId = "alpha", displayName = "Core" })).StatusCode);
    }

    [Fact]
    public async Task AuthenticatedUsersOnlySeeTheirOwnSiteAndMutateByRole()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        using var admin = host.HttpsClient();
        using var op = host.HttpsClient();
        using var viewer = host.HttpsClient();
        Assert.Equal(HttpStatusCode.OK, (await Login(admin, Admin, InitialPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(op, "operator@example.invalid", UserPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(viewer, "viewer@example.invalid", UserPassword)).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await op.GetAsync("/api/v1/assets?siteId=beta")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.GetAsync("/api/v1/topology/graph?siteId=beta")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(viewer, "/api/v1/assets",
                new { siteId = "alpha", displayName = "PC" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(op, "/api/v1/admin/users",
                new { email = "intruder@example.invalid", password = UserPassword,
                    role = "admin", siteId = (string?)null })).StatusCode);

        var registration = await Post(op, "/api/v1/assets",
            new { siteId = "alpha", displayName = "SW-01" });
        Assert.Equal(HttpStatusCode.Created, registration.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(op, "/api/v1/assets",
                new { siteId = "beta", displayName = "Unauthorized" })).StatusCode);
        var assets = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/assets?siteId=alpha");
        Assert.Equal(1, assets.GetProperty("total").GetInt32());
        Assert.Equal("SW-01",
            assets.GetProperty("items")[0].GetProperty("displayName").GetString());
        var sites = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/sites");
        Assert.Equal("alpha", sites.GetProperty("sites")[0].GetString());

        var summary = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/overview/summary?siteId=alpha");
        Assert.Equal(1, summary.GetProperty("registeredAssets").GetInt32());
        Assert.Equal("unverified-no-active-monitoring",
            summary.GetProperty("status").GetString());

        var users = await admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/users");
        Assert.Equal(3, users.GetArrayLength());
    }

    [Fact]
    public async Task AdminSitesIncludeAssignmentsEvenWithoutAssets()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        await host.AddUser("assigned@example.invalid", UserPassword, "viewer", "new-site");
        using var admin = host.HttpsClient();
        using var viewer = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(viewer, "assigned@example.invalid", UserPassword);
        var adminSites = await admin.GetFromJsonAsync<JsonElement>("/api/v1/sites");
        Assert.Contains(adminSites.GetProperty("sites").EnumerateArray(),
            x => x.GetString() == "new-site");
        var viewerSites = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/sites");
        Assert.Single(viewerSites.GetProperty("sites").EnumerateArray());
        Assert.Equal("new-site", viewerSites.GetProperty("sites")[0].GetString());
    }

    [Fact]
    public async Task DisablingAccountInvalidatesAlreadyIssuedCookies()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        var id = await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        using var admin = host.HttpsClient();
        using var viewer = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(viewer, "viewer@example.invalid", UserPassword);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(admin, $"/api/v1/admin/users/{id}/disable", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await viewer.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Login(viewer, "viewer@example.invalid", UserPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(admin, $"/api/v1/admin/users/{id}/enable", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(viewer, "viewer@example.invalid", UserPassword)).StatusCode);
    }

    [Fact]
    public async Task ChangingPasswordRevokesOldCookieAndRejectsOldPassword()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        using var client = host.HttpsClient();
        await Login(client, Admin, InitialPassword);
        const string newPassword = "Replaced-Strong-Password-2026!";
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Post(client, "/api/v1/auth/password",
                new { currentPassword = "wrong", newPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(client, "/api/v1/auth/password",
                new { currentPassword = InitialPassword, newPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Login(client, Admin, InitialPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(client, Admin, newPassword)).StatusCode);
    }

    [Fact]
    public async Task LockoutBlocksCorrectPasswordAndDoesNotPermitUnknownAccount()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        using var client = host.HttpsClient();
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await Login(client, Admin, "invalid-candidate")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Login(client, Admin, InitialPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Login(client, "unknown@example.invalid", InitialPassword)).StatusCode);
    }

    [Fact]
    public async Task AdminResetRevokesPriorUserCookieAndAllowsReplacementCredentials()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        var id = await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        using var admin = host.HttpsClient();
        using var op = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(op, "operator@example.invalid", UserPassword);
        const string rotated = "Strong-Reset-Operator-Password!";
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(admin, $"/api/v1/admin/users/{id}/reset-password",
                new { newPassword = rotated })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await op.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Login(op, "operator@example.invalid", UserPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(op, "operator@example.invalid", rotated)).StatusCode);
    }

    [Fact]
    public async Task AdministratorCanRotateRoleAndSiteWithImmediateSessionRevocation()
    {
        using var host = new TestHost();
        var adminId = await host.AddUser(Admin, InitialPassword, "admin");
        var opId = await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        using var admin = host.HttpsClient();
        using var op = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(op, "operator@example.invalid", UserPassword);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(admin, $"/api/v1/admin/users/{adminId}/access",
                new { role = "viewer", siteId = "beta" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(admin, $"/api/v1/admin/users/{opId}/access",
                new { role = "viewer", siteId = (string?)null })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(admin, $"/api/v1/admin/users/{opId}/access",
                new { role = "viewer", siteId = "beta" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await op.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(op, "operator@example.invalid", UserPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await op.GetAsync("/api/v1/assets?siteId=alpha")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await op.GetAsync("/api/v1/assets?siteId=beta")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(op, "/api/v1/assets",
                new { siteId = "beta", displayName = "Not allowed" })).StatusCode);
    }

    [Fact]
    public async Task ReportedTopologyIsIsolatedBySiteAndDoesNotClaimPhysicalLoop()
    {
        using var host = new TestHost();
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        using var op = host.HttpsClient();
        await Login(op, "operator@example.invalid", UserPassword);
        var now = DateTimeOffset.UtcNow.AddSeconds(-10);
        var links = new[] {
            new { siteId = "alpha", sourceKey = "A", targetKey = "B",
                sourcePort = "1", targetPort = "1", protocol = "MANUAL",
                observedAtUtc = now, ttlSeconds = 3600 },
            new { siteId = "alpha", sourceKey = "B", targetKey = "C",
                sourcePort = "2", targetPort = "2", protocol = "MANUAL",
                observedAtUtc = now, ttlSeconds = 3600 },
            new { siteId = "alpha", sourceKey = "C", targetKey = "A",
                sourcePort = "3", targetPort = "3", protocol = "MANUAL",
                observedAtUtc = now, ttlSeconds = 3600 }
        };
        Assert.Equal(HttpStatusCode.Accepted,
            (await Post(op, "/api/v1/discovery/observations", links)).StatusCode);
        var graph = await op.GetFromJsonAsync<JsonElement>("/api/v1/topology/graph?siteId=alpha");
        Assert.Equal(3, graph.GetProperty("nodes").GetArrayLength());
        Assert.Equal(3, graph.GetProperty("links").GetArrayLength());
        Assert.Equal(1, graph.GetProperty("links").EnumerateArray()
            .Count(x => x.GetProperty("possibleCycle").GetBoolean()));
        Assert.Equal("operator-reported-unverified", graph.GetProperty("provenance").GetString());
        Assert.Equal(HttpStatusCode.Forbidden,
            (await op.GetAsync("/api/v1/topology/graph?siteId=beta")).StatusCode);
    }

    [Fact]
    public async Task ReportedTopologyRejectsControlCharactersInPortNames()
    {
        using var host = new TestHost();
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        using var op = host.HttpsClient();
        await Login(op, "operator@example.invalid", UserPassword);
        var bad = new[] { new {
            siteId = "alpha", sourceKey = "A", targetKey = "B",
            sourcePort = "eth0" + (char)10 + "malicious", targetPort = "eth1", protocol = "MANUAL",
            observedAtUtc = DateTimeOffset.UtcNow.AddSeconds(-2), ttlSeconds = 3600
        } };
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(op, "/api/v1/discovery/observations", bad)).StatusCode);
        var graph = await op.GetFromJsonAsync<JsonElement>("/api/v1/topology/graph?siteId=alpha");
        Assert.Empty(graph.GetProperty("links").EnumerateArray());
    }

    [Fact]
    public async Task EvidenceRetractionPreservesHistoryButRemovesGraphAndOverviewCounts()
    {
        using var host = new TestHost();
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        using var op = host.HttpsClient();
        using var viewer = host.HttpsClient();
        await Login(op, "operator@example.invalid", UserPassword);
        await Login(viewer, "viewer@example.invalid", UserPassword);
        var evidence = new[] { new {
            siteId = "alpha", sourceKey = "Core", targetKey = "Access",
            sourcePort = "Gi1", targetPort = "Gi2", protocol = "LLDP",
            observedAtUtc = DateTimeOffset.UtcNow.AddSeconds(-3), ttlSeconds = 3600
        } };
        Assert.Equal(HttpStatusCode.Accepted,
            (await Post(op, "/api/v1/discovery/observations", evidence)).StatusCode);
        var listing = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/discovery/observations?siteId=alpha");
        Assert.Equal(1, listing.GetProperty("total").GetInt32());
        Assert.Equal("fresh", listing.GetProperty("items")[0].GetProperty("status").GetString());
        var id = listing.GetProperty("items")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(viewer, $"/api/v1/discovery/observations/{id}/retract", new { })).StatusCode);
        var before = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/overview/summary?siteId=alpha");
        Assert.Equal(1, before.GetProperty("freshReportedObservations").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(op, $"/api/v1/discovery/observations/{id}/retract", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(op, $"/api/v1/discovery/observations/{id}/retract", new { })).StatusCode);
        var after = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/overview/summary?siteId=alpha");
        Assert.Equal(0, after.GetProperty("freshReportedObservations").GetInt32());
        var graph = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/topology/graph?siteId=alpha");
        Assert.Empty(graph.GetProperty("links").EnumerateArray());
        Assert.Empty(graph.GetProperty("nodes").EnumerateArray());
        var history = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/discovery/observations?siteId=alpha&page=1&pageSize=1");
        Assert.Equal(1, history.GetProperty("total").GetInt32());
        Assert.Equal("retracted", history.GetProperty("items")[0].GetProperty("status").GetString());
        Assert.False(history.GetProperty("items")[0].GetProperty("retractedAtUtc").ValueKind ==
            JsonValueKind.Null);
    }

    [Fact]
    public async Task EvidenceListingAndRetractionAreSiteScoped()
    {
        using var host = new TestHost();
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        await host.AddUser("other@example.invalid", UserPassword, "operator", "beta");
        using var op = host.HttpsClient();
        using var other = host.HttpsClient();
        await Login(op, "operator@example.invalid", UserPassword);
        await Login(other, "other@example.invalid", UserPassword);
        var now = DateTimeOffset.UtcNow.AddSeconds(-2);
        Assert.Equal(HttpStatusCode.Accepted, (await Post(op,
            "/api/v1/discovery/observations", new[] { new {
                siteId = "alpha", sourceKey = "A", targetKey = "B",
                sourcePort = "1", targetPort = "2", protocol = "MANUAL",
                observedAtUtc = now, ttlSeconds = 3600
            } })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await other.GetAsync("/api/v1/discovery/observations?siteId=alpha")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await op.GetAsync("/api/v1/discovery/observations?siteId=alpha&pageSize=101")).StatusCode);
        var list = await op.GetFromJsonAsync<JsonElement>(
            "/api/v1/discovery/observations?siteId=alpha");
        var id = list.GetProperty("items")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound,
            (await Post(other, $"/api/v1/discovery/observations/{id}/retract", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await op.PostAsJsonAsync($"/api/v1/discovery/observations/{id}/retract", new { })).StatusCode);
        var graph = await op.GetFromJsonAsync<JsonElement>(
            "/api/v1/topology/graph?siteId=alpha");
        Assert.Single(graph.GetProperty("links").EnumerateArray());
    }

    [Fact]
    public async Task OfflineDiscoveryWalkUsesOnlyApprovedSiteEvidenceWithoutNetworkProbes()
    {
        using var host = new TestHost();
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        await host.AddUser("other@example.invalid", UserPassword, "viewer", "beta");
        using var op = host.HttpsClient();
        using var other = host.HttpsClient();
        await Login(op, "operator@example.invalid", UserPassword);
        await Login(other, "other@example.invalid", UserPassword);
        var now = DateTimeOffset.UtcNow.AddSeconds(-3);
        Assert.Equal(HttpStatusCode.Accepted, (await Post(op,
            "/api/v1/discovery/observations", new[] {
                new { siteId = "alpha", sourceKey = "A", targetKey = "B",
                    sourcePort = "1", targetPort = "2", protocol = "LLDP",
                    observedAtUtc = now, ttlSeconds = 3600 },
                new { siteId = "alpha", sourceKey = "B", targetKey = "C",
                    sourcePort = "3", targetPort = "4", protocol = "LLDP",
                    observedAtUtc = now, ttlSeconds = 3600 },
            })).StatusCode);
        var request = new {
            siteId = "alpha", approvedAssets = new[] { "B", "A" },
            seeds = new[] { "B" }, maxNodes = 2, maxDepth = 8,
            maxNeighborsPerNode = 64
        };
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(other,
            "/api/v1/discovery/walk-preview", request)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(op,
            "/api/v1/discovery/walk-preview", new {
                siteId = "alpha", approvedAssets = new[] { "A" }, seeds = new[] { "outside" }
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await op.PostAsJsonAsync(
            "/api/v1/discovery/walk-preview", request)).StatusCode);
        var response = await Post(op, "/api/v1/discovery/walk-preview", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("stored-evidence-only", data.GetProperty("mode").GetString());
        Assert.Equal(1, data.GetProperty("skippedOutOfScope").GetInt32());
        Assert.Equal(2, data.GetProperty("probedAssets").GetInt32());
        var graph = data.GetProperty("graph");
        Assert.Equal("operator-reported-unverified", graph.GetProperty("provenance").GetString());
        Assert.Equal(2, graph.GetProperty("nodes").GetArrayLength());
        Assert.Equal(1, graph.GetProperty("links").GetArrayLength());
        Assert.DoesNotContain(graph.GetProperty("nodes").EnumerateArray(),
            n => n.GetProperty("id").GetString() == "C");
    }

    [Fact]
    public async Task ManualIncidentWorkflowIsScopedAuditedAndDoesNotClaimAutomatedDetection()
    {
        using var host = new TestHost();
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        await host.AddUser("other@example.invalid", UserPassword, "operator", "beta");
        using var op = host.HttpsClient();
        using var viewer = host.HttpsClient();
        using var other = host.HttpsClient();
        await Login(op, "operator@example.invalid", UserPassword);
        await Login(viewer, "viewer@example.invalid", UserPassword);
        await Login(other, "other@example.invalid", UserPassword);
        var incident = new {
            siteId = "alpha", title = "Switch unreachable (reported)",
            description = "Operator observation, no automatic probe", severity = "high"
        };
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(viewer, "/api/v1/incidents", incident)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(other, "/api/v1/incidents", incident)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await op.PostAsJsonAsync("/api/v1/incidents", incident)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(op, "/api/v1/incidents", new {
                siteId = "alpha", title = "Invalid", description = "", severity = "emergency"
            })).StatusCode);
        var created = await Post(op, "/api/v1/incidents", incident);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var createdBody = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = createdBody.GetProperty("id").GetGuid();
        Assert.Equal("operator-reported", createdBody.GetProperty("origin").GetString());
        Assert.Equal(HttpStatusCode.Forbidden,
            (await other.GetAsync("/api/v1/incidents?siteId=alpha")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await viewer.GetAsync("/api/v1/incidents?siteId=alpha&pageSize=101")).StatusCode);
        var list = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/incidents?siteId=alpha&status=open");
        Assert.Equal(1, list.GetProperty("total").GetInt32());
        Assert.False(list.GetProperty("automatedDetection").GetBoolean());
        Assert.Equal("operator-reported-unverified", list.GetProperty("provenance").GetString());
        Assert.Equal(HttpStatusCode.NotFound,
            (await Post(other, $"/api/v1/incidents/{id}/status",
                new { status = "resolved" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(viewer, $"/api/v1/incidents/{id}/status",
                new { status = "resolved" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(op, $"/api/v1/incidents/{id}/status",
                new { status = "reopened" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(op, $"/api/v1/incidents/{id}/status",
                new { status = "acknowledged" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(op, $"/api/v1/incidents/{id}/status",
                new { status = "resolved" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await Post(op, $"/api/v1/incidents/{id}/status",
                new { status = "acknowledged" })).StatusCode);
        var resolved = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/incidents?siteId=alpha&status=resolved");
        Assert.Single(resolved.GetProperty("items").EnumerateArray());
        Assert.Equal("operator@example.invalid",
            resolved.GetProperty("items")[0].GetProperty("resolvedBy").GetString());
        await using var scope = host.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
        Assert.Equal(3, await db.OperatorAudit.CountAsync(x => x.Target == id.ToString()));
    }

    [Fact]
    public async Task AgentRegistryIsReadOnlyAndDoesNotInferHeartbeatHealth()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.AgentInstallations.Add(new AgentInstallationRecord {
                AgentId = Guid.NewGuid(), InstallationEpoch = Guid.NewGuid(),
                SiteId = "alpha", AgentVersion = "0.1.0", LastReceivedAtUtc = null
            });
            db.AgentInstallations.Add(new AgentInstallationRecord {
                AgentId = Guid.NewGuid(), InstallationEpoch = Guid.NewGuid(),
                SiteId = "beta", AgentVersion = "0.2.0", LastReceivedAtUtc = null
            });
            await db.SaveChangesAsync();
        }
        using var admin = host.HttpsClient();
        using var viewer = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(viewer, "viewer@example.invalid", UserPassword);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.GetAsync("/api/v1/agents?siteId=beta")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.GetAsync("/api/v1/agents?siteId=alpha&pageSize=101")).StatusCode);
        var data = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/agents?siteId=alpha");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        Assert.Equal("registration-only-not-verified", data.GetProperty("provenance").GetString());
        Assert.Equal("disabled", data.GetProperty("monitoring").GetString());
        Assert.Equal(JsonValueKind.Null,
            data.GetProperty("items")[0].GetProperty("lastReceivedAtUtc").ValueKind);
        var caps = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/agents/capabilities");
        Assert.False(caps.GetProperty("enrollmentEnabled").GetBoolean());
        Assert.False(caps.GetProperty("heartbeatVerified").GetBoolean());
        Assert.False(caps.GetProperty("signedUpdatesEnabled").GetBoolean());
    }

    [Fact]
    public async Task AuditEventsAreVisibleOnlyToAdminAndHaveBoundedPagination()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        using var admin = host.HttpsClient();
        using var viewer = host.HttpsClient();
        Assert.Equal(HttpStatusCode.OK, (await Login(admin, Admin, InitialPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(viewer, "viewer@example.invalid", UserPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.GetAsync("/api/v1/admin/audit")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.GetAsync("/api/v1/admin/audit?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.GetAsync("/api/v1/admin/audit?pageSize=101")).StatusCode);
        var audit = await admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/audit?page=1&pageSize=1");
        Assert.True(audit.GetProperty("total").GetInt32() >= 2);
        Assert.Single(audit.GetProperty("items").EnumerateArray());
        var eventItem = audit.GetProperty("items")[0];
        Assert.Equal("auth.login", eventItem.GetProperty("action").GetString());
        Assert.False(eventItem.TryGetProperty("passwordHash", out _));
        Assert.False(eventItem.TryGetProperty("password", out _));
    }

    [Fact]
    public async Task ActiveScanCreationRequiresAdminCsrfAndExplicitPrivateBoundedCidr()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        using var admin = host.HttpsClient();
        using var op = host.HttpsClient();
        using var viewer = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(op, "operator@example.invalid", UserPassword);
        await Login(viewer, "viewer@example.invalid", UserPassword);
        var body = new { siteId = "alpha", cidrs = new[] { "10.12.0.0/24" }, intervalSeconds = 60, approved = true };

        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(op, "/api/v1/discovery/scans", body)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.PostAsJsonAsync("/api/v1/discovery/scans", body)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(admin, "/api/v1/discovery/scans",
                new { siteId = "alpha", cidrs = new[] { "10.12.0.0/24" },
                    intervalSeconds = 60 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(admin, "/api/v1/discovery/scans",
                new { siteId = "alpha", cidrs = new[] { "8.8.8.8/32" }, intervalSeconds = 60, approved = true })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(admin, "/api/v1/discovery/scans",
                new { siteId = "alpha", cidrs = new[] { "10.0.0.0/16" }, intervalSeconds = 60, approved = true })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(admin, "/api/v1/discovery/scans",
                new { siteId = "alpha", cidrs = new[] { "10.12.0.0/24" }, intervalSeconds = 1, approved = true })).StatusCode);

        var created = await Post(admin, "/api/v1/discovery/scans", body);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var doc = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(254, doc.GetProperty("targetCount").GetInt32());
        Assert.Equal("pending", doc.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict,
            (await Post(admin, "/api/v1/discovery/scans", body)).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.GetAsync("/api/v1/discovery/scans?siteId=beta")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.GetAsync("/api/v1/discovery/hosts?siteId=beta")).StatusCode);
        var jobs = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/discovery/scans?siteId=alpha");
        Assert.Single(jobs.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(viewer,
                $"/api/v1/discovery/scans/{doc.GetProperty("id").GetGuid()}/cancel",
                new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted,
            (await Post(admin,
                $"/api/v1/discovery/scans/{doc.GetProperty("id").GetGuid()}/cancel",
                new { })).StatusCode);
        var cancelling = await admin.GetFromJsonAsync<JsonElement>(
            "/api/v1/discovery/scans?siteId=alpha");
        Assert.Equal("cancelling",
            cancelling.GetProperty("items")[0].GetProperty("status").GetString());
        await using var scope = host.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
        Assert.Equal(2, await db.OperatorAudit.CountAsync(x => x.Action.StartsWith("discovery.scan.")));
        Assert.Empty(await db.NetworkScanHosts.ToArrayAsync());
    }

    [Fact]
    public async Task ScanOnlyWorkspaceAppearsInAdminSiteListAndScopeSuggestionsStayAdminOnly()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "assigned-site");
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.NetworkScanJobs.Add(new NetworkScanJobRecord {
                Id = Guid.NewGuid(), SiteId = "scan-only-workspace",
                Cidrs = "[\\\"10.10.0.0/24\\\"]", Status = "cancelled",
                IntervalSeconds = 60, TargetCount = 254,
                RequestedBy = Admin, RequestedAtUtc = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }
        using var admin = host.HttpsClient();
        using var viewer = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(viewer, "viewer@example.invalid", UserPassword);
        var sites = await admin.GetFromJsonAsync<JsonElement>("/api/v1/sites");
        Assert.Contains(sites.GetProperty("sites").EnumerateArray(),
            x => x.GetString() == "scan-only-workspace");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.GetAsync("/api/v1/discovery/host-scope-candidates")).StatusCode);
        var choices = await admin.GetFromJsonAsync<JsonElement>(
            "/api/v1/discovery/host-scope-candidates");
        Assert.False(choices.GetProperty("available").GetBoolean());
    }

    [Fact]
    public async Task PositiveProbeHostsBecomeGraphNodesWithoutInventedLinksOrHealth()
    {
        using var host = new TestHost();
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        var jobId = Guid.NewGuid();
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.NetworkScanJobs.Add(new NetworkScanJobRecord {
                Id = jobId, SiteId = "alpha",
                Cidrs = JsonSerializer.Serialize(new[] { "10.1.2.0/24" }),
                Status = "running", IntervalSeconds = 60, TargetCount = 254,
                RequestedBy = Admin, RequestedAtUtc = DateTimeOffset.UtcNow
            });
            db.NetworkScanHosts.Add(new NetworkScanHostRecord {
                Id = Guid.NewGuid(), SiteId = "alpha", Address = "10.1.2.42",
                Status = "unresponsive", IcmpResponded = false, TcpPorts = "",
                LastSeenAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
                LastProbedAtUtc = DateTimeOffset.UtcNow, LastJobId = jobId
            });
            db.NetworkScanEvents.Add(new NetworkScanEventRecord {
                SiteId = "alpha", JobId = jobId, Kind = "host-unresponsive",
                Address = "10.1.2.42", Status = "unresponsive",
                ProbedCount = 50, TargetCount = 254, AtUtc = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }
        using var viewer = host.HttpsClient();
        await Login(viewer, "viewer@example.invalid", UserPassword);
        var graph = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/topology/graph?siteId=alpha");
        Assert.Equal("active-ipv4-and-reported-evidence",
            graph.GetProperty("provenance").GetString());
        var node = Assert.Single(graph.GetProperty("nodes").EnumerateArray());
        Assert.Equal("10.1.2.42", node.GetProperty("id").GetString());
        Assert.Equal("unresponsive", node.GetProperty("probeStatus").GetString());
        Assert.Empty(graph.GetProperty("links").EnumerateArray());
        var logicalSegment = Assert.Single(graph.GetProperty("logicalSegments").EnumerateArray());
        Assert.Equal("10.1.2.0/24", logicalSegment.GetProperty("cidr").GetString());
        Assert.Equal("10.1.2.42",
            Assert.Single(logicalSegment.GetProperty("hostIds").EnumerateArray()).GetString());

        var overview = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/overview/summary?siteId=alpha");
        Assert.Equal(1, overview.GetProperty("scannedHosts").GetInt32());
        Assert.Equal(0, overview.GetProperty("respondingNow").GetInt32());
        Assert.True(overview.GetProperty("scanActive").GetBoolean());
        Assert.Equal("active-ipv4-probing", overview.GetProperty("status").GetString());
        var hosts = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/discovery/hosts?siteId=alpha");
        Assert.Single(hosts.GetProperty("items").EnumerateArray());
        Assert.Equal("unresponsive",
            hosts.GetProperty("items")[0].GetProperty("status").GetString());

        // A cancelled/failed scan cannot leave old hosts shown as online forever.
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            var job = await db.NetworkScanJobs.SingleAsync(x => x.Id == jobId);
            job.Status = "cancelled";
            await db.SaveChangesAsync();
        }
        var staleGraph = await viewer.GetFromJsonAsync<JsonElement>(
            "/api/v1/topology/graph?siteId=alpha");
        Assert.Equal("stale",
            staleGraph.GetProperty("nodes")[0].GetProperty("probeStatus").GetString());
        var staleHosts = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/discovery/hosts?siteId=alpha");
        Assert.Equal("stale",
            staleHosts.GetProperty("items")[0].GetProperty("status").GetString());
        var ev = await viewer.GetFromJsonAsync<JsonElement>(
            $"/api/v1/discovery/scans/{jobId}/events");
        Assert.Equal("host-unresponsive",
            ev.GetProperty("items")[0].GetProperty("kind").GetString());
    }

    [Fact]
    public async Task TopologyApiDistinguishesReciprocalAndConflictingLldpWithoutInventingFdbEdges()
    {
        using var host = new TestHost();
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        var now = DateTimeOffset.UtcNow.AddSeconds(-4);
        var a = "10.21.0.1";
        var b = "10.21.0.2";
        var c = "10.21.0.3";
        var observations = new[] {
            new LldpNeighborRecord {
                Id = Guid.NewGuid(), SiteId = "alpha", LocalAddress = a,
                LocalPort = "Gi1", RemoteChassisId = "4:CCDDEEFF0011",
                RemotePort = "Gi2", ObservedAtUtc = now
            },
            new LldpNeighborRecord {
                Id = Guid.NewGuid(), SiteId = "alpha", LocalAddress = b,
                LocalPort = "Gi2", RemoteChassisId = "4:AABBCCDDEEFF",
                RemotePort = "Gi1", ObservedAtUtc = now
            },
            new LldpNeighborRecord {
                Id = Guid.NewGuid(), SiteId = "alpha", LocalAddress = a,
                LocalPort = "Gi1", RemoteChassisId = "4:001122334455",
                RemotePort = "Gi3", ObservedAtUtc = now
            },
        };
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.ManagedNetworkDevices.AddRange(
                new ManagedNetworkDeviceRecord { SiteId = "alpha", Address = a,
                    Kind = "switch", SystemName = "a", ChassisId = "4:AABBCCDDEEFF", LastSeenAtUtc = now },
                new ManagedNetworkDeviceRecord { SiteId = "alpha", Address = b,
                    Kind = "switch", SystemName = "b", ChassisId = "4:CCDDEEFF0011", LastSeenAtUtc = now },
                new ManagedNetworkDeviceRecord { SiteId = "alpha", Address = c,
                    Kind = "switch", SystemName = "c", ChassisId = "4:001122334455", LastSeenAtUtc = now });
            db.LldpNeighbors.AddRange(observations);
            db.FdbLearnedMacs.Add(new FdbLearnedMacRecord {
                Id = Guid.NewGuid(), SiteId = "alpha", BridgeAddress = a,
                MacAddress = "00:11:22:33:44:55", LearnedPort = "Gi9", ObservedAtUtc = now
            });
            await db.SaveChangesAsync();
        }
        using var viewer = host.HttpsClient();
        await Login(viewer, "viewer@example.invalid", UserPassword);
        var graph = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/topology/graph?siteId=alpha");
        Assert.Equal(2, graph.GetProperty("links").GetArrayLength());
        Assert.All(graph.GetProperty("links").EnumerateArray(),
            x => Assert.Equal("ambiguous-port", x.GetProperty("corroboration").GetString()));
        Assert.Equal(1, graph.GetProperty("nodes").EnumerateArray()
            .Single(x => x.GetProperty("id").GetString() == a)
            .GetProperty("learnedMacCount").GetInt32());

        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.LldpNeighbors.Remove(await db.LldpNeighbors.SingleAsync(
                x => x.Id == observations[2].Id));
            await db.SaveChangesAsync();
        }
        graph = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/topology/graph?siteId=alpha");
        var link = Assert.Single(graph.GetProperty("links").EnumerateArray());
        Assert.Equal("reciprocal", link.GetProperty("corroboration").GetString());
        Assert.Equal(2, link.GetProperty("evidenceIds").GetArrayLength());

        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.LldpNeighbors.Remove(await db.LldpNeighbors.SingleAsync(
                x => x.Id == observations[1].Id));
            await db.SaveChangesAsync();
        }
        graph = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/topology/graph?siteId=alpha");
        link = Assert.Single(graph.GetProperty("links").EnumerateArray());
        Assert.Equal("single-sided", link.GetProperty("corroboration").GetString());
        Assert.Equal(1, link.GetProperty("evidenceIds").GetArrayLength());
    }

    [Fact]
    public async Task OnlyAdministratorCanApproveAndRevokeAnAgentCertificate()
    {
        using var host = new TestHost();
        await host.AddUser(Admin, InitialPassword, "admin");
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        using var admin = host.HttpsClient();
        using var op = host.HttpsClient();
        await Login(admin, Admin, InitialPassword);
        await Login(op, "operator@example.invalid", UserPassword);
        var id = Guid.NewGuid();
        var epoch = Guid.NewGuid();
        var certificateThumbprint = new string('A', 40);
        var req = new { agentId = id, installationEpoch = epoch, siteId = "alpha",
            clientCertificateThumbprint = certificateThumbprint };
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(op, "/api/v1/admin/agents/approve", req)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.PostAsJsonAsync("/api/v1/admin/agents/approve", req)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(admin, "/api/v1/admin/agents/approve", new {
                agentId = id, installationEpoch = epoch, siteId = "alpha",
                clientCertificateThumbprint = "not-a-certificate" })).StatusCode);
        var approved = await Post(admin, "/api/v1/admin/agents/approve", req);
        Assert.Equal(HttpStatusCode.Created, approved.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await Post(admin, "/api/v1/admin/agents/approve", req)).StatusCode);
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            var registered = await db.AgentInstallations.SingleAsync(x => x.AgentId == id);
            Assert.Equal(epoch, registered.InstallationEpoch);
            Assert.Equal("alpha", registered.SiteId);
            Assert.Equal(certificateThumbprint, registered.ClientCertificateThumbprint);
            Assert.Single(await db.OperatorAudit.Where(x => x.Action == "agent.approve").ToListAsync());
        }
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(op, $"/api/v1/admin/agents/{id}/revoke", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await Post(admin, $"/api/v1/admin/agents/{id}/revoke", new { })).StatusCode);
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            Assert.NotNull((await db.AgentInstallations.SingleAsync(x => x.AgentId == id)).RevokedAtUtc);
        }
    }

    [Fact]
    public async Task AgentReportedIpAppearsAsProvisionalNodeWithoutInventingPhysicalLink()
    {
        using var host = new TestHost();
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        await host.AddUser("outsider@example.invalid", UserPassword, "viewer", "beta");
        var agentId = Guid.NewGuid();
        var epoch = Guid.NewGuid();
        var collectedAt = DateTimeOffset.UtcNow.AddSeconds(-3);
        var report = new InfraGraph.Contracts.Agents.AgentInventoryV1(
            agentId, epoch, "FINANCE-PC-01", "Windows 11", "0.1-preview", "Intel CPU", 8,
            16L * 1024 * 1024 * 1024,
            Array.Empty<InfraGraph.Contracts.Agents.GpuInfoV1>(),
            Array.Empty<InfraGraph.Contracts.Agents.DiskInfoV1>(),
            new[] { new InfraGraph.Contracts.Agents.NetworkInfoV1("Ethernet",
                "AABBCCDDEEFF", new[] { "10.4.5.31" }, "Up") },
            Array.Empty<InfraGraph.Contracts.Agents.PnpDeviceInfoV1>(),
            collectedAt);
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.AgentInstallations.Add(new AgentInstallationRecord {
                AgentId = agentId, InstallationEpoch = epoch, SiteId = "alpha",
                AgentVersion = "0.1-preview", LastReceivedAtUtc = DateTimeOffset.UtcNow,
                LastInventoryAtUtc = collectedAt,
                ClientCertificateThumbprint = new string('B', 40)
            });
            db.AgentInventories.Add(new AgentInventoryRecord {
                AgentId = agentId, SiteId = "alpha",
                Snapshot = JsonSerializer.Serialize(report, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
                CollectedAtUtc = collectedAt, ReceivedAtUtc = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        using var viewer = host.HttpsClient();
        using var outsider = host.HttpsClient();
        await Login(viewer, "viewer@example.invalid", UserPassword);
        await Login(outsider, "outsider@example.invalid", UserPassword);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await outsider.GetAsync("/api/v1/agents/inventory?siteId=alpha")).StatusCode);

        var inventory = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/agents/inventory?siteId=alpha");
        var row = Assert.Single(inventory.GetProperty("items").EnumerateArray());
        Assert.Equal("FINANCE-PC-01", row.GetProperty("inventory").GetProperty("hostName").GetString());
        var detail = await viewer.GetFromJsonAsync<JsonElement>(
            $"/api/v1/agents/{agentId}/inventory");
        Assert.Equal(agentId, detail.GetProperty("agentId").GetGuid());
        Assert.Equal(16L * 1024 * 1024 * 1024,
            detail.GetProperty("inventory").GetProperty("ramTotalBytes").GetInt64());
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.GetAsync($"/api/v1/agents/{agentId}/inventory")).StatusCode);


        var graph = await viewer.GetFromJsonAsync<JsonElement>("/api/v1/topology/graph?siteId=alpha");
        var node = Assert.Single(graph.GetProperty("nodes").EnumerateArray());
        Assert.Equal("10.4.5.31", node.GetProperty("id").GetString());
        Assert.Equal("workstation", node.GetProperty("deviceKind").GetString());
        Assert.Equal("agent-self-reported-ip", node.GetProperty("identitySource").GetString());
        Assert.Equal(agentId, node.GetProperty("agentId").GetGuid());
        Assert.Empty(graph.GetProperty("links").EnumerateArray());
    }

    private static async Task<HttpResponseMessage> Login(HttpClient client, string email, string password) =>
        await Post(client, "/api/v1/auth/login", new { email, password });

    private static async Task<HttpResponseMessage> Post(HttpClient client, string path, object value)
    {
        var csrf = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/csrf");
        using var request = new HttpRequestMessage(HttpMethod.Post, path) {
            Content = JsonContent.Create(value)
        };
        request.Headers.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
        return await client.SendAsync(request);
    }

    [Fact]
    public async Task DiagnosticsAreOneShotAuditedAndRestrictedToRecentApprovedSiteHosts()
    {
        using var host = new TestHost();
        await host.AddUser("operator@example.invalid", UserPassword, "operator", "alpha");
        await host.AddUser("viewer@example.invalid", UserPassword, "viewer", "alpha");
        var now = DateTimeOffset.UtcNow;
        var jobId = Guid.NewGuid();
        await using (var scope = host.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            db.NetworkScanJobs.Add(new NetworkScanJobRecord {
                Id = jobId, SiteId = "alpha", Cidrs = "[\"192.168.88.0/24\"]",
                Status = "running", RequestedBy = "operator", RequestedAtUtc = now.AddMinutes(-4),
                IntervalSeconds = 60, TargetCount = 254
            });
            db.NetworkScanHosts.Add(new NetworkScanHostRecord {
                Id = Guid.NewGuid(), SiteId = "alpha", Address = "192.168.88.19",
                LastJobId = jobId, LastProbedAtUtc = now.AddMinutes(-1),
                LastSeenAtUtc = now.AddMinutes(-1), Status = "responsive", TcpPorts = "",
            });
            await db.SaveChangesAsync();
        }
        using var op = host.HttpsClient();
        using var viewer = host.HttpsClient();
        await Login(op, "operator@example.invalid", UserPassword);
        await Login(viewer, "viewer@example.invalid", UserPassword);
        var endpoint = "/api/v1/diagnostics/run";
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(viewer, endpoint, new {
                siteId = "alpha", address = "192.168.88.19", kind = "ping", confirmed = true
            })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Post(op, endpoint, new {
                siteId = "beta", address = "192.168.88.19", kind = "ping", confirmed = true
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Post(op, endpoint, new {
                siteId = "alpha", address = "192.168.88.19", kind = "ping", confirmed = false
            })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await Post(op, endpoint, new {
                siteId = "alpha", address = "8.8.8.8", kind = "ping", confirmed = true
            })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await Post(op, endpoint, new {
                siteId = "alpha", address = "192.168.88.20", kind = "ping", confirmed = true
            })).StatusCode);
        var result = await Post(op, endpoint, new {
            siteId = "alpha", address = "192.168.88.19", kind = "ping", confirmed = true
        });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var body = await result.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("controlplane", body.GetProperty("source").GetString());
        var trace = await Post(op, endpoint, new {
            siteId = "alpha", address = "192.168.88.19", kind = "traceroute", confirmed = true
        });
        Assert.Equal(HttpStatusCode.OK, trace.StatusCode);
        await using var check = host.Services.CreateAsyncScope();
        var audit = check.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
        Assert.Equal(2, await audit.OperatorAudit.CountAsync(x => x.Action.StartsWith("diagnostic.")));
        Assert.Equal(2, check.ServiceProvider.GetRequiredService<FakeDiagnosticProbe>().Calls);
    }

    private sealed class FakeDiagnosticProbe : INetworkDiagnosticProbe
    {
        public int Calls { get; private set; }
        public Task<DiagnosticResult> RunAsync(IPAddress target, string kind, CancellationToken ct)
        {
            Calls++;
            return Task.FromResult(new DiagnosticResult(kind, target.ToString(), "controlplane",
                DateTimeOffset.UtcNow, [new DiagnosticStep(1,"reply",target.ToString(),1)],
                true,1,1,1,"Test fixture: no packets emitted."));
        }
    }

    private sealed class TestHost : WebApplicationFactory<ControlPlaneMarker>
    {
        private readonly string _databaseName = Guid.NewGuid().ToString();
        private readonly InMemoryDatabaseRoot _root = new();

        public HttpClient HttpsClient() => CreateClient(new WebApplicationFactoryClientOptions {
            BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false,
            HandleCookies = true
        });

        public async Task<Guid> AddUser(string email, string password, string role, string? site = null)
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<InfraGraphDbContext>();
            var record = new OperatorRecord {
                Id = Guid.NewGuid(), Email = email, PasswordHash = "",
                Role = role, SiteId = site, CreatedAtUtc = DateTimeOffset.UtcNow
            };
            record.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<OperatorRecord>>()
                .HashPassword(record, password);
            db.Operators.Add(record);
            await db.SaveChangesAsync();
            return record.Id;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> {
                    ["ConnectionStrings:ControlPlane"] = "Host=unused;Database=in-memory-test"
                }));
            builder.ConfigureTestServices(services => {
                services.RemoveAll<INetworkDiagnosticProbe>();
                services.AddSingleton<FakeDiagnosticProbe>();
                services.AddSingleton<INetworkDiagnosticProbe>(provider => provider.GetRequiredService<FakeDiagnosticProbe>());
                services.RemoveAll<DbContextOptions<InfraGraphDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<InfraGraphDbContext>>();
                services.AddDbContext<InfraGraphDbContext>(options =>
                    options.UseInMemoryDatabase(_databaseName, _root));
            });
        }
    }
}