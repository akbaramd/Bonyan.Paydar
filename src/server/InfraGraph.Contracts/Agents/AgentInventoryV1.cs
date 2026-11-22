namespace InfraGraph.Contracts.Agents;

// A self-reported endpoint observation, not proof of a physical network link.
public sealed record AgentInventoryV1(Guid AgentId, Guid InstallationEpoch, string HostName, string OsVersion, string AgentVersion, string CpuName, int LogicalProcessors, long RamTotalBytes, IReadOnlyList<GpuInfoV1> Gpus, IReadOnlyList<DiskInfoV1> Disks, IReadOnlyList<NetworkInfoV1> Networks, IReadOnlyList<PnpDeviceInfoV1> Devices, DateTimeOffset CollectedAtUtc);
public sealed record GpuInfoV1(string Name, string? DriverVersion);
public sealed record DiskInfoV1(string Name, long TotalBytes, long FreeBytes, string? FileSystem);
public sealed record NetworkInfoV1(string Name, string? MacAddress, IReadOnlyList<string> IpAddresses, string Status);
public sealed record PnpDeviceInfoV1(string Name, string? DeviceClass, string? InstanceId);
