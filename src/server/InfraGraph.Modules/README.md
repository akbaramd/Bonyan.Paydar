# Bounded modules — implementation contracts

Current implemented domain primitives:
- Inventory: AssetId and append-only source-specific observations (IP changes are evidence, not new identity).
- Monitoring: HealthState, explicitly differentiating missing/fresh/stale observations and observer failure.
- Topology: typed physical/L2/L3/dependency links with evidence requirements and freshness.

**Planned modules, NOT implemented:** Identity & Access/RBAC, site-scoped Network Discovery, Endpoint enrollment, Telemetry persistence, incidents, Agent Lifecycle, policy/audit and optional AI. Only create modules when a vertical slice implements their invariants and tests.

Dependency rule: Module domain logic depends only on SharedKernel; it must not reference web hosts, EF Core, SNMP drivers, Windows services or UI. EF adapters live in Infrastructure. Transport DTOs live in Contracts. Intermodule access uses explicit contracts, not direct private table reads.
