# Paydar (formerly InfraGraph)

On-prem IT command center for network discovery, endpoint inventory, temporal evidence-backed topology, monitoring, incident analysis and later AI assistance.

**Agent preview (2026-11-22):** The Windows Service now collects read-only CPU, RAM, GPU, storage, network and PnP inventory, with a separate tray and an unsigned EXE installer. Secure mTLS ingestion and topology mapping have source implementations, but have not been validated against real client certificates or production PostgreSQL. Signed auto-update and unattended rollout are not implemented. See docs/engineering/paydar-agent-pilot.md.

**Status:** .NET/React **solution scaffold implemented and locally verified**. Real network probing has been piloted; secured Agent enrollment, field mTLS checks and full hardware topology are **not yet accepted**. Approved architecture baseline: [v1.0](docs/architecture/architecture-baseline-v1.0.md).

## Quick start (Mate Server / Windows)

Prerequisites: .NET SDK 10.0.401, Node.js 24, npm 11.

```powershell
dotnet restore InfraGraph.sln --locked-mode
dotnet build InfraGraph.sln -m:1 -p:UseSharedCompilation=false
dotnet test InfraGraph.sln --no-restore -m:1
dotnet run --project src/server/InfraGraph.ControlPlane --launch-profile https
```

ASP.NET Core starts on https://localhost:7187, its official **SPA Proxy** starts React/Vite at http://localhost:5173. Dev browser entry redirects to Vite; Vite proxies /api to ASP.NET Core. The admin dashboard is RTL Persian. In **development only**, the topology viewer displays an explicitly labeled synthetic sample; the production release shows **no data/unknown**, not invented network health.

Production build of combined React+ASP.NET Core package:
`dotnet publish src/server/InfraGraph.ControlPlane/InfraGraph.ControlPlane.csproj -c Release -m:1`.
Run the published DLL **from its publish directory** so ASP.NET Core finds `wwwroot`. No Node runtime is needed for the published web server.

## React UI architecture and UX
- Radix UI **headless Primitives** (not Redux), custom InfraGraph token-based components and Persian RTL dark/light themes.
- TanStack Table v8, TanStack Virtual v3, TanStack Query v5, React Router and Zod runtime API schemas.
- Desktop + tablet responsive shell with compact/comfortable density, Dev-only table stress lab and design-system gallery.
- Frontend v1.1: self-hosted Vazirmatn Variable, Radix operator controls, React Flow graph with SVG edge paths, mouse/touch pan/zoom, local sanitized SVG underlay, desktop split inspector and tablet drawer.
- Frontend tests: **20/20 Vitest** and **15/15 Edge Playwright** (desktop/tablet/narrow screens and axe accessibility checks), plus combined ASP.NET Core Release publish. See docs/frontend/verification-2026-11-20.md.
- Frontend decisions: docs/architecture/decisions/0016-frontend-headless-design-system.md and docs/architecture/decisions/0017-react-workstation-svg-topology.md.
- Frontend setup: docs/frontend/README.md.

## Key locations

- `InfraGraph.sln` — 12 .NET projects.
- `src/server/InfraGraph.ControlPlane/` — admin API, static React, SignalR.
- `src/server/InfraGraph.AgentGateway/` — isolated Agent ingress; currently **fail closed**.
- `src/server/InfraGraph.Worker/` — passive background worker, discovery disabled.
- `src/server/InfraGraph.Modules/` — inventory, monitoring and topology domain.
- `src/server/InfraGraph.Infrastructure/` — EF Core/Npgsql mappings.
- `src/server/InfraGraph.Contracts/` — wire protocol DTOs.
- `src/server/InfraGraph.SharedKernel/` — stable IDs/time primitives.
- `src/agents/` — passive Windows Agent and restricted Updater service scaffolds.
- `src/web/infragraph-admin/` — React, TypeScript, Vite; npm lock.
- `tests/` — unit, contract and HTTP integration tests.
- `infra/` — PostgreSQL local Compose, schema script and loopback-only Docker smoke examples.
- `docs/engineering/development-setup.md` — full run commands and limitations.
- `docs/engineering/verification-2026-11-19.md` — actual local test results.

## Quality checks
`scripts/verify.ps1` runs .NET build/tests, npm build/lint, architecture document and project-boundary checks. CI is in `.github/workflows/ci.yml`; CI has been configured but not run remotely.

**Boundary:** No scanning or endpoint data collection is enabled in the scaffold. Agent Gateway endpoints intentionally return HTTP 503 until real mTLS enrollment, RBAC and PostgreSQL durable ingestion exist. Docker Engine and PostgreSQL live integration are not validated yet.

Architecture changes use versioned ADRs; implementation-only details are documented, measured and tested rather than silently redesigning the platform.

