# Paydar Agent-to-Topology contract

## Binding invariant
An Agent installation is a management identity; a discovered node is a network/device identity. Always keep telemetry freshness separate from host reachability and physical topology evidence. Recent inventory is not proof of OS health or successful Ping.

## Graph shape
When ControlPlane adds any new kind, identitySource or provenance field to `/api/v1/topology/graph`, update the Zod decoder, topology mapper, Discovery table and tests in the same change. Never allow a newly added node type to crash rendering of the entire graph; unsupported kinds degrade to `unknown` without falsely asserting evidence.

Source-backed Agent nodes use a stable Agent ID, recorded last inventory time, bounded status (`recent`, `stale`, `revoked`) and a preferred reported IPv4. Prefer known scan addresses, then an active physical interface; do not render each tunnel/VPN address as a separate device. Duplicate IP claims are ambiguous and must not prove identity.

## Operator UI
Show a recognizable Windows/computer silhouette, prominent Agent marker, and separate Agent freshness indicator. Never derive green machine health from an Agent report alone. Node Inspector may read hardware details only through site-authorized API; do not embed full inventories in graph responses.

## Gates
- Backend integration asserts one Agent device, a real IPv4, no invented LLDP/cable edge, and agent status/provenance.
- Frontend contract tests parse Agent nodes and unknown future node kinds.
- Browser E2E asserts the node renders, status is visible, Inspector displays hardware, and stale data is not called healthy.
- Deploy ControlPlane/React build with a verified rollback directory. Do not restart Gateway, Windows Agent, or any unrelated project process.
- Pilot infrastructure, customer IPs, credentials, certificates and machine inventory must remain outside public Git.
