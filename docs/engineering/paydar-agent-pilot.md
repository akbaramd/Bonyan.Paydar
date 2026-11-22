# Paydar Agent pilot — scope and security
Status: implementation under development, **not production-ready**.

## Current slice
- .NET 10 Windows Service collects local Windows inventory (CPU, memory, GPU, disks,
  network interfaces, present PnP devices) without inspecting user files.
- A separate Windows tray app configures an HTTPS Gateway URL and client-certificate
  thumbprint; it runs in the interactive user session, never in Session 0.
- Ingestion requires a trusted client certificate and an allowlisted installation
  record with matching certificate fingerprint, installation epoch and site.
- No arbitrary shell, desktop control, remote file access or auto-update is enabled.
- Network IP addresses are self-reported evidence, **not verified L2 links**.

## Provisioning requirements
1. Apply `infra/deployment/postgres/008_agent_inventory.sql` in a maintenance window.
2. Provision an internal CA, TLS server certificate and client certificate with
   clientAuth EKU in LocalMachine/My; allow SYSTEM to use the private key.
3. Approve an AgentId/InstallationEpoch/SiteId and certificate fingerprint in
   `ingest.installations`, using a least-privileged admin workflow.
4. Run Gateway with a separate least-privileged PostgreSQL role and authenticated
   TLS. Do not expose Gateway to the public internet.
5. Deploy only to explicitly authorized endpoints in a test OU.
6. Use `scripts/build-paydar-agent.ps1` for win-x64 unsigned preview ZIP;
   run elevated `Install-PaydarAgent.ps1 -PackagePath <extracted-path>`.
7. Configure HTTPS Gateway and certificate from tray. Do not bypass TLS warnings.

## Pending acceptance
- Real mTLS certificate chain, revocation and connection testing
- PostgreSQL grants, migration dry-run/rollback and durability validation
- End-to-end inventory to site-scoped operator API and UI mapping
- Service lifetime, reconnect, bounded disk storage and OS compatibility tests
- Signing, authenticated release manifest, atomic update and rollback
- Real WiX MSI/installer EXE, code signing, rollback, release publication

Never publish certificates, keys, agent inventories, customer IP ranges or live topology
in a public repository. Repo-level release automation must build binaries from audited
source and use signed artifacts for automatic updates.
