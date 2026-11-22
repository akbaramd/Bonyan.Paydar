-- Migration 005: operator-approved active IPv4 discovery, durable job progress,
-- and event outbox. Worker may write scan data but no unrelated inventory.
BEGIN;
CREATE TABLE IF NOT EXISTS discovery.scan_jobs (
 id UUID PRIMARY KEY,
 site_id VARCHAR(120) NOT NULL,
 cidrs TEXT NOT NULL,
 status VARCHAR(20) NOT NULL CHECK (status IN ('pending','running','cancelling','cancelled','failed')),
 interval_seconds INT NOT NULL CHECK (interval_seconds BETWEEN 30 AND 3600),
 target_count INT NOT NULL CHECK (target_count BETWEEN 1 AND 1024),
 probed_count INT NOT NULL DEFAULT 0,
 responsive_count INT NOT NULL DEFAULT 0,
 cycle INT NOT NULL DEFAULT 0,
 requested_by VARCHAR(254) NOT NULL,
 requested_at_utc TIMESTAMPTZ NOT NULL,
 started_at_utc TIMESTAMPTZ,
 last_sweep_at_utc TIMESTAMPTZ,
 completed_at_utc TIMESTAMPTZ,
 error VARCHAR(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scan_jobs_one_active_site
 ON discovery.scan_jobs(site_id) WHERE status IN ('pending','running','cancelling');
CREATE INDEX IF NOT EXISTS ix_scan_jobs_requested ON discovery.scan_jobs(site_id, requested_at_utc DESC);
CREATE TABLE IF NOT EXISTS discovery.scan_hosts (
 id UUID PRIMARY KEY,
 site_id VARCHAR(120) NOT NULL,
 address VARCHAR(15) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK (status IN ('responsive','unresponsive')),
 icmp_responded BOOLEAN NOT NULL,
 tcp_ports VARCHAR(100) NOT NULL,
 last_probed_at_utc TIMESTAMPTZ NOT NULL,
 last_seen_at_utc TIMESTAMPTZ NOT NULL,
 last_job_id UUID NOT NULL REFERENCES discovery.scan_jobs(id),
 UNIQUE(site_id, address)
);
CREATE INDEX IF NOT EXISTS ix_scan_hosts_site_status ON discovery.scan_hosts(site_id, status);
CREATE TABLE IF NOT EXISTS discovery.scan_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 site_id VARCHAR(120) NOT NULL,
 job_id UUID NOT NULL REFERENCES discovery.scan_jobs(id),
 kind VARCHAR(32) NOT NULL,
 address VARCHAR(15),
 status VARCHAR(20),
 probed_count INT NOT NULL,
 target_count INT NOT NULL,
 at_utc TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_scan_events_site_id ON discovery.scan_events(site_id, id DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA discovery FROM PUBLIC;
GRANT SELECT, INSERT ON discovery.scan_jobs TO infragraph_controlplane;
GRANT UPDATE (status) ON discovery.scan_jobs TO infragraph_controlplane;
GRANT SELECT ON discovery.scan_hosts, discovery.scan_events TO infragraph_controlplane;
GRANT SELECT, UPDATE ON discovery.scan_jobs TO infragraph_worker;
GRANT SELECT, INSERT, UPDATE ON discovery.scan_hosts TO infragraph_worker;
GRANT SELECT, INSERT ON discovery.scan_events TO infragraph_worker;
GRANT USAGE, SELECT ON SEQUENCE discovery.scan_events_id_seq TO infragraph_worker;
COMMIT;
