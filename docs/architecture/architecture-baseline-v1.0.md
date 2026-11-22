# InfraGraph — Architecture Baseline v1.0

**Decision:** APPROVED FOR IMPLEMENTATION — ARCHITECTURE SELECTION PHASE CLOSED  
**Date:** 2026-11-19  
**Review basis:** original ADR-0001..0012, scenario challenge evaluation, and final ADR-0013..0015.  
**Review authority:** AI-assisted technical design review requested by product owner; **not** a substitute for independent penetration test, capacity study or client acceptance.  
**Release eligibility:** NOT APPROVED FOR PRODUCTION.

## Scope of approval

The architecture is sufficiently defined to begin the first executable **vertical slice** without reopening framework, hosting or core data-store selection. Engineering validation and commercial requirements continue during implementation; any contradicting evidence uses ADR change control.

### Fixed architecture

~~~mermaid
flowchart TB
  UI["React + TypeScript + Vite (source)"] -->|"SPA dev proxy / prod static hosting"| CP["ASP.NET Core ControlPlane + Admin API + SignalR"]
  AG["Windows Agent + SQLite spool"] -->|"Outbound mTLS HTTPS"| GW["ASP.NET Core AgentGateway"]
  AU["Separate privileged signed Updater"] -->|"HTTPS release metadata/packages"| GW
  SC["Optional site Collector"] -->|"Outbound scoped TLS"| GW
  CP -->|"admin DB role"| PG[("PostgreSQL")]
  GW -->|"ingest-only DB role"| PG
  WK[".NET Worker — network discovery, topology & incident workflows"] <-->|"worker DB role"| PG
  WK -->|"authorized SNMPv3 / LLDP via management / WMI / SSH"| NET["Network & endpoint observations"]
~~~

| Architectural concern | Binding baseline |
| --- | --- |
| Backend runtime | .NET 10 LTS and ASP.NET Core |
| UI | React, TypeScript, Vite; SPA proxy only during development; React build served by ASP.NET Core in production |
| Components | ControlPlane (Admin/SignalR), AgentGateway (untrusted ingress), Worker (jobs/discovery/health), Windows Agent and restricted Updater |
| Boundaries | Modular core with vertical slices; separate deployable hosts and distinct PostgreSQL service accounts/permissions; no mandatory microservices |
| Initial deployment | Per-customer On-prem Linux x86_64, Docker Compose v2, PostgreSQL; no required cloud, support offline artifact import |
| DB and async | PostgreSQL canonical truth; native partitioned metrics with bulk ingest; inbox/outbox/leased jobs for critical events |
| Redis/RabbitMQ | Not used in v1; add only after measured need and a new ADR |
| TimescaleDB, Neo4j, Elasticsearch, Kubernetes | Not used in v1; optional evaluated upgrades |
| Agent | Windows Service auto-start, local bounded spool, per-install identity and dedicated Gateway mTLS, signed update rings, health and rollback |
| Initial supported endpoint target | Windows 11 x64, Windows Server 2022/2025 x64; exact versions verified during Windows agent spike |
| Network discovery | Scoped SNMPv3, LLDP/CDP via device management, bridge FDB/MAC/ARP, ICMP, authorized WMI/SSH; optional site collector |
| Topology | Temporal evidence graph with typed L1/L2/L3/service dependencies, confidence/coverage, unknown vs confirmed |
| Monitoring UI | Focused graph by incident/site; alert-first and status freshness; SignalR signals revisions rather than raw metric firehose |
| AI | Optional advisory/On-prem, deterministic baseline works without models |
| Security | RBAC/least privilege, no arbitrary Agent shell, restricted Agent Gateway DB role, signed updater and audited changes |
| Product licensing | Offline signed local entitlements; no cloud dependency for core monitoring or updates |

## Explicit limits

This approval does **not** mean a functioning prototype or a security/performance guarantee. No running components, migration, customer environment verification, Agent software, real incident engine or published installer exists yet.

- The initial installation is single-node; high availability is not promised.
- Discovery cannot guarantee 100% physical topology without managed network evidence.
- Endpoint offline/heartbeat loss cannot imply power-off; observation Stale/Unknown is a legitimate answer.
- Per-device private keys, mTLS proxy compatibility, code signing/keys, retention and exact rates are acceptance-test tasks.
- Privileged remote control and autonomous AI remediation are out of initial scope.

## Exit from architecture -> implementation

**Architecture phase exit tests** (design-only)
1. Core roles and user journeys recorded. PASS — product vision, scope, risk table.
2. Runtime / deployment / data / trust diagrams recorded. PASS — 7 Mermaid diagrams + this overview.
3. High-impact decisions documented with alternatives. PASS — ADR-0001..0015.
4. Offline handling, event ordering, topology identity and rollout semantics specified. PASS — draft contracts and failure review.
5. Architecture documentation smoke and fixture parse. PASS after executing check-architecture.ps1.
6. Real performance, security, install and topology test evidence. **OPEN — these are implementation/release gates**, not architecture documentation completion gates.

**First executable slice:** ControlPlane + hosted React SPA, AgentGateway, PostgreSQL schema/roles, a minimal Agent enrollment/heartbeat and server-side freshness view. Implement only the projects and features used by that slice. No premature network scanner/ML/broker before basic identity/protocol testing.

## Rules after freeze

- Decision change requires new ADR and migration/rollback path; no stealth architecture drift.
- Benchmarks or security evidence may force a change; the freeze controls changes rather than prohibiting correction.
- Implement against documented message/identity/health invariants, then run verification gates in docs/engineering/acceptance-gates.md.
- Do not call an SLO or topology accuracy target achieved until there are actual test results.

## References

- [Architecture](reference-architecture.md)
- [Final ADR](decisions/0015-architecture-approval-and-change-control.md)
- [Challenge review](architecture-review-2026-11-19.md)
- [Current tech decisions](decision-summary.md)
- [Contracts](data-and-contracts.md)
- [Implementation order](implementation-phases.md)
- [Production release checks](../engineering/acceptance-gates.md)
