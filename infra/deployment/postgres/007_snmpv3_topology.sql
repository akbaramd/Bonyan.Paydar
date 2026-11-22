-- Migration 007: evidence-backed SNMPv3 device identities, LLDP neighbors
-- and learned MAC/bridge ports. No credentials stored anywhere in SQL.
BEGIN;
CREATE TABLE IF NOT EXISTS discovery.managed_devices (
 site_id VARCHAR(120) NOT NULL,
 address VARCHAR(15) NOT NULL,
 system_name VARCHAR(160),
 system_description VARCHAR(240),
 system_object_id VARCHAR(160),
 kind VARCHAR(20) NOT NULL CHECK (kind IN ('unknown','router','switch')),
 chassis_id VARCHAR(64),
 last_seen_at_utc TIMESTAMPTZ NOT NULL,
 PRIMARY KEY (site_id,address)
);
CREATE INDEX IF NOT EXISTS ix_managed_devices_site_chassis
 ON discovery.managed_devices(site_id,chassis_id);
CREATE TABLE IF NOT EXISTS discovery.lldp_neighbors (
 id UUID PRIMARY KEY,
 site_id VARCHAR(120) NOT NULL,
 local_address VARCHAR(15) NOT NULL,
 local_port VARCHAR(80) NOT NULL,
 remote_port VARCHAR(80) NOT NULL,
 remote_chassis_id VARCHAR(64) NOT NULL,
 remote_system_name VARCHAR(160),
 observed_at_utc TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lldp_neighbors_site_addr
 ON discovery.lldp_neighbors(site_id,local_address);
CREATE TABLE IF NOT EXISTS discovery.fdb_learned_macs (
 id UUID PRIMARY KEY,
 site_id VARCHAR(120) NOT NULL,
 bridge_address VARCHAR(15) NOT NULL,
 mac_address VARCHAR(17) NOT NULL,
 learned_port VARCHAR(80) NOT NULL,
 observed_at_utc TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_fdb_learned_macs_site_bridge
 ON discovery.fdb_learned_macs(site_id,bridge_address);
REVOKE ALL ON ALL TABLES IN SCHEMA discovery FROM PUBLIC;
GRANT SELECT ON discovery.managed_devices,discovery.lldp_neighbors,
 discovery.fdb_learned_macs TO infragraph_controlplane;
GRANT SELECT,INSERT,UPDATE ON discovery.managed_devices TO infragraph_worker;
GRANT SELECT,INSERT,DELETE ON discovery.lldp_neighbors,
 discovery.fdb_learned_macs TO infragraph_worker;
COMMIT;
