-- InfraGraph initial schema: execute as PostgreSQL migration owner, never as app runtime user.
-- Version 001. Does NOT enable inbound Agent telemetry or data access without explicit credentials.
BEGIN;

CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS ingest;

CREATE TABLE IF NOT EXISTS inventory.assets (
  id UUID PRIMARY KEY,
  site_id VARCHAR(120) NOT NULL,
  display_name VARCHAR(240),
  created_at_utc TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_assets_site_id ON inventory.assets (site_id);

CREATE TABLE IF NOT EXISTS ingest.installations (
  agent_id UUID PRIMARY KEY,
  installation_epoch UUID NOT NULL UNIQUE,
  site_id VARCHAR(120) NOT NULL,
  agent_version VARCHAR(64) NOT NULL,
  last_received_at_utc TIMESTAMPTZ
);

-- NOLOGIN role groups: use separate secret-managed LOGIN principals and grant membership.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infragraph_controlplane') THEN
    CREATE ROLE infragraph_controlplane NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infragraph_gateway') THEN
    CREATE ROLE infragraph_gateway NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infragraph_worker') THEN
    CREATE ROLE infragraph_worker NOLOGIN;
  END IF;
END $$;

-- Default privileges are not trusted. Do not give Gateway access to inventory assets.
REVOKE ALL ON SCHEMA inventory FROM PUBLIC;
REVOKE ALL ON SCHEMA ingest FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA inventory FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ingest FROM PUBLIC;

GRANT USAGE ON SCHEMA inventory TO infragraph_controlplane, infragraph_worker;
GRANT USAGE ON SCHEMA ingest TO infragraph_gateway, infragraph_controlplane, infragraph_worker;
GRANT SELECT, INSERT, UPDATE ON inventory.assets TO infragraph_controlplane;
GRANT SELECT ON inventory.assets TO infragraph_worker;
GRANT SELECT ON ingest.installations TO infragraph_controlplane;
GRANT SELECT, INSERT ON ingest.installations TO infragraph_gateway;
GRANT UPDATE (agent_version, last_received_at_utc) ON ingest.installations TO infragraph_gateway;
GRANT SELECT ON ingest.installations TO infragraph_worker;

COMMIT;
