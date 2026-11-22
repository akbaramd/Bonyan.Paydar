-- Apply with migration owner after 001_schema.sql. Never under the runtime login.
BEGIN;
CREATE SCHEMA IF NOT EXISTS access;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS discovery;
CREATE TABLE IF NOT EXISTS access.operators (
 id UUID PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(1024) NOT NULL, role VARCHAR(20) NOT NULL
 CHECK (role IN ('admin','operator','viewer')),
 site_id VARCHAR(120), is_active BOOLEAN NOT NULL,
 failed_logins INT NOT NULL DEFAULT 0, locked_until_utc TIMESTAMPTZ,
 security_stamp UUID NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL,
 CONSTRAINT scoped_operator CHECK (role = 'admin' OR site_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS audit.operator_events (
 id UUID PRIMARY KEY, actor VARCHAR(254) NOT NULL, action VARCHAR(64) NOT NULL,
 target VARCHAR(254) NOT NULL, success BOOLEAN NOT NULL, at_utc TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_operator_events_at_utc ON audit.operator_events(at_utc);
CREATE TABLE IF NOT EXISTS discovery.observations (
 id UUID PRIMARY KEY, site_id VARCHAR(120) NOT NULL,
 source_key VARCHAR(160) NOT NULL, target_key VARCHAR(160) NOT NULL,
 source_port VARCHAR(80), target_port VARCHAR(80), protocol VARCHAR(32) NOT NULL,
 observed_at_utc TIMESTAMPTZ NOT NULL, received_at_utc TIMESTAMPTZ NOT NULL,
 ttl_seconds INT NOT NULL CHECK (ttl_seconds BETWEEN 1 AND 86400),
 source VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_observations_site_time ON discovery.observations(site_id, observed_at_utc);
REVOKE ALL ON SCHEMA access, audit, discovery FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA access, audit, discovery FROM PUBLIC;
GRANT USAGE ON SCHEMA access, audit, discovery TO infragraph_controlplane;
GRANT SELECT, INSERT, UPDATE ON access.operators TO infragraph_controlplane;
GRANT SELECT, INSERT ON audit.operator_events TO infragraph_controlplane;
GRANT SELECT, INSERT ON discovery.observations TO infragraph_controlplane;
GRANT USAGE ON SCHEMA discovery TO infragraph_worker;
GRANT SELECT ON discovery.observations TO infragraph_worker;
COMMIT;
