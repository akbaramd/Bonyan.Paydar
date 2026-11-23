import { describe, expect, it } from 'vitest'
import { graphSchema, toTopologyDataset } from './graph'

describe('reported topology API mapping', () => {
  const graph = {
    siteId: 'site-one',
    nodes: [{ id: 'sw-a', depth: 0 }, { id: 'sw-b', depth: 1 }],
    links: [{
      id: 'l1', source: 'sw-a', target: 'sw-b',
      sourcePort: 'Gi1', targetPort: 'Gi2', protocol: 'LLDP',
      evidenceIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], possibleCycle: true,
    }],
    staleObservations: 0, truncated: false, generatedAtUtc: '2026-11-20T10:00:00Z',
    provenance: 'operator-reported-unverified' as const,
  }
  it('does not assert kind or health from a neighbor report', () => {
    const dataset = toTopologyDataset(graphSchema.parse(graph))
    expect(dataset.origin).toBe('reported')
    expect(dataset.devices).toHaveLength(2)
    expect(dataset.devices.every(d => d.kind === 'unknown' && d.state === 'unknown')).toBe(true)
    expect(dataset.edges[0].data?.possibleCycle).toBe(true)
  })
  it('keeps actively probed IPs visible without asserting device health or physical links', () => {
    const discovered = graphSchema.parse({
      ...graph, nodes: [{
        id: '10.2.3.42', depth: 0, address: '10.2.3.42',
        probeStatus: 'responsive', icmpResponded: true, tcpPorts: [22, 443],
        lastSeenAtUtc: '2026-11-20T10:00:00Z',
      }, {
        id: '10.2.3.43', depth: 0, address: '10.2.3.43',
        probeStatus: 'unresponsive', icmpResponded: false, tcpPorts: [],
        lastSeenAtUtc: '2026-11-20T09:00:00Z',
      }],
      links: [],
      provenance: 'active-ipv4-and-reported-evidence',
    })
    const dataset = toTopologyDataset(discovered)
    expect(dataset.origin).toBe('live')
    expect(dataset.edges).toHaveLength(0)
    expect(dataset.devices[0]).toMatchObject({
      kind: 'unknown', state: 'unknown', address: '10.2.3.42', port: '22, 443',
    })
    expect(dataset.devices[0].evidence).toContain('ICMP')
    expect(dataset.devices[1].state).toBe('warning')
    expect(dataset.devices[1].description).toContain('قطعی دستگاه اثبات نشده است')
  })

  it('connects observed IPs to subnet segments as visibly logical, not physical, links', () => {
    const observed = graphSchema.parse({
      ...graph,
      nodes: [{ id: '192.168.88.34', depth: 0, address: '192.168.88.34',
        probeStatus: 'responsive', icmpResponded: true, tcpPorts: [22, 443] }],
      links: [],
      logicalSegments: [{
        id: 'subnet:192.168.88.0/22', cidr: '192.168.88.0/22',
        hostIds: ['192.168.88.34'],
      }],
      provenance: 'active-ipv4-and-reported-evidence',
    })
    const dataset = toTopologyDataset(observed)
    expect(dataset.devices).toHaveLength(2)
    expect(dataset.devices[0].kind).toBe('subnet')
    expect(dataset.devices[0].description).toContain('اتصال مستقیم')
    expect(dataset.edges).toHaveLength(1)
    expect(dataset.edges[0]).toMatchObject({
      source: 'subnet:192.168.88.0/22',
      target: '192.168.88.34',
      data: { logicalMembership: true, provenance: 'approved-scan-cidr' },
    })
  })

  it('uses authenticated SNMPv3 identity and real LLDP adjacency but not FDB as a link', () => {
    const enriched = graphSchema.parse({
      ...graph,
      nodes: [
        { id: '192.168.88.10', depth: 0, address: '192.168.88.10',
          deviceKind: 'switch', systemName: 'core-switch', systemObjectId: '1.3.6.1.4.1.9',
          systemDescription: 'managed switch', learnedMacCount: 44,
          identitySource: 'snmpv3-authpriv', snmpObservedAtUtc: '2026-11-20T10:00:00Z' },
        { id: 'lldp:AABBCCDD', depth: 1,
          deviceKind: 'unknown', systemName: 'remote-endpoint',
          identitySource: 'lldp-remote' },
      ],
      links: [{ ...graph.links[0], id: 'lldp:1',
        source: '192.168.88.10', target: 'lldp:AABBCCDD',
        protocol: 'LLDP', possibleCycle: false, evidenceSource: 'snmpv3-authpriv' }],
      provenance: 'snmpv3-and-active-ipv4-evidence',
    })
    const ds = toTopologyDataset(enriched)
    expect(ds.origin).toBe('live')
    expect(ds.devices[0].kind).toBe('switch')
    expect(ds.devices[0].name).toBe('core-switch')
    expect(ds.devices[0].description).toContain('44')
    expect(ds.devices[1].kind).toBe('unknown')
    expect(ds.devices[1].name).toBe('remote-endpoint')
    expect(ds.edges).toHaveLength(1)
    expect(ds.edges[0].data?.verifiedLldp).toBe(true)
    expect(ds.edges[0].data?.corroboration).toBe('single-sided')
    expect(ds.edges[0].label).toBe('LLDP یک‌طرفه')
  })

  it('does not claim operator-reported LLDP edges are authenticated', () => {
    const reported = graphSchema.parse({
      ...graph,
      links: [{ ...graph.links[0], possibleCycle: false,
        evidenceSource: 'operator-reported-unverified' }],
    })
    expect(toTopologyDataset(reported).edges[0].data?.verifiedLldp).toBe(false)
  })

  it('rejects unsupported provenance and invalid evidence ids', () => {
    expect(graphSchema.safeParse({ ...graph, provenance: 'confirmed' }).success).toBe(false)
    expect(graphSchema.safeParse({ ...graph, links: [{ ...graph.links[0], evidenceIds: ['invalid'] }] }).success).toBe(false)
  })

  it('maps reciprocal, ambiguous, and contradictory LLDP into distinct visible evidence grades', () => {
    const baseLink = { ...graph.links[0], id: 'lldp:1',
      evidenceSource: 'snmpv3-authpriv', protocol: 'LLDP', possibleCycle: false }
    for (const [corroboration, label] of [
      ['reciprocal', 'LLDP دوطرفه'],
      ['unresolved', 'LLDP حل‌نشده'],
      ['ambiguous-port', 'LLDP چند همسایه'],
      ['single-sided', 'LLDP یک‌طرفه'],
    ] as const) {
      const parsed = graphSchema.parse({
        ...graph,
        links: [{ ...baseLink, corroboration }],
      })
      const edge = toTopologyDataset(parsed).edges[0]
      expect(edge.label).toBe(label)
      expect(edge.data?.corroboration).toBe(corroboration)
      expect(edge.data?.verifiedLldp).toBe(true)
    }
    expect(graphSchema.safeParse({
      ...graph, links: [{ ...baseLink, corroboration: 'cable-confirmed' }],
    }).success).toBe(false)
  })

  it('renders an authenticated Windows Agent as one identifiable computer with telemetry status', () => {
    const received = '2026-11-23T13:35:46Z'
    const mapped = toTopologyDataset(graphSchema.parse({
      ...graph,
      provenance: 'agent-self-reported-evidence',
      nodes: [{
        id: '192.168.88.47', depth: 0, address: '192.168.88.47',
        systemName: 'LAB-PC-01', deviceKind: 'workstation',
        identitySource: 'agent-self-reported-ip',
        agentId: '77777777-7777-4777-8777-777777777777',
        agentLastSeenAtUtc: received, agentVersion: '0.2-preview',
        agentStatus: 'recent', tcpPorts: [], learnedMacCount: 0,
      }],
      links: [],
    }))
    expect(mapped.origin).toBe('live')
    expect(mapped.devices).toHaveLength(1)
    expect(mapped.nodes).toHaveLength(1)
    expect(mapped.edges).toHaveLength(0)
    expect(mapped.devices[0]).toMatchObject({
      name: 'LAB-PC-01', kind: 'workstation', state: 'unknown',
      address: '192.168.88.47',
      agent: {
        id: '77777777-7777-4777-8777-777777777777',
        status: 'recent', lastSeenAtUtc: received,
      },
    })
    expect(mapped.devices[0].title).toContain('Agent')
    expect(mapped.devices[0].evidence).toContain('گواهی')
  })

  it('keeps stale and revoked Agent telemetry distinct from probed host availability', () => {
    for (const status of ['stale', 'revoked'] as const) {
      const mapped = toTopologyDataset(graphSchema.parse({
        ...graph, provenance: 'agent-self-reported-evidence',
        nodes: [{
          id: '10.20.30.5', depth: 0, address: '10.20.30.5',
          deviceKind: 'workstation', probeStatus: 'responsive',
          identitySource: 'agent-self-reported-ip',
          agentId: 'faccf1ce-c6ad-4246-a6b0-dd82ca3e7c03',
          agentLastSeenAtUtc: '2026-11-22T10:00:00Z',
          agentStatus: status,
        }], links: [],
      }))
      expect(mapped.devices[0].agent?.status).toBe(status)
      expect(mapped.devices[0].state).toBe('unknown')
    }
  })

  it('degrades unknown future device kinds safely instead of crashing the entire graph', () => {
    const result = graphSchema.parse({
      ...graph, nodes: [{
        id: '10.1.1.8', depth: 0, deviceKind: 'printer-from-new-driver',
        identitySource: 'unrecognized-later-protocol',
      }], links: [],
    })
    expect(toTopologyDataset(result).devices[0].kind).toBe('unknown')
    expect(toTopologyDataset(result).devices[0].agent).toBeUndefined()
  })
})