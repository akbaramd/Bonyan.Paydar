import type { TopologyDataset } from '../model/topology'

/** A graph correlation, never a confirmed diagnosis or measured forwarding path. */
export function countUnobservedEndpoints(dataset: TopologyDataset, sourceId: string): number {
  const devices = new Map(dataset.devices.map(d => [d.id, d]))
  const adjacent = new Map<string, string[]>()
  for (const edge of dataset.edges) adjacent.set(edge.source, [...(adjacent.get(edge.source) ?? []), edge.target])
  const visited = new Set<string>([sourceId])
  const pending = [...(adjacent.get(sourceId) ?? [])]
  let count = 0
  while (pending.length) {
    const id = pending.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    const d = devices.get(id)
    if (d?.kind === 'workstation' && (d.state === 'critical' || d.state === 'unknown')) count++
    pending.push(...(adjacent.get(id) ?? []))
  }
  return count
}
