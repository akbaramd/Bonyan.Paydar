import type { TopologyDataset } from './topology'

/**
 * Evidence-limited shared-parent hypothesis. Unknown descendants are NOT
 * confirmed down; an observed unavailable parent can explain loss of visibility.
 * Directed logical edges are *not* packet-path evidence.
 */
export function sharedParentHypothesis(dataset: TopologyDataset, parentId: string) {
  const parent = dataset.devices.find(d => d.id === parentId)
  if (!parent || parent.state !== 'critical') return null
  const byId = new Map(dataset.devices.map(d => [d.id, d]))
  const bySource = new Map<string, string[]>()
  for (const edge of dataset.edges) {
    bySource.set(edge.source, [...(bySource.get(edge.source) ?? []), edge.target])
  }
  const checked = new Set<string>([parentId])
  const queue = [parentId]
  const unknownIds: string[] = []
  for (let i = 0; i < queue.length && checked.size <= dataset.devices.length; i++) {
    for (const target of bySource.get(queue[i]) ?? []) {
      if (checked.has(target) || !byId.has(target)) continue
      checked.add(target)
      const device = byId.get(target)!
      if (device.state === 'unknown') unknownIds.push(target)
      queue.push(target)
    }
  }
  return unknownIds.length ? { parentId, unknownIds, count: unknownIds.length, confidence: 'hypothesis' as const } : null
}

export function leadingHypothesis(dataset: TopologyDataset) {
  const possible = dataset.devices
    .filter(device => device.state === 'critical' && device.kind === 'switch')
    .map(device => sharedParentHypothesis(dataset, device.id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.count - a.count)
  return possible[0] ?? null
}
