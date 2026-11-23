using System.Security.Cryptography;
using InfraGraph.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InfraGraph.AgentGateway;

/// <summary>
/// Verifies a pinned, approved device identity after Kestrel's TLS chain validation.
/// An unapproved certificate can never register itself through this service.
/// </summary>
public static class AgentIdentityVerifier
{
    public static async Task<AgentInstallationRecord?> FindApprovedAsync(
        HttpContext ctx, Guid agentId, Guid epoch, InfraGraphDbContext db, CancellationToken ct)
    {
        if (!ctx.Request.IsHttps || agentId == Guid.Empty || epoch == Guid.Empty)
            return null;

        var cert = await ctx.Connection.GetClientCertificateAsync(ct);
        if (cert is null || cert.NotBefore.ToUniversalTime() > DateTime.UtcNow ||
            cert.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
            return null;

        var record = await db.AgentInstallations.SingleOrDefaultAsync(x => x.AgentId == agentId, ct);
        if (record is null || record.RevokedAtUtc is not null ||
            record.InstallationEpoch != epoch ||
            string.IsNullOrWhiteSpace(record.ClientCertificateThumbprint))
            return null;

        try
        {
            var presented = Convert.FromHexString(cert.Thumbprint.Replace(" ", "", StringComparison.Ordinal));
            var approved = Convert.FromHexString(record.ClientCertificateThumbprint.Replace(" ", "", StringComparison.Ordinal));
            if (presented.Length != approved.Length ||
                !CryptographicOperations.FixedTimeEquals(presented, approved))
                return null;
        }
        catch (FormatException) { return null; }
        return record;
    }
}
