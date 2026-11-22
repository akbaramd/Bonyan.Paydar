-- Apply manually under a reviewed, privileged migration connection.
-- Agent keys are provisioned by an authorized admin; there is no open self-enrollment.
ALTER TABLE ingest.installations
  ADD COLUMN IF NOT EXISTS client_certificate_thumbprint varchar(64),
  ADD COLUMN IF NOT EXISTS revoked_at_utc timestamptz,
  ADD COLUMN IF NOT EXISTS last_inventory_at_utc timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS installations_certificate_thumbprint_uidx
  ON ingest.installations (client_certificate_thumbprint)
  WHERE client_certificate_thumbprint IS NOT NULL;
CREATE TABLE IF NOT EXISTS ingest.endpoint_inventories (
  agent_id uuid PRIMARY KEY REFERENCES ingest.installations(agent_id) ON DELETE CASCADE,
  site_id varchar(120) NOT NULL,
  snapshot jsonb NOT NULL,
  collected_at_utc timestamptz NOT NULL,
  received_at_utc timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS endpoint_inventories_site_idx ON ingest.endpoint_inventories (site_id, received_at_utc DESC);
-- Restrict runtime credentials outside this migration. Gateway needs SELECT/UPDATE
-- on ingest.installations and SELECT/INSERT/UPDATE on ingest.endpoint_inventories.
-- ControlPlane needs read-only SELECT scoped by authenticated operator site.
