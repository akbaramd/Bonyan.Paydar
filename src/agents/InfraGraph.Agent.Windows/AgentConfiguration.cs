using System.Text.Json;
namespace InfraGraph.Agent.Windows;
public sealed record AgentConfiguration(Guid AgentId, Guid InstallationEpoch, string? ServerUrl, string? ClientCertificateThumbprint, int IntervalSeconds = 300)
{
    public static string DirectoryPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Paydar");
    public static string FilePath => Path.Combine(DirectoryPath, "agent.json");
    public static AgentConfiguration Load() =>
        File.Exists(FilePath) ? JsonSerializer.Deserialize<AgentConfiguration>(File.ReadAllText(FilePath)) ??
        throw new InvalidDataException("Invalid agent configuration") :
        new AgentConfiguration(Guid.Empty, Guid.Empty, null, null);
    public static bool IsValidHttpsUrl(string? s) =>
        Uri.TryCreate(s, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps &&
        string.IsNullOrWhiteSpace(u.UserInfo) && string.IsNullOrWhiteSpace(u.Fragment);
    public static void Save(AgentConfiguration c)
    {
        if (c.AgentId == Guid.Empty || c.InstallationEpoch == Guid.Empty)
            throw new ArgumentException("Agent identity is required");
        if (c.ServerUrl is not null && !IsValidHttpsUrl(c.ServerUrl))
            throw new ArgumentException("Only HTTPS server URLs are allowed");
        Directory.CreateDirectory(DirectoryPath);
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(c, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(tmp, FilePath, true);
    }
}
