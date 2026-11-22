import { describe, expect, it } from 'vitest'
import { discoveryRows, discoveryTotals } from './discovery-rows'
import type { GraphResponse } from '../api/graph'

const graph: GraphResponse = {
  siteId: 'lan', generatedAtUtc: '2026-11-21T00:00:00Z',
  provenance: 'active-ipv4-and-reported-evidence', staleObservations: 0, truncated: false,
  nodes: [
    { id: 'subnet:example', depth: 0 },
    { id: 'unverified-manual', depth: 0, address: '192.168.88.9' },
    { id: 'host-10', depth: 0, address: '192.168.88.10', probeStatus: 'responsive', icmpResponded: true, tcpPorts: [443], lastSeenAtUtc: '2026-11-21T00:00:00Z' },
    { id: 'host-2', depth: 0, address: '192.168.88.2', probeStatus: 'unresponsive', icmpResponded: false },
    { id: 'switch-neighbor', depth: 0, address: null, identitySource: 'lldp-remote', deviceKind: 'switch' },
  ],
  logicalSegments: [{id:'subnet:example',cidr:'192.168.88.0/24',hostIds:['host-10']}],
  links: [],
}

describe('discovery table projection', () => {
  it('shows only observed nodes and does not report logical groups or manual-only nodes as discovered', () => {
    const rows = discoveryRows(graph)
    expect(rows.map(row => row.id)).toEqual(['switch-neighbor', 'host-2', 'host-10'])
    expect(rows.find(row => row.id === 'host-2')?.probeStatus).toBe('unresponsive')
    expect(rows.find(row => row.id === 'switch-neighbor')?.probeStatus).toBe('not-monitored')
    expect(rows.find(row => row.id === 'host-10')?.ports).toEqual([443])
  })
  it('counts response evidence without asserting physical connectivity or genuine host health', () => {
    expect(discoveryTotals(discoveryRows(graph))).toEqual({
      total: 3, responsive: 1, suspect: 0, unresponsive: 1, stale: 0, identified: 0,
    })
  })
})

