import { describe, expect, it } from 'vitest'
import { createSyntheticTopology } from '../model/topology-demo'
import { countUnobservedEndpoints } from './topology-impact'
describe('incident branch correlation', () => {
  it('reports unobserved downstream workstations, not confirmed root cause', () => {
    const graph = createSyntheticTopology()
    expect(countUnobservedEndpoints(graph, 'access-a')).toBe(4)
    expect(countUnobservedEndpoints(graph, 'access-b')).toBe(0)
    expect(countUnobservedEndpoints(graph, 'dist-a')).toBe(4)
  })
  it('deduplicates cyclic edges', () => {
    const graph = createSyntheticTopology()
    graph.edges.push({id:'cycle',source:'client-4',target:'access-a'})
    expect(countUnobservedEndpoints(graph,'access-a')).toBe(4)
  })
})
