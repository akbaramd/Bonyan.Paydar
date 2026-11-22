using InfraGraph.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.IntegrationTests;

/// <summary>Checks EF mapping metadata without connecting to an actual database.</summary>
public class PersistenceContractTests
{
    [Fact]
    public void InventoryAsset_MapsToInventorySchema()
    {
        var options = new DbContextOptionsBuilder<InfraGraphDbContext>()
            .UseNpgsql("Host=localhost;Database=not_connected;Username=unused;Password=unused")
            .Options;
        using var db = new InfraGraphDbContext(options);
        var entity = db.Model.FindEntityType(typeof(AssetRecord));
        Assert.NotNull(entity);
        Assert.Equal("inventory", entity.GetSchema());
        Assert.Equal("assets", entity.GetTableName());
    }

    [Theory]
    [InlineData(typeof(OperatorRecord), "access", "operators")]
    [InlineData(typeof(OperatorAuditRecord), "audit", "operator_events")]
    [InlineData(typeof(DiscoveryObservationRecord), "discovery", "observations")]
    public void MvpPersistenceEntitiesUseRestrictedSchemas(
        Type type, string schema, string table)
    {
        var options = new DbContextOptionsBuilder<InfraGraphDbContext>()
            .UseNpgsql("Host=localhost;Database=not_connected;Username=unused;Password=unused")
            .Options;
        using var db = new InfraGraphDbContext(options);
        var entity = db.Model.FindEntityType(type);
        Assert.NotNull(entity);
        Assert.Equal(schema, entity.GetSchema());
        Assert.Equal(table, entity.GetTableName());
    }

    [Fact]
    public void AgentRegistration_MapsToRestrictedIngestSchema()
    {
        var options = new DbContextOptionsBuilder<InfraGraphDbContext>()
            .UseNpgsql("Host=localhost;Database=not_connected;Username=unused;Password=unused")
            .Options;
        using var db = new InfraGraphDbContext(options);
        var entity = db.Model.FindEntityType(typeof(AgentInstallationRecord));
        Assert.NotNull(entity);
        Assert.Equal("ingest", entity.GetSchema());
        Assert.Equal("installations", entity.GetTableName());
    }
}
