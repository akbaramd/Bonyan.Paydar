namespace InfraGraph.SharedKernel;

/// <summary>A stable internal asset identity; IP/MAC are observations, not primary keys.</summary>
public readonly record struct AssetId(Guid Value)
{
    public static AssetId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString("D");
}
