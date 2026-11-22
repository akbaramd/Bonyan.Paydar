using System.Net;
using System.Net.Http.Json;
using InfraGraph.AgentGateway;
using InfraGraph.ControlPlane;
using Microsoft.AspNetCore.Mvc.Testing;

namespace InfraGraph.IntegrationTests;

public class HostBoundaryTests
{
    [Fact]
    public async Task ControlPlane_PublishesOnlyExplicitScaffoldSnapshot()
    {
        using var host = new WebApplicationFactory<ControlPlaneMarker>();
        using var client = host.CreateClient();
        using var response = await client.GetAsync("/api/v1/system/snapshot");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = await System.Text.Json.JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        Assert.Equal("ScaffoldOnly", json.RootElement.GetProperty("stage").GetString());
        Assert.Equal(0, json.RootElement.GetProperty("registeredAssets").GetInt32());
    }

    [Fact]
    public async Task AgentGateway_DeniesHeartbeatUntilSecureEnrollmentExists()
    {
        using var host = new WebApplicationFactory<AgentGatewayMarker>();
        using var client = host.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/v1/agents/heartbeat", new { agentId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task ControlPlane_ReadinessIsFailClosed()
    {
        using var host = new WebApplicationFactory<ControlPlaneMarker>();
        using var client = host.CreateClient();
        using var response = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }
}
