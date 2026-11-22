-- Backward-compatible durable probe hysteresis.
-- A missed packet is not proof of a dead device. A stopped monitoring job
-- yields a stale API state without altering the last observed evidence.
BEGIN;
ALTER TABLE discovery.scan_hosts
    ADD COLUMN IF NOT EXISTS consecutive_misses INT NOT NULL DEFAULT 0;
ALTER TABLE discovery.scan_hosts
    DROP CONSTRAINT IF EXISTS ck_scan_hosts_consecutive_misses;
ALTER TABLE discovery.scan_hosts
    ADD CONSTRAINT ck_scan_hosts_consecutive_misses
    CHECK (consecutive_misses BETWEEN 0 AND 2);
ALTER TABLE discovery.scan_hosts
    DROP CONSTRAINT IF EXISTS scan_hosts_status_check;
ALTER TABLE discovery.scan_hosts
    ADD CONSTRAINT scan_hosts_status_check
    CHECK (status IN ('responsive','suspect','unresponsive'));
COMMIT;
