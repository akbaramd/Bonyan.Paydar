using InfraGraph.SharedKernel;

namespace InfraGraph.Modules.Inventory;

public sealed class Asset
{
    private readonly List<AssetObservation> _observations = [];

    public Asset(AssetId id, string siteId)
    {
        if (id.Value == Guid.Empty) throw new ArgumentException("Asset identity cannot be empty.", nameof(id));
        if (string.IsNullOrWhiteSpace(siteId)) throw new ArgumentException("Site is required.", nameof(siteId));
        Id = id;
        SiteId = siteId;
    }

    public AssetId Id { get; }
    public string SiteId { get; }
    public IReadOnlyList<AssetObservation> Observations => _observations.AsReadOnly();

    public void Observe(AssetObservation observation)
    {
        ArgumentNullException.ThrowIfNull(observation);
        if (string.IsNullOrWhiteSpace(observation.Source))
            throw new ArgumentException("Observation source is required.", nameof(observation));
        _observations.Add(observation);
    }
}

/// <summary>A source-specific claim, not an automatic identity merge.</summary>
public sealed record AssetObservation(
    string Source, string? IpAddress, string? MacAddress, DateTimeOffset ObservedAtUtc);
