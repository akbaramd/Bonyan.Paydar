using InfraGraph.Agent.Windows;

if (args.Contains("--probe", StringComparer.OrdinalIgnoreCase))
{
    // Explicit, local read-only smoke test. Never contacts the Gateway.
    var snapshot = await new InventoryCollector().CaptureAsync(AgentConfiguration.Load(), CancellationToken.None);
    Console.WriteLine($"Inventory OK: CPU={snapshot.CpuName}, logical CPUs={snapshot.LogicalProcessors}, " +
        $"RAM bytes={snapshot.RamTotalBytes}, GPUs={snapshot.Gpus.Count}, disks={snapshot.Disks.Count}, " +
        $"networks={snapshot.Networks.Count}, present devices={snapshot.Devices.Count}");
    return;
}

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options => options.ServiceName = "Paydar Agent");
builder.Services.AddSingleton<InventoryCollector>();
builder.Services.AddHostedService<Worker>();
await builder.Build().RunAsync();
