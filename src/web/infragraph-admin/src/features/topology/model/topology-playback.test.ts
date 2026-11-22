import { describe, expect, it } from 'vitest'
import { logicalRoute, probeStatistics, syntheticDiscoverySteps } from './topology-playback'
import type { TopologyDataset } from './topology'

const devices = [
  { id: 'server', state: 'healthy' }, { id: 'core', state: 'healthy' },
  { id: 'broken', state: 'critical' }, { id: 'client', state: 'unknown' },
  { id: 'ok', state: 'healthy' },
].map((device) => ({ ...device, name: device.id, title: '', kind: 'switch' as const, address: '', site: '', vendor: '', port: '', description: '', evidence: '' }))
const edges = [
  { id: 'e1', source: 'core', target: 'server' },
  { id: 'e2', source: 'core', target: 'broken' },
  { id: 'e3', source: 'broken', target: 'client' },
  { id: 'e4', source: 'core', target: 'ok' },
]
const synthetic: TopologyDataset = {
  origin: 'synthetic', observedAt: null, devices: devices as TopologyDataset['devices'],
  nodes: [], edges,
}

describe('logical-route operator analysis', () => {
  it('finds the minimum number of logical links and flags blocked observations', () => {
    expect(logicalRoute(synthetic, 'server', 'client')).toEqual({
      nodes: ['server', 'core', 'broken', 'client'], edges: ['e1', 'e2', 'e3'], blockedAt: 'broken',
    })
    expect(logicalRoute(synthetic, 'ok', 'server')?.edges).toEqual(['e4', 'e1'])
    expect(logicalRoute(synthetic, 'missing', 'server')).toBeNull()
  })
  it('does not loop forever on cyclic links', () => {
    const loop = { ...synthetic, edges: [...edges, { id: 'cycle', source: 'ok', target: 'server' }] }
    expect(logicalRoute(loop, 'server', 'ok')?.edges).toEqual(['cycle'])
  })
})

describe('synthetic probe timeline', () => {
  it('shows a reverse-direction request and reply and a failed branch without probing descendants', () => {
    const steps = syntheticDiscoverySteps(synthetic, 'server')
    expect(steps[0]).toMatchObject({ edgeId: 'e1', phase: 'request', reverse: true, sourceId: 'server' })
    expect(steps[1]).toMatchObject({ edgeId: 'e1', phase: 'reply', reverse: false, sourceId: 'core' })
    expect(steps.some((step) => step.targetId === 'client' || step.sourceId === 'client')).toBe(false)
    expect(steps.find((step) => step.edgeId === 'e2' && step.phase === 'timeout')).toBeDefined()
    expect(probeStatistics(steps, steps.length - 1)).toEqual({ requests: 3, replies: 2, timeouts: 1 })
  })
  it('never replays real/live datasets', () => {
    expect(syntheticDiscoverySteps({ ...synthetic, origin: 'live' }, 'server')).toEqual([])
  })
})
