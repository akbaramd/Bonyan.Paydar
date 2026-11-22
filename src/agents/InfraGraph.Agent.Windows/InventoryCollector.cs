using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Text.Json;
using InfraGraph.Contracts.Agents;
namespace InfraGraph.Agent.Windows;

/// <summary>Read-only Windows inventory. No user file contents or remote scans.</summary>
public sealed class InventoryCollector
{
    // Fixed read-only commands: no command input from server or user.
    private const string CimQuery = """
        $ErrorActionPreference = 'Stop'
        $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
        $pc = Get-CimInstance Win32_ComputerSystem
        $gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = [string]$_.Name; driverVersion = [string]$_.DriverVersion } })
        $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { @{ name = [string]$_.DeviceID; totalBytes = [long]$_.Size; freeBytes = [long]$_.FreeSpace; fileSystem = [string]$_.FileSystem } })
        $devices = @(Get-PnpDevice -PresentOnly | Select-Object -First 500 | ForEach-Object { @{ name = [string]$_.FriendlyName; deviceClass = [string]$_.Class; instanceId = [string]$_.InstanceId } })
        @{ cpuName = [string]$cpu.Name; ramTotalBytes = [long]$pc.TotalPhysicalMemory; gpus = $gpu; disks = $disks; devices = $devices } | ConvertTo-Json -Depth 6 -Compress
        """;
    public async Task<AgentInventoryV1> CaptureAsync(AgentConfiguration config, CancellationToken ct)
    {
        var start = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true };
        foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-Command", CimQuery })
            start.ArgumentList.Add(arg);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Inventory collector could not start");
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        linked.CancelAfter(TimeSpan.FromSeconds(30));
        try
        {
            var outputTask = process.StandardOutput.ReadToEndAsync(linked.Token);
            var errorTask = process.StandardError.ReadToEndAsync(linked.Token);
            await process.WaitForExitAsync(linked.Token);
            var text = await outputTask;
            var error = await errorTask;
            if (process.ExitCode != 0)
                throw new InvalidOperationException("Inventory collection failed: " + error[..Math.Min(error.Length, 200)]);
            if (text.Length > 300000) throw new InvalidDataException("Inventory limit exceeded");
            var h = JsonSerializer.Deserialize<HardwareData>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new InvalidDataException("Empty inventory");
            var networks = NetworkInterface.GetAllNetworkInterfaces().Select(n => new NetworkInfoV1(n.Name,
                n.GetPhysicalAddress().ToString(),
                n.GetIPProperties().UnicastAddresses.Select(a => a.Address.ToString()).ToArray(),
                n.OperationalStatus.ToString())).ToArray();
            return new AgentInventoryV1(config.AgentId, config.InstallationEpoch, Environment.MachineName,
                Environment.OSVersion.VersionString, typeof(InventoryCollector).Assembly.GetName().Version?.ToString() ?? "0",
                h.CpuName ?? "", Environment.ProcessorCount, h.RamTotalBytes,
                (h.Gpus ?? []).Select(x => new GpuInfoV1(x.Name ?? "", x.DriverVersion)).ToArray(),
                (h.Disks ?? []).Select(x => new DiskInfoV1(x.Name ?? "", x.TotalBytes, x.FreeBytes, x.FileSystem)).ToArray(),
                networks,
                (h.Devices ?? []).Select(x => new PnpDeviceInfoV1(x.Name ?? "", x.DeviceClass, x.InstanceId)).ToArray(),
                DateTimeOffset.UtcNow);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            throw new TimeoutException("Inventory collector timed out");
        }
    }
    private sealed record HardwareData(string? CpuName, long RamTotalBytes, List<GpuData>? Gpus, List<DiskData>? Disks, List<DeviceData>? Devices);
    private sealed record GpuData(string? Name, string? DriverVersion);
    private sealed record DiskData(string? Name, long TotalBytes, long FreeBytes, string? FileSystem);
    private sealed record DeviceData(string? Name, string? DeviceClass, string? InstanceId);
}
