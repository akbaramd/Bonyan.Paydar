using System.Net.Http.Json;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using InfraGraph.Contracts.Agents;

namespace InfraGraph.Agent.Windows;

/// <summary>
/// Read-only inventory reporter. Delivery retries do not trigger repeated WMI/CIM
/// collection and never permit server-originated commands.
/// </summary>
public sealed class Worker(ILogger<Worker> logger, InventoryCollector collector) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        AgentInventoryV1? pending = null;
        DateTimeOffset lastCapture = DateTimeOffset.MinValue;
        Guid cachedEpoch = Guid.Empty;

        while (!stoppingToken.IsCancellationRequested)
        {
            var delaySeconds = 30; // Fast recheck while unconfigured or disconnected.
            try
            {
                var config = AgentConfiguration.Load();
                if (config.AgentId == Guid.Empty || config.InstallationEpoch == Guid.Empty)
                {
                    pending = null;
                    logger.LogWarning("Paydar Agent is not configured; waiting for an administrator");
                }
                else
                {
                    if (pending is null || cachedEpoch != config.InstallationEpoch ||
                        DateTimeOffset.UtcNow - lastCapture > TimeSpan.FromMinutes(5))
                    {
                        pending = await collector.CaptureAsync(config, stoppingToken);
                        cachedEpoch = config.InstallationEpoch;
                        lastCapture = pending.CollectedAtUtc;
                        var output = Path.Combine(AgentConfiguration.DirectoryPath, "last-inventory.json");
                        var temp = output + ".tmp";
                        await File.WriteAllTextAsync(temp, JsonSerializer.Serialize(pending), stoppingToken);
                        File.Move(temp, output, true);
                        logger.LogInformation("Collected endpoint inventory: {Host}", pending.HostName);
                    }

                    if (AgentConfiguration.IsValidHttpsUrl(config.ServerUrl) &&
                        await SendAsync(config, pending, stoppingToken))
                    {
                        pending = null;
                        delaySeconds = Math.Clamp(config.IntervalSeconds, 60, 3600);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception e) {
                logger.LogWarning(e, "Inventory collection or delivery failed; will retry");
            }
            await Task.Delay(TimeSpan.FromSeconds(delaySeconds), stoppingToken);
        }
    }

    private async Task<bool> SendAsync(AgentConfiguration config,
        AgentInventoryV1 snapshot, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(config.ClientCertificateThumbprint)) {
            logger.LogWarning("A client certificate must be provisioned before Agent can connect");
            return false;
        }

        using var store = new X509Store(StoreName.My, StoreLocation.LocalMachine);
        store.Open(OpenFlags.ReadOnly);
        var certificate = store.Certificates.Find(
            X509FindType.FindByThumbprint,
            config.ClientCertificateThumbprint.Replace(" ", "", StringComparison.Ordinal),
            validOnly: true)
            .OfType<X509Certificate2>().FirstOrDefault(c =>
                c.HasPrivateKey && c.NotBefore.ToUniversalTime() <= DateTime.UtcNow &&
                c.NotAfter.ToUniversalTime() > DateTime.UtcNow);
        if (certificate is null) {
            logger.LogWarning("Configured client certificate missing, expired or without private key");
            return false;
        }

        using var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(certificate);
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(15) };
        var target = new Uri(new Uri(config.ServerUrl!), "/api/v1/agents/inventory");
        using var response = await client.PostAsJsonAsync(target, snapshot, ct);

        if (!response.IsSuccessStatusCode) {
            logger.LogWarning("Gateway rejected inventory: HTTP {Code}", (int)response.StatusCode);
            // A replay conflict can occur if a successful ACK was lost; next retry
            // re-collects fresh inventory after the bounded collection interval.
            return false;
        }

        logger.LogInformation("Inventory accepted by Paydar Gateway");
        return true;
    }
}
