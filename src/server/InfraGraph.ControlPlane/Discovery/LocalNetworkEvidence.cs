using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using InfraGraph.Modules.Discovery;

namespace InfraGraph.ControlPlane.Discovery;

/// <summary>
/// Read-only local Windows route-table export from the authenticated host.
/// A configured default gateway is a routing role, not a verified router
/// make/model or an LLDP switch-port connection.
/// </summary>
internal static class LocalNetworkEvidence
{
    public static HashSet<string> DefaultGatewayAddresses(string? path)
    {
        var gateways = new HashSet<string>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return gateways;
        try
        {
            var file = new FileInfo(path);
            if (file.Length is < 2 or > 65536) return gateways;
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var candidates = document.RootElement.GetProperty("candidates");
            if (candidates.ValueKind != JsonValueKind.Array || candidates.GetArrayLength() > 32)
                return gateways;
            foreach (var item in candidates.EnumerateArray())
            {
                if (!item.TryGetProperty("gatewayAddress", out var addressItem) ||
                    addressItem.ValueKind != JsonValueKind.String) continue;
                var address = addressItem.GetString();
                var cidr = item.GetProperty("cidr").GetString();
                if (address is null || cidr is null ||
                    !IPAddress.TryParse(address, out var ip) ||
                    ip.AddressFamily != AddressFamily.InterNetwork ||
                    ip.ToString() != address) continue;
                // Require the gateway to fall inside the host's actual
                // candidate NIC prefix, not just any arbitrary local string.
                if (Ipv4ScanPlanner.Plan([cidr]).Any(target => target.Equals(ip)))
                    gateways.Add(address);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
            or JsonException or ArgumentException or InvalidOperationException
            or KeyNotFoundException)
        {
            // A malformed local hint must never break the live topology API.
            return new HashSet<string>(StringComparer.Ordinal);
        }
        return gateways;
    }
}
