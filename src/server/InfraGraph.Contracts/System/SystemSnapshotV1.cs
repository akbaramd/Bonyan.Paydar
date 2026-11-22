namespace InfraGraph.Contracts.System;

/// <summary>Explicitly empty/read-only until authenticated data persistence exists.</summary>
public sealed record SystemSnapshotV1(
    string Product,
    string Environment,
    string Stage,
    DateTimeOffset ServerTimeUtc,
    int RegisteredAssets,
    int ActiveIncidents);
