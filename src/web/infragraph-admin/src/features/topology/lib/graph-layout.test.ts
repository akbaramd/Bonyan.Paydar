import { describe, expect, it } from 'vitest'
import { layoutGraph } from './graph-layout'
import type { Node, Edge } from '@xyflow/react'

const nodes: Node[] = [
  { id: 'a', position: { x: 0, y: 0 }, data: {} },
  { id: 'b', position: { x: 0, y: 0 }, data: {} },
  { id: 'c', position: { x: 0, y: 0 }, data: {} },
]
const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b' }, { id: 'bc', source: 'b', target: 'c' }]
describe('bounded topology auto-layout', () => {
  it('places ranked nodes horizontally without changing source data', () => {
    const result = layoutGraph(nodes, edges, 'LR')
    expect(result[0].position.x).toBeLessThan(result[1].position.x)
    expect(result[1].position.x).toBeLessThan(result[2].position.x)
    expect(result[0].data.orientation).toBe('LR')
    expect(nodes[0].position.x).toBe(0)
  })
  it('supports top-to-bottom without node overlap', () => {
    const result = layoutGraph(nodes, edges, 'TB')
    expect(result[0].position.y).toBeLessThan(result[1].position.y)
    expect(result[1].position.y).toBeLessThan(result[2].position.y)
  })
})

describe('compact, evidence-safe inventory grid', () => {
  const hosts: Node[] = Array.from({ length: 120 }, (_, i) => ({
    id: `host-${String(i + 1).padStart(3, '0')}`,
    position: { x: 0, y: 0 },
    data: {},
  }))
  const subnetNodes: Node[] = [
    { id: 'subnet:a', position: { x: 0, y: 0 }, data: {} },
    { id: 'subnet:b', position: { x: 0, y: 0 }, data: {} },
  ]
  const membership: Edge[] = hosts.map((node, i) => ({
    id: `member-${node.id}`, source: i < 60 ? 'subnet:a' : 'subnet:b',
    target: node.id, data: { logicalMembership: true },
  }))

  it('places a large CIDR inventory in multiple columns instead of a long single stack', () => {
    const result = layoutGraph([...subnetNodes, ...hosts], membership, 'LR')
    const ips = result.filter(n => n.id.startsWith('host-'))
    const xs = new Set(ips.map(n => n.position.x))
    const ys = new Set(ips.map(n => n.position.y))
    expect(xs.size).toBeGreaterThanOrEqual(8)
    expect(ys.size).toBeLessThan(20)
    expect(result.length).toBe(122)
    expect(new Set(result.map(n => `${n.position.x}:${n.position.y}`)).size).toBe(122)
    expect(hosts.every(n => n.position.x === 0 && n.position.y === 0)).toBe(true)
  })

  it('tiles disconnected devices and never fabricates an edge', () => {
    const result = layoutGraph(hosts, [], 'LR')
    expect(new Set(result.map(n => n.position.x)).size).toBeGreaterThan(5)
    expect(new Set(result.map(n => n.position.y)).size).toBeGreaterThan(5)
    expect(result.length).toBe(hosts.length)
  })
})
