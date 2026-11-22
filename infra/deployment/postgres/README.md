# PostgreSQL schema bootstrap (not deployed)

001_schema.sql establishes the initial inventory and registered-Agent identity table, with three distinct **NOLOGIN group roles**. It is a design/implementation starting point, not a production deployment or automatic migration.

Run in a local **isolated test PostgreSQL instance** as a database owner after configuring your DB environment:
`psql -v ON_ERROR_STOP=1 -d infragraph -f 001_schema.sql`.

Create separate **LOGIN users with secret-managed passwords** for ControlPlane, AgentGateway, and Worker, and grant only their corresponding group role; do not commit passwords or use PostgreSQL superuser credentials for running applications. Grant migration/schema ownership only to a dedicated deployment principal. Test negative permissions: Gateway must not read/modify inventory or admin credentials.

Production migration management, schema history and backup/restore tests are the next slice. No live Agent ingestion is active yet.
