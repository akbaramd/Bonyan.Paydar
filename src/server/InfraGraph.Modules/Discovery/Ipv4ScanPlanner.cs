using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;

namespace InfraGraph.Modules.Discovery;

/// <summary>Explicit IPv4 private-scope planner: never expands scope from probe responses.</summary>
public static class Ipv4ScanPlanner
{
    public const int MaxTargets = 1024;
    public const int MaxCidrs = 8;

    public static IReadOnlyList<IPAddress> Plan(IEnumerable<string> cidrs)
    {
        ArgumentNullException.ThrowIfNull(cidrs);
        var entries = cidrs.ToArray();
        if (entries.Length is < 1 or > MaxCidrs)
            throw new ArgumentException("Between 1 and 8 approved IPv4 CIDRs are required.");
        var addresses = new SortedSet<uint>();
        foreach (var entry in entries)
        {
            if (string.IsNullOrWhiteSpace(entry) || entry.Length > 32)
                throw new ArgumentException("Invalid CIDR.");
            var tokens = entry.Split('/');
            if (tokens.Length != 2 || !IPAddress.TryParse(tokens[0], out var ip) ||
                ip.AddressFamily != AddressFamily.InterNetwork ||
                !int.TryParse(tokens[1], out var prefix) || prefix is < 22 or > 32 ||
                tokens[0] != ip.ToString())
                throw new ArgumentException("Only canonical IPv4 /22–/32 CIDRs are supported.");
            var start = BinaryPrimitives.ReadUInt32BigEndian(ip.GetAddressBytes());
            var mask = prefix == 0 ? 0u : uint.MaxValue << (32 - prefix);
            if ((start & mask) != start)
                throw new ArgumentException("CIDR must specify the network address, not a host address.");
            var end = start | ~mask;
            // Only RFC1918 addresses. Reject CIDRs crossing private-block boundaries,
            // and do not allow global, loopback, link-local or multicast probes.
            if (!Private(start) || !Private(end))
                throw new ArgumentException("Scan scope must be wholly RFC1918 private IPv4.");
            var count = (long)end - start + 1;
            if (count > MaxTargets + 2)
                throw new ArgumentException("A CIDR contains too many targets.");
            for (var value = start; value <= end; value++)
            {
                if (prefix <= 30 && (value == start || value == end)) continue;
                addresses.Add(value);
                if (addresses.Count > MaxTargets)
                    throw new ArgumentException("Combined scan targets exceed 1024 IPv4 addresses.");
            }
        }
        return addresses.Select(value => {
            var bytes = new byte[4];
            BinaryPrimitives.WriteUInt32BigEndian(bytes, value);
            return new IPAddress(bytes);
        }).ToArray();
    }

    private static bool Private(uint address) =>
        (address & 0xff000000u) == 0x0a000000u ||
        (address & 0xfff00000u) == 0xac100000u ||
        (address & 0xffff0000u) == 0xc0a80000u;
}
