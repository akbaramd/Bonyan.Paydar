# Tests

- unit/InfraGraph.UnitTests: stable asset identity, health semantics and topology evidence constraints.
- contracts/InfraGraph.ContractTests: initial versioned Agent protocol compatibility and validation.
- integration/InfraGraph.IntegrationTests: ControlPlane and AgentGateway HTTP fail-closed tests, EF Core model/schema metadata contract (no database connection).
- e2e/, performance/, fixtures/: retained for real browser tests, network lab fixtures and throughput/recovery benchmarks; no implemented suites yet.

Current tests: 16/16 passing (7 unit, 4 contract, 5 integration). This does not prove Agent update signing, actual PostgreSQL permissions, topology accuracy, real LAN discovery or load behavior.

Commands: `dotnet test InfraGraph.sln --no-restore -m:1 -p:UseSharedCompilation=false`.
