import { describe, expect, it } from 'vitest'
import { countStates } from './topology'
import { createSyntheticTopology } from './topology-demo'

describe('Evidence boundary of the visual topology', () => {
  it('exposes a clearly synthetic dataset with unique devices and linked node IDs', () => {
    const topology = createSyntheticTopology()
    expect(topology.origin).toBe('synthetic')
    expect(topology.observedAt).toBeNull()
    const ids = new Set(topology.devices.map((device) => device.id))
    expect(ids.size).toBe(topology.devices.length)
    expect(topology.nodes).toHaveLength(topology.devices.length)
    expect(topology.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true)
  })

  it('keeps unknown devices out of the healthy count', () => {
    const items = createSyntheticTopology().devices
    expect(countStates(items)).toMatchObject({ total: items.length, unknown: 4, critical: 1, warning: 1 })
  })
})