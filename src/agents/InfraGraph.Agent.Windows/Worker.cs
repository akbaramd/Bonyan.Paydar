using System.Net.Http.Json;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using InfraGraph.Contracts.Agents;
namespace InfraGraph.Agent.Windows;

/// <summary>Read-only inventory reporter, disabled for remote transmission until a trusted certificate is provisioned.</summary>
public sealed class Worker(ILogger<Worker> logger, InventoryCollector collector) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var interval = 300;
            try
            {
                var config = AgentConfiguration.Load();
                interval = Math.Clamp(config.IntervalSeconds, 60, 3600);
                if (config.AgentId == Guid.Empty || config.InstallationEpoch == Guid.Empty)
                {
                    logger.LogWarning("Paydar Agent is not configured; waiting for an administrator");
                }
                else
                {
                    AgentInventoryV1 snapshot = await collector.CaptureAsync(config, stoppingToken);
                    var output = Path.Combine(AgentConfiguration.DirectoryPath, "last-inventory.json");
                    var temp = output + ".tmp";
                    await File.WriteAllTextAsync(temp, JsonSerializer.Serialize(snapshot), stoppingToken);
                    File.Move(temp, output, true);
                    logger.LogInformation("Collected endpoint inventory: {Host}", snapshot.HostName);
                    if (AgentConfiguration.IsValidHttpsUrl(config.ServerUrl))
                        await SendAsync(config, snapshot, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception e) { logger.LogWarning(e, "Inventory collection or delivery failed; will retry"); }
            await Task.Delay(TimeSpan.FromSeconds(interval), stoppingToken);
        }
    }

    private async Task SendAsync(AgentConfiguration config, AgentInventoryV1 snapshot, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(config.ClientCertificateThumbprint))
        {
            logger.LogWarning("A client certificate must be provisioned before Agent can connect");
            return;
        }
        using var store = new X509Store(StoreName.My, StoreLocation.LocalMachine);
        store.Open(OpenFlags.ReadOnly);
        var thumbprint = config.ClientCertificateThumbprint.Replace(" ", "", StringComparison.Ordinal);
        var certificate = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, validOnly: true)
            .OfType<X509Certificate2>().FirstOrDefault(c => c.HasPrivateKey &&
                c.NotBefore.ToUniversalTime() <= DateTime.UtcNow && c.NotAfter.ToUniversalTime() > DateTime.UtcNow);
        if (certificate is null)
        {
            logger.LogWarning("Configured client certificate missing, expired or without private key");
            return;
        }
        using var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(certificate);
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
        var target = new Uri(new Uri(config.ServerUrl!), "/api/v1/agents/inventory");
        using var response = await client.PostAsJsonAsync(target, snapshot, ct);
        if (!response.IsSuccessStatusCode)
            logger.LogWarning("Gateway rejected inventory: HTTP {Code}", (int)response.StatusCode);
        else logger.LogInformation("Inventory accepted by Paydar Gateway");
    }
}
