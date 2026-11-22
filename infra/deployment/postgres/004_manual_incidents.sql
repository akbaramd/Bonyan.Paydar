-- Apply after 003_evidence_lifecycle.sql as the migration owner.
-- An operator-reported incident is not a machine-generated alert.
BEGIN;
CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.incidents (
    id UUID PRIMARY KEY,
    site_id VARCHAR(120) NOT NULL,
    title VARCHAR(240) NOT NULL,
    description VARCHAR(1000),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('open','acknowledged','resolved')),
    origin VARCHAR(32) NOT NULL CHECK (origin = 'operator-reported'),
    created_by VARCHAR(254) NOT NULL,
    acknowledged_by VARCHAR(254),
    resolved_by VARCHAR(254),
    created_at_utc TIMESTAMPTZ NOT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_incidents_site_created
    ON operations.incidents (site_id, created_at_utc DESC, id);
REVOKE ALL ON SCHEMA operations FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA operations FROM PUBLIC;
GRANT USAGE ON SCHEMA operations TO infragraph_controlplane;
GRANT SELECT, INSERT ON operations.incidents TO infragraph_controlplane;
GRANT UPDATE (status, updated_at_utc, acknowledged_by, resolved_by)
    ON operations.incidents TO infragraph_controlplane;
COMMIT;
