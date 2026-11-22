using Microsoft.EntityFrameworkCore;

namespace InfraGraph.Infrastructure.Persistence;

public sealed class InfraGraphDbContext(DbContextOptions<InfraGraphDbContext> options) : DbContext(options)
{
    public DbSet<AssetRecord> Assets => Set<AssetRecord>();
    public DbSet<AgentInstallationRecord> AgentInstallations => Set<AgentInstallationRecord>();
    public DbSet<AgentInventoryRecord> AgentInventories => Set<AgentInventoryRecord>();
    public DbSet<OperatorRecord> Operators => Set<OperatorRecord>();
    public DbSet<OperatorAuditRecord> OperatorAudit => Set<OperatorAuditRecord>();
    public DbSet<DiscoveryObservationRecord> DiscoveryObservations => Set<DiscoveryObservationRecord>();
    public DbSet<OperatorIncidentRecord> Incidents => Set<OperatorIncidentRecord>();
    public DbSet<NetworkScanJobRecord> NetworkScanJobs => Set<NetworkScanJobRecord>();
    public DbSet<NetworkScanHostRecord> NetworkScanHosts => Set<NetworkScanHostRecord>();
    public DbSet<NetworkScanEventRecord> NetworkScanEvents => Set<NetworkScanEventRecord>();
    public DbSet<ManagedNetworkDeviceRecord> ManagedNetworkDevices => Set<ManagedNetworkDeviceRecord>();
    public DbSet<LldpNeighborRecord> LldpNeighbors => Set<LldpNeighborRecord>();
    public DbSet<FdbLearnedMacRecord> FdbLearnedMacs => Set<FdbLearnedMacRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AssetRecord>(x => {
            x.ToTable("assets", "inventory");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.DisplayName).HasColumnName("display_name").HasMaxLength(240);
            x.Property(a => a.CreatedAtUtc).HasColumnName("created_at_utc");
            x.HasIndex(a => a.SiteId);
        });
        modelBuilder.Entity<AgentInstallationRecord>(x => {
            x.ToTable("installations", "ingest");
            x.HasKey(a => a.AgentId);
            x.Property(a => a.AgentId).HasColumnName("agent_id");
            x.Property(a => a.InstallationEpoch).HasColumnName("installation_epoch");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.AgentVersion).HasColumnName("agent_version").HasMaxLength(64).IsRequired();
            x.Property(a => a.LastReceivedAtUtc).HasColumnName("last_received_at_utc");
            x.Property(a => a.ClientCertificateThumbprint).HasColumnName("client_certificate_thumbprint").HasMaxLength(64);
            x.Property(a => a.RevokedAtUtc).HasColumnName("revoked_at_utc");
            x.Property(a => a.LastInventoryAtUtc).HasColumnName("last_inventory_at_utc").IsConcurrencyToken();
            x.HasIndex(a => a.InstallationEpoch).IsUnique();
            x.HasIndex(a => a.ClientCertificateThumbprint).IsUnique();
        });
        modelBuilder.Entity<AgentInventoryRecord>(x => {
            x.ToTable("endpoint_inventories", "ingest");
            x.HasKey(a => a.AgentId);
            x.Property(a => a.AgentId).HasColumnName("agent_id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.Snapshot).HasColumnName("snapshot").HasColumnType("jsonb").IsRequired();
            x.Property(a => a.CollectedAtUtc).HasColumnName("collected_at_utc");
            x.Property(a => a.ReceivedAtUtc).HasColumnName("received_at_utc");
            x.HasIndex(a => new { a.SiteId, a.ReceivedAtUtc });
        });
        modelBuilder.Entity<OperatorRecord>(x => {
            x.ToTable("operators", "access");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.Email).HasColumnName("email").HasMaxLength(254).IsRequired();
            x.Property(a => a.PasswordHash).HasColumnName("password_hash").HasMaxLength(1024).IsRequired();
            x.Property(a => a.Role).HasColumnName("role").HasMaxLength(20).IsRequired();
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120);
            x.Property(a => a.IsActive).HasColumnName("is_active");
            x.Property(a => a.FailedLogins).HasColumnName("failed_logins");
            x.Property(a => a.LockedUntilUtc).HasColumnName("locked_until_utc");
            x.Property(a => a.SecurityStamp).HasColumnName("security_stamp");
            x.Property(a => a.CreatedAtUtc).HasColumnName("created_at_utc");
            x.HasIndex(a => a.Email).IsUnique();
        });
        modelBuilder.Entity<OperatorAuditRecord>(x => {
            x.ToTable("operator_events", "audit");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.Actor).HasColumnName("actor").HasMaxLength(254).IsRequired();
            x.Property(a => a.Action).HasColumnName("action").HasMaxLength(64).IsRequired();
            x.Property(a => a.Target).HasColumnName("target").HasMaxLength(254).IsRequired();
            x.Property(a => a.Success).HasColumnName("success");
            x.Property(a => a.AtUtc).HasColumnName("at_utc");
            x.HasIndex(a => a.AtUtc);
        });
        modelBuilder.Entity<DiscoveryObservationRecord>(x => {
            x.ToTable("observations", "discovery");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.SourceKey).HasColumnName("source_key").HasMaxLength(160).IsRequired();
            x.Property(a => a.TargetKey).HasColumnName("target_key").HasMaxLength(160).IsRequired();
            x.Property(a => a.SourcePort).HasColumnName("source_port").HasMaxLength(80);
            x.Property(a => a.TargetPort).HasColumnName("target_port").HasMaxLength(80);
            x.Property(a => a.Protocol).HasColumnName("protocol").HasMaxLength(32).IsRequired();
            x.Property(a => a.ObservedAtUtc).HasColumnName("observed_at_utc");
            x.Property(a => a.ReceivedAtUtc).HasColumnName("received_at_utc");
            x.Property(a => a.RetractedAtUtc).HasColumnName("retracted_at_utc");
            x.Property(a => a.TtlSeconds).HasColumnName("ttl_seconds");
            x.Property(a => a.Source).HasColumnName("source").HasMaxLength(32).IsRequired();
            x.HasIndex(a => new { a.SiteId, a.ObservedAtUtc });
        });
        modelBuilder.Entity<NetworkScanJobRecord>(x => {
            x.ToTable("scan_jobs", "discovery");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.Cidrs).HasColumnName("cidrs").IsRequired();
            x.Property(a => a.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            x.Property(a => a.IntervalSeconds).HasColumnName("interval_seconds");
            x.Property(a => a.TargetCount).HasColumnName("target_count");
            x.Property(a => a.ProbedCount).HasColumnName("probed_count");
            x.Property(a => a.ResponsiveCount).HasColumnName("responsive_count");
            x.Property(a => a.Cycle).HasColumnName("cycle");
            x.Property(a => a.RequestedBy).HasColumnName("requested_by").HasMaxLength(254);
            x.Property(a => a.RequestedAtUtc).HasColumnName("requested_at_utc");
            x.Property(a => a.StartedAtUtc).HasColumnName("started_at_utc");
            x.Property(a => a.LastSweepAtUtc).HasColumnName("last_sweep_at_utc");
            x.Property(a => a.CompletedAtUtc).HasColumnName("completed_at_utc");
            x.Property(a => a.Error).HasColumnName("error").HasMaxLength(500);
        });
        modelBuilder.Entity<NetworkScanHostRecord>(x => {
            x.ToTable("scan_hosts", "discovery");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.Address).HasColumnName("address").HasMaxLength(15).IsRequired();
            x.Property(a => a.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            x.Property(a => a.ConsecutiveMisses).HasColumnName("consecutive_misses");
            x.Property(a => a.IcmpResponded).HasColumnName("icmp_responded");
            x.Property(a => a.TcpPorts).HasColumnName("tcp_ports").HasMaxLength(100).IsRequired();
            x.Property(a => a.LastProbedAtUtc).HasColumnName("last_probed_at_utc");
            x.Property(a => a.LastSeenAtUtc).HasColumnName("last_seen_at_utc");
            x.Property(a => a.LastJobId).HasColumnName("last_job_id");
            x.HasIndex(a => new { a.SiteId, a.Address }).IsUnique();
        });
        modelBuilder.Entity<NetworkScanEventRecord>(x => {
            x.ToTable("scan_events", "discovery");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id").ValueGeneratedOnAdd();
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.JobId).HasColumnName("job_id");
            x.Property(a => a.Kind).HasColumnName("kind").HasMaxLength(32).IsRequired();
            x.Property(a => a.Address).HasColumnName("address").HasMaxLength(15);
            x.Property(a => a.Status).HasColumnName("status").HasMaxLength(20);
            x.Property(a => a.ProbedCount).HasColumnName("probed_count");
            x.Property(a => a.TargetCount).HasColumnName("target_count");
            x.Property(a => a.AtUtc).HasColumnName("at_utc");
        });
        modelBuilder.Entity<ManagedNetworkDeviceRecord>(x => {
            x.ToTable("managed_devices", "discovery");
            x.HasKey(a => new { a.SiteId, a.Address });
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.Address).HasColumnName("address").HasMaxLength(15).IsRequired();
            x.Property(a => a.SystemName).HasColumnName("system_name").HasMaxLength(160);
            x.Property(a => a.SystemDescription).HasColumnName("system_description").HasMaxLength(240);
            x.Property(a => a.SystemObjectId).HasColumnName("system_object_id").HasMaxLength(160);
            x.Property(a => a.Kind).HasColumnName("kind").HasMaxLength(20).IsRequired();
            x.Property(a => a.ChassisId).HasColumnName("chassis_id").HasMaxLength(64);
            x.Property(a => a.LastSeenAtUtc).HasColumnName("last_seen_at_utc");
            x.HasIndex(a => new { a.SiteId, a.ChassisId });
        });
        modelBuilder.Entity<LldpNeighborRecord>(x => {
            x.ToTable("lldp_neighbors", "discovery");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.LocalAddress).HasColumnName("local_address").HasMaxLength(15).IsRequired();
            x.Property(a => a.LocalPort).HasColumnName("local_port").HasMaxLength(80).IsRequired();
            x.Property(a => a.RemotePort).HasColumnName("remote_port").HasMaxLength(80).IsRequired();
            x.Property(a => a.RemoteChassisId).HasColumnName("remote_chassis_id").HasMaxLength(64).IsRequired();
            x.Property(a => a.RemoteSystemName).HasColumnName("remote_system_name").HasMaxLength(160);
            x.Property(a => a.ObservedAtUtc).HasColumnName("observed_at_utc");
            x.HasIndex(a => new { a.SiteId, a.LocalAddress });
        });
        modelBuilder.Entity<FdbLearnedMacRecord>(x => {
            x.ToTable("fdb_learned_macs", "discovery");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.BridgeAddress).HasColumnName("bridge_address").HasMaxLength(15).IsRequired();
            x.Property(a => a.MacAddress).HasColumnName("mac_address").HasMaxLength(17).IsRequired();
            x.Property(a => a.LearnedPort).HasColumnName("learned_port").HasMaxLength(80).IsRequired();
            x.Property(a => a.ObservedAtUtc).HasColumnName("observed_at_utc");
            x.HasIndex(a => new { a.SiteId, a.BridgeAddress });
        });
        modelBuilder.Entity<OperatorIncidentRecord>(x => {
            x.ToTable("incidents", "operations");
            x.HasKey(a => a.Id);
            x.Property(a => a.Id).HasColumnName("id");
            x.Property(a => a.SiteId).HasColumnName("site_id").HasMaxLength(120).IsRequired();
            x.Property(a => a.Title).HasColumnName("title").HasMaxLength(240).IsRequired();
            x.Property(a => a.Description).HasColumnName("description").HasMaxLength(1000);
            x.Property(a => a.Severity).HasColumnName("severity").HasMaxLength(20).IsRequired();
            x.Property(a => a.Status).HasColumnName("status").HasMaxLength(20).IsRequired().IsConcurrencyToken();
            x.Property(a => a.Origin).HasColumnName("origin").HasMaxLength(32).IsRequired();
            x.Property(a => a.CreatedBy).HasColumnName("created_by").HasMaxLength(254).IsRequired();
            x.Property(a => a.AcknowledgedBy).HasColumnName("acknowledged_by").HasMaxLength(254);
            x.Property(a => a.ResolvedBy).HasColumnName("resolved_by").HasMaxLength(254);
            x.Property(a => a.CreatedAtUtc).HasColumnName("created_at_utc");
            x.Property(a => a.UpdatedAtUtc).HasColumnName("updated_at_utc");
            x.HasIndex(a => new { a.SiteId, a.CreatedAtUtc });
        });
    }
}

public sealed class AssetRecord
{
    public Guid Id { get; set; }
    public required string SiteId { get; set; }
    public string? DisplayName { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
}
public sealed class AgentInstallationRecord
{
    public Guid AgentId { get; set; }
    public Guid InstallationEpoch { get; set; }
    public required string SiteId { get; set; }
    public required string AgentVersion { get; set; }
    public DateTimeOffset? LastReceivedAtUtc { get; set; }
    public string? ClientCertificateThumbprint { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public DateTimeOffset? LastInventoryAtUtc { get; set; }
}
public sealed class OperatorRecord
{
    public Guid Id { get; set; }
    public required string Email { get; set; } // Lowercase invariant; unique.
    public required string PasswordHash { get; set; }
    public required string Role { get; set; } // admin | operator | viewer
    public string? SiteId { get; set; }
    public bool IsActive { get; set; } = true;
    public int FailedLogins { get; set; }
    public DateTimeOffset? LockedUntilUtc { get; set; }
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAtUtc { get; set; }
}
public sealed class OperatorAuditRecord
{
    public Guid Id { get; set; }
    public required string Actor { get; set; }
    public required string Action { get; set; }
    public required string Target { get; set; }
    public bool Success { get; set; }
    public DateTimeOffset AtUtc { get; set; }
}
public sealed class DiscoveryObservationRecord
{
    public Guid Id { get; set; }
    public required string SiteId { get; set; }
    public required string SourceKey { get; set; }
    public required string TargetKey { get; set; }
    public string? SourcePort { get; set; }
    public string? TargetPort { get; set; }
    public required string Protocol { get; set; }
    public DateTimeOffset ObservedAtUtc { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; }
    public DateTimeOffset? RetractedAtUtc { get; set; }
    public int TtlSeconds { get; set; }
    public string Source { get; set; } = "operator-reported";
}
public sealed class OperatorIncidentRecord
{
    public Guid Id { get; set; }
    public required string SiteId { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public required string Severity { get; set; }
    public string Status { get; set; } = "open";
    public string Origin { get; set; } = "operator-reported";
    public required string CreatedBy { get; set; }
    public string? AcknowledgedBy { get; set; }
    public string? ResolvedBy { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
}
public sealed class AgentInventoryRecord
{
    public Guid AgentId { get; set; }
    public required string SiteId { get; set; }
    public required string Snapshot { get; set; }
    public DateTimeOffset CollectedAtUtc { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; }
}

