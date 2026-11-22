using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace InfraGraph.Modules.Discovery;

/// <summary>
/// Vendor-neutral parser of read-only SNMPv3 MIB evidence. A learned FDB MAC
/// is NOT evidence of a directly attached host; only LLDP describes a neighbor.
/// No SNMP operations or sockets are performed by this parser.
/// </summary>
public static class SnmpTopologyParser
{
    public sealed record Binding(string Oid, string Value);
    public sealed record Neighbor(string LocalPort, string RemotePort,
        string RemoteChassisId, string? RemoteSystemName);
    public sealed record LearnedMac(string Address, string Port);
    public sealed record Snapshot(string Address, string? SystemName, string? Description,
        string? SystemObjectId, string Kind, string? ChassisId,
        Neighbor[] Neighbors, LearnedMac[] LearnedMacs);

    private const string SystemName = "1.3.6.1.2.1.1.5.0";
    private const string SystemDescription = "1.3.6.1.2.1.1.1.0";
    private const string SystemObjectId = "1.3.6.1.2.1.1.2.0";
    private const string SystemServices = "1.3.6.1.2.1.1.7.0";
    private const string IpForwarding = "1.3.6.1.2.1.4.1.0";
    private const string LocalChassisSubtype = "1.0.8802.1.1.2.1.3.1.0";
    private const string LocalChassis = "1.0.8802.1.1.2.1.3.2.0";
    private const string LocalPortSubtype = "1.0.8802.1.1.2.1.3.7.1.2.";
    private const string LocalPortDescription = "1.0.8802.1.1.2.1.3.7.1.4.";
    private const string LocalPortId = "1.0.8802.1.1.2.1.3.7.1.3.";
    private const string RemoteChassisSubtype = "1.0.8802.1.1.2.1.4.1.1.4.";
    private const string RemoteChassis = "1.0.8802.1.1.2.1.4.1.1.5.";
    private const string RemotePortSubtype = "1.0.8802.1.1.2.1.4.1.1.6.";
    private const string RemotePort = "1.0.8802.1.1.2.1.4.1.1.7.";
    private const string RemotePortDescription = "1.0.8802.1.1.2.1.4.1.1.8.";
    private const string RemoteSystemName = "1.0.8802.1.1.2.1.4.1.1.9.";
    private const string BridgePortIfIndex = "1.3.6.1.2.1.17.1.4.1.2.";
    private const string IfName = "1.3.6.1.2.1.31.1.1.1.1.";
    private const string FdbPort = "1.3.6.1.2.1.17.4.3.1.2.";

    public static Snapshot Parse(string address, IEnumerable<Binding> bindings)
    {
        if (!IPAddress.TryParse(address, out var ip) ||
            ip.AddressFamily != AddressFamily.InterNetwork || ip.ToString() != address)
            throw new ArgumentException("A canonical IPv4 address is required.", nameof(address));
        ArgumentNullException.ThrowIfNull(bindings);
        var values = bindings.Take(12000)
            .Where(x => x.Oid is { Length: > 4 and <= 120 } && x.Value is { Length: <= 512 })
            .GroupBy(x => x.Oid, StringComparer.Ordinal)
            .ToDictionary(x => x.Key, x => x.First().Value, StringComparer.Ordinal);
        string? Get(string oid) => values.TryGetValue(oid, out var v) ? Clean(v) : null;
        var sysName = Get(SystemName);
        var sysDesc = Get(SystemDescription);
        var objectId = Get(SystemObjectId);
        var chassis = ChassisKey(Get(LocalChassis), Get(LocalChassisSubtype));
        int.TryParse(Get(SystemServices), NumberStyles.None, CultureInfo.InvariantCulture, out var services);

        var localPortNames = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (oid, value) in values)
        {
            if (oid.StartsWith(LocalPortId, StringComparison.Ordinal))
                localPortNames[oid[LocalPortId.Length..]] =
                    DecodePortId(Clean(value), Get(LocalPortSubtype + oid[LocalPortId.Length..])) ?? "";
        }
        foreach (var (oid, value) in values)
        {
            if (oid.StartsWith(LocalPortDescription, StringComparison.Ordinal))
                localPortNames[oid[LocalPortDescription.Length..]] = Clean(value) ?? "";
        }

        // LLDP remote table indices: timeMark.localPortNum.remoteIndex.
        var neighbors = new List<Neighbor>();
        foreach (var (oid, value) in values.Where(x =>
            x.Key.StartsWith(RemoteChassis, StringComparison.Ordinal))
            .OrderBy(x => x.Key, StringComparer.Ordinal).Take(128))
        {
            var index = oid[RemoteChassis.Length..];
            var parts = index.Split('.');
            if (parts.Length != 3 || parts.Any(x => !uint.TryParse(x, out _))) continue;
            var remoteChassis = ChassisKey(value, Get(RemoteChassisSubtype + index));
            if (remoteChassis is null) continue;
            var local = localPortNames.GetValueOrDefault(parts[1]) ?? parts[1];
            var remote = Get(RemotePortDescription + index) ??
                DecodePortId(Get(RemotePort + index), Get(RemotePortSubtype + index));
            var remoteName = Get(RemoteSystemName + index);
            if (remote is null || local.Length == 0 || remote.Length == 0) continue;
            if (remoteChassis == chassis) continue;
            neighbors.Add(new Neighbor(Truncate(local, 80), Truncate(remote, 80),
                remoteChassis, remoteName is null ? null : Truncate(remoteName, 160)));
        }

        // FDB evidence means the switch learned a MAC via a bridge port. It
        // does not prove the MAC is directly connected to that physical port.
        var bridgeToIfIndex = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (oid, value) in values.Where(x =>
            x.Key.StartsWith(BridgePortIfIndex, StringComparison.Ordinal)))
            bridgeToIfIndex[oid[BridgePortIfIndex.Length..]] = value;
        var fdb = new List<LearnedMac>();
        foreach (var (oid, value) in values.Where(x =>
            x.Key.StartsWith(FdbPort, StringComparison.Ordinal))
            .OrderBy(x => x.Key, StringComparer.Ordinal).Take(512))
        {
            var mac = oid[FdbPort.Length..].Split('.');
            if (mac.Length != 6 || !mac.All(x => byte.TryParse(x, out _))) continue;
            if (!int.TryParse(value, out var port) || port <= 0) continue;
            var bridge = port.ToString(CultureInfo.InvariantCulture);
            var ifIndex = bridgeToIfIndex.GetValueOrDefault(bridge);
            var name = ifIndex is null ? bridge : Get(IfName + ifIndex) ?? bridge;
            if (name is null) continue;
            fdb.Add(new LearnedMac(string.Join(":", mac.Select(x =>
                byte.Parse(x, CultureInfo.InvariantCulture).ToString("X2", CultureInfo.InvariantCulture))),
                Truncate(name, 80)));
        }

        // sysServices advertises protocol layers, not an authoritative router role.
        // Require explicit ipForwarding=1 before labelling a network router.
        // Mixed bridge/router devices retain an unknown class, never a guess.
        var bridging = (services & 2) != 0 || fdb.Count > 0;
        var routing = Get(IpForwarding) == "1";
        var kind = routing && !bridging ? "router" :
            bridging && !routing ? "switch" : "unknown";
        return new Snapshot(address, sysName, sysDesc, objectId,
            kind, chassis, neighbors.Distinct().Take(128).ToArray(),
            fdb.Distinct().Take(512).ToArray());
    }

    private static string? Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var chars = value.Trim().Where(c => !char.IsControl(c)).Take(240).ToArray();
        var result = new string(chars).Trim();
        return result.Length == 0 ? null : result;
    }
    private static string? CleanHex(string? value)
    {
        var raw = value?.Replace(":", "", StringComparison.Ordinal)
            .Replace("-", "", StringComparison.Ordinal).Trim();
        return raw is { Length: >= 2 and <= 64 } &&
            raw.Length % 2 == 0 && raw.All(Uri.IsHexDigit)
            ? raw.ToUpperInvariant() : null;
    }
    // RFC 802.1AB chassis subtypes are 1..7. Two byte-identical values
    // of different subtypes must never resolve to the same managed device.
    // Keep the database's existing VARCHAR(64) contract; invalid or absent
    // subtype is not eligible for verified chassis correlation.
    private static string? ChassisKey(string? raw, string? subtypeText)
    {
        if (!int.TryParse(subtypeText, NumberStyles.None, CultureInfo.InvariantCulture,
                out var subtype) || subtype is < 1 or > 7)
            return null;
        var hex = CleanHex(raw);
        if (hex is null || hex.Length > 62 || subtype == 4 && hex.Length != 12)
            return null;
        return $"{subtype}:{hex}";
    }

    // 0x marks raw OCTET STRING data in the SNMP adapter. The interpretation
    // depends on lldpLoc/RemPortIdSubtype, not on a guessed text encoding.
    private static string? DecodePortId(string? value, string? subtypeText)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!value.StartsWith("0x", StringComparison.Ordinal))
            return Clean(value); // backward-compatible offline binding fixtures
        var hex = value[2..];
        if (hex.Length is < 2 or > 480 || hex.Length % 2 != 0 ||
            !hex.All(Uri.IsHexDigit))
            return null;
        var bytes = Convert.FromHexString(hex);
        if (subtypeText == "3")
        {
            if (bytes.Length != 6) return null;
            return string.Join(":", bytes.Select(x => x.ToString("X2", CultureInfo.InvariantCulture)));
        }
        if (subtypeText == "4" && bytes.Length == 5 && bytes[0] == 1)
            return new IPAddress(bytes.AsSpan(1)).ToString();
        if (bytes.All(x => x is >= 32 and <= 126))
            return Truncate(Encoding.ASCII.GetString(bytes), 80);
        return Truncate(value, 80); // unclassified binary ID; no invented interface name
    }

    private static string Truncate(string value, int max) => value[..Math.Min(value.Length, max)];
}