# InfraGraph source

The first executable **scaffold** for architecture v1.0 is implemented. It is not a functioning network monitor yet.

- server/: ControlPlane, AgentGateway, Worker, domain Modules, Infrastructure, Contracts and SharedKernel.
- agents/: passive Windows Agent and Updater Windows Service hosts.
- web/infragraph-admin/: React/TypeScript/Vite admin UI integrated via ASP.NET Core SPA Proxy.
- collectors/: optional future site collector; deliberately not created before a validated network reachability requirement.

Dependencies flow from hosts -> module/interfaces and infrastructure adapters; domain code has no HTTP, Windows, EF or network driver dependency. Source-level boundary test lives at scripts/check-project-boundaries.ps1.

See docs/engineering/development-setup.md and docs/PROJECT_STATUS.md.
