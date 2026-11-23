using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using InfraGraph.AgentGateway;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.IntegrationTests;

/// <summary>
/// Checks device identity pinning in isolation. Transport CA validation still
/// requires an actual TLS/Kestrel pilot test with the organization's PKI.
/// </summary>
public sealed class AgentIdentityVerifierTests
{
    [Fact]
    public async Task ApprovedCertificateMatchesAndRevocationOrEpochMismatchFailsClosed()
    {
        using var key = RSA.Create(2048);
        var req = new CertificateRequest("CN=paydar-test", key,
            HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(
            new OidCollection { new Oid("1.3.6.1.5.5.7.3.2") }, false));
        using var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-2),
            DateTimeOffset.UtcNow.AddDays(1));
        var options = new DbContextOptionsBuilder<InfraGraphDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new InfraGraphDbContext(options);
        var id = Guid.NewGuid();
        var epoch = Guid.NewGuid();
        db.AgentInstallations.Add(new AgentInstallationRecord {
            AgentId = id, InstallationEpoch = epoch, SiteId = "test-site",
            AgentVersion = "test", ClientCertificateThumbprint = cert.Thumbprint
        });
        await db.SaveChangesAsync();

        var ctx = new DefaultHttpContext();
        ctx.Request.Scheme = "https";
        ctx.Connection.ClientCertificate = cert;

        Assert.NotNull(await AgentIdentityVerifier.FindApprovedAsync(
            ctx, id, epoch, db, CancellationToken.None));
        Assert.Null(await AgentIdentityVerifier.FindApprovedAsync(
            ctx, id, Guid.NewGuid(), db, CancellationToken.None));
        ctx.Request.Scheme = "http";
        Assert.Null(await AgentIdentityVerifier.FindApprovedAsync(
            ctx, id, epoch, db, CancellationToken.None));

        ctx.Request.Scheme = "https";
        var entry = await db.AgentInstallations.SingleAsync(x => x.AgentId == id);
        entry.RevokedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        Assert.Null(await AgentIdentityVerifier.FindApprovedAsync(
            ctx, id, epoch, db, CancellationToken.None));
    }

    [Fact]
    public async Task UnknownAndMismatchedCertificateIsRejected()
    {
        using var key = RSA.Create(2048);
        var req = new CertificateRequest("CN=paydar-test", key,
            HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1),
            DateTimeOffset.UtcNow.AddHours(1));
        var options = new DbContextOptionsBuilder<InfraGraphDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = new InfraGraphDbContext(options);
        var id = Guid.NewGuid();
        var epoch = Guid.NewGuid();
        db.AgentInstallations.Add(new AgentInstallationRecord {
            AgentId = id, InstallationEpoch = epoch, SiteId = "test-site",
            AgentVersion = "test", ClientCertificateThumbprint = new string('F', 40)
        });
        await db.SaveChangesAsync();
        var ctx = new DefaultHttpContext();
        ctx.Request.Scheme = "https";
        ctx.Connection.ClientCertificate = cert;
        Assert.Null(await AgentIdentityVerifier.FindApprovedAsync(
            ctx, id, epoch, db, CancellationToken.None));
        Assert.Null(await AgentIdentityVerifier.FindApprovedAsync(
            ctx, Guid.NewGuid(), epoch, db, CancellationToken.None));
    }
}
