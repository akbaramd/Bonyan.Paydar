-- Apply after 001_schema.sql and 002_access_discovery.sql as migration owner.
-- Retraction preserves original evidence rather than deleting history.
BEGIN;
ALTER TABLE discovery.observations
    ADD COLUMN IF NOT EXISTS retracted_at_utc TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_observations_site_active
    ON discovery.observations(site_id, observed_at_utc DESC)
    WHERE retracted_at_utc IS NULL;
GRANT UPDATE (retracted_at_utc) ON discovery.observations TO infragraph_controlplane;
COMMIT;
