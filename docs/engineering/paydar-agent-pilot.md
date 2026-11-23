# Paydar Agent — controlled pilot runbook

**Status:** preview only. Code and isolated integration tests passed; real enterprise
PKI handshake, PostgreSQL migration/grants, installation on separate Windows
endpoints, and on-prem topology acceptance have NOT been verified.

## Scope

Paydar Windows Service collects read-only CPU, RAM, GPU, logical disks,
IPv4/IPv6 interfaces, and connected Windows PnP devices. It does **not**
collect user files, screen content, keystrokes, or arbitrary shell commands.
An interactive Windows tray app configures the HTTPS Gateway, displays the
Agent ID and Installation Epoch, and checks certificate approval.

The ControlPlane and AgentGateway remain separate. Each organization uses
its own on-prem server/CA configuration and a separate site scope.
**No public internet or foreign cloud is needed at runtime.**

## Prerequisites

- Windows x64 test client with administrator access and approved installation.
- Reachable on-prem HTTPS AgentGateway with hostname matching its TLS
  server certificate. Do not skip TLS validation or send plain HTTP telemetry.
- Trusted organizational CA issuing per-client certificates with Client
  Authentication EKU (OID `1.3.6.1.5.5.7.3.2`), private keys non-exportable.
- Operator access to ControlPlane over HTTPS, plus a named administrator
  for manual certificate approval.
- PostgreSQL database migrated through `008_agent_inventory.sql`. The
  gateway runtime role needs minimal SELECT/UPDATE on `ingest.installations`
  and SELECT/INSERT/UPDATE on `ingest.endpoint_inventories`. ControlPlane
  uses its separate, least-privileged runtime DB role. Apply grants using
  the organization's approved DBA workflow.
- Kestrel hosting mTLS directly with the CA chain trusted on the Gateway
  OS (no client-certificate forwarding header is supported).

## Step-by-step, one test client first

1. Deploy Server, ControlPlane, Gateway and database in a **staging** network.
   Apply `infra/deployment/postgres/008_agent_inventory.sql` after snapshot
   and migration review. Verify `/health/ready` through the approved client
   certificate; a 503 indicates the gateway DB/schema is not ready.
2. Download the `Paydar-Agent-*-win-x64.exe` preview or the ZIP from a
   reviewed GitHub Release; check its published SHA256. These builds are
   **not code-signed** and must only run on approved lab endpoints.
3. Install from the EXE as Administrator, or extract the ZIP and invoke
   `Install-PaydarAgent.ps1 -PackagePath <extracted-directory>` elevated.
   Service name is `PaydarAgent` (Automatic). The tray icon starts at the
   next interactive Windows sign-in.
4. Open the tray > **تنظیم و تست اتصال پایدار**. Copy the Agent ID and
   Installation Epoch. Both identifiers must be preserved across restart.
5. Generate a non-exportable machine-key CSR, elevated:

   ```powershell
   .\New-PaydarClientCsr.ps1 -OutputDirectory "C:\Paydar-Enrollment"
   ```

   The CSR contains the device identity but **not** the private key.
   Have the approved internal CA sign it for **Client Authentication**.
6. On the same client, install the issued certificate:

   ```powershell
   .\Complete-PaydarClientCertificate.ps1 `
     -IssuedCertificatePath "C:\Paydar-Enrollment\issued.cer" `
     -ServerUrl "https://gateway.example.internal:8444"
   ```

   This sets the certificate thumbprint in `%ProgramData%\Paydar\agent.json`
   and restarts the service. The Gateway URL is an example, not a default.
7. An authorized administrator opens **Agentها → تأیید گواهی Agent** in
   ControlPlane. Enter the two GUIDs, the approved site ID, and the exact
   client certificate SHA-1 thumbprint shown by the issued certificate.
   The approval is audited and bound to one device identity.
8. On the client tray click **بررسی اتصال**. A successful response means
   the Gateway accepted the per-device certificate and approval; the
   Windows Service should deliver inventory in its next cycle
   (up to about 30 seconds while disconnected).
9. In ControlPlane, confirm the site-scoped **recent** inventory state and
   read `GET /api/v1/agents/inventory?siteId=<site>`. Then open topology;
   the device appears at a unique self-reported IPv4 address with
   `identitySource=agent-self-reported-ip`. This is an **endpoint identity
   hypothesis**, not an asserted Ethernet adjacency.
10. To revoke the device, an authenticated admin posts
    `/api/v1/admin/agents/{agentId}/revoke` with an authorized CSRF token.
    Afterwards the Gateway must reject its certificate even if still valid.

## Acceptance gate

- First approved Agent presents certificate, is approved, receives HTTP 200,
  and its inventory is stored durably and visible only to site-authorized users.
- Wrong/expired/missing certificate, wrong epoch, revoked Agent, replayed
  inventory and plaintext HTTP are rejected.
- Service restarts and reconnects without changing its stable Agent ID.
- Tray starts only in interactive Windows session, not Session 0.
- No unrelated host process or customer's live DB is modified.
- Two organizations can be deployed independently with distinct CA,
  site, and operational access boundaries.
- No outside domain, CDN, login or update server required at runtime.

## Not yet available

- Signed autonomous Agent/Updater release lifecycle and rollback (updater disabled).
- Full MSI with managed deployment/repair/rollback (EXE bootstrapper only).
- Arbitrary PowerShell, Remote Desktop or remote file-management capability.
- Confirmed physical switch-to-endpoint topology (requires LLDP/FDB
  correlation; self-reported IP alone is insufficient).
- Real endpoint-to-Gateway certificate handshake acceptance: must be
  tested in the pilot's target Windows/PKI environment.

Never publish customer topology, machine inventories, certificate keys,
administrative secrets or private organization IPs in the public repository.
