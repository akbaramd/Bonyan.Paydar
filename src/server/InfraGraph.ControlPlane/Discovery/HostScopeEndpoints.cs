using System.Text.Json;
using InfraGraph.Modules.Discovery;

namespace InfraGraph.ControlPlane.Discovery;

/// <summary>
/// Host inventory is a read-only suggestion, not scan approval. Docker's
/// network namespace is different from the Windows host: never claim that
/// a suggested subnet is reachable by the Worker.
/// </summary>
public static class HostScopeEndpoints
{
    public static void MapHostScopeEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/discovery/host-scope-candidates", (IConfiguration config) =>
        {
            var path = config["INFRAGRAPH_HOST_SCOPES_PATH"];
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                return Results.Ok(new { available = false, capturedAtUtc = (string?)null,
                    candidates = Array.Empty<object>() });
            try
            {
                var info = new FileInfo(path);
                if (info.Length is < 2 or > 65536) throw new InvalidDataException("Invalid scope file size");
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                var capturedAt = document.RootElement.GetProperty("capturedAtUtc").GetString();
                if (!DateTimeOffset.TryParse(capturedAt, out var timestamp) ||
                    timestamp > DateTimeOffset.UtcNow.AddMinutes(5))
                    throw new InvalidDataException("Invalid scope capture time");
                var records = document.RootElement.GetProperty("candidates");
                if (records.ValueKind != JsonValueKind.Array || records.GetArrayLength() > 32)
                    throw new InvalidDataException("Invalid scope candidate count");
                var choices = new List<object>();
                foreach (var entry in records.EnumerateArray())
                {
                    var cidr = entry.GetProperty("cidr").GetString();
                    var alias = entry.GetProperty("interfaceAlias").GetString();
                    var address = entry.GetProperty("adapterAddress").GetString();
                    var prefix = entry.GetProperty("prefixLength").GetInt32();
                    if (cidr is not { Length: <= 32 } || alias is null or { Length: > 180 } ||
                        address is null or { Length: > 15 } ||
                        prefix is < 22 or > 32)
                        throw new InvalidDataException("Malformed host scope");
                    _ = Ipv4ScanPlanner.Plan([cidr]); // Same strict policy as the scan API.
                    choices.Add(new { cidr, interfaceAlias = alias,
                        adapterAddress = address, prefixLength = prefix });
                }
                return Results.Ok(new { available = true, capturedAtUtc = capturedAt,
                    candidates = choices.ToArray() });
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                or JsonException or KeyNotFoundException or InvalidDataException
                or ArgumentException or InvalidOperationException)
            {
                return Results.Problem("Host-scope suggestions are invalid or unavailable.", statusCode: 503);
            }
        }).RequireAuthorization("admin");
    }
}
