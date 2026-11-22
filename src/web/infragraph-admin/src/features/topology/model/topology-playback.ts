import type { TopologyDataset } from './topology'

export type ProbePhase = 'request' | 'reply' | 'timeout'
export type ProbeStep = {
  id: string
  edgeId: string
  sourceId: string
  targetId: string
  reverse: boolean
  phase: ProbePhase
  hop: number
}

export type LogicalRoute = {
  nodes: string[]
  edges: string[]
  blockedAt: string | null
}

/** An undirected logical adjacency for VIEW-ONLY analysis; never packet routing truth. */
function adjacency(dataset: TopologyDataset) {
  const known = new Set(dataset.devices.map((device) => device.id))
  const byNode = new Map<string, Array<{ neighbour: string; edgeId: string; reverse: boolean }>>()
  for (const id of known) byNode.set(id, [])
  for (const edge of dataset.edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue
    byNode.get(edge.source)!.push({ neighbour: edge.target, edgeId: edge.id, reverse: false })
    byNode.get(edge.target)!.push({ neighbour: edge.source, edgeId: edge.id, reverse: true })
  }
  return byNode
}

/** BFS shortest logical adjacency; mark critical/unknown hops, do not claim reachability. */
export function logicalRoute(dataset: TopologyDataset, from: string, to: string): LogicalRoute | null {
  const adj = adjacency(dataset)
  if (!adj.has(from) || !adj.has(to)) return null
  const queue = [from]
  const previous = new Map<string, { parent: string; edge: string }>()
  const seen = new Set([from])
  for (let i = 0; i < queue.length && !seen.has(to); i++) {
    for (const next of adj.get(queue[i]) ?? []) {
      if (seen.has(next.neighbour)) continue
      seen.add(next.neighbour)
      previous.set(next.neighbour, { parent: queue[i], edge: next.edgeId })
      queue.push(next.neighbour)
    }
  }
  if (!seen.has(to)) return null
  const nodes = [to]
  const edges: string[] = []
  while (nodes[0] !== from) {
    const item = previous.get(nodes[0])
    if (!item) return null
    edges.unshift(item.edge)
    nodes.unshift(item.parent)
  }
  const blockedAt = nodes.find((id) => ['critical', 'unknown'].includes(dataset.devices.find((device) => device.id === id)?.state ?? '')) ?? null
  return { nodes, edges, blockedAt }
}

/**
 * Synthetic discovery replay only. Traverses known logical adjacency and chooses
 * simulated replies from fixture states. DOES NOT emit probes or represent network packets.
 * Critical/unknown nodes stop traversal; their descendants are never assumed reachable.
 */
export function syntheticDiscoverySteps(dataset: TopologyDataset, origin: string): ProbeStep[] {
  if (dataset.origin !== 'synthetic') return []
  const adj = adjacency(dataset)
  if (!adj.has(origin)) return []
  const devices = new Map(dataset.devices.map((device) => [device.id, device]))
  const visited = new Set([origin])
  const queue: Array<{ id: string; hop: number }> = [{ id: origin, hop: 0 }]
  const steps: ProbeStep[] = []
  for (let i = 0; i < queue.length; i++) {
    const { id, hop } = queue[i]
    for (const neighbour of adj.get(id) ?? []) {
      if (visited.has(neighbour.neighbour)) continue
      visited.add(neighbour.neighbour)
      const identity = `${id}--${neighbour.neighbour}`
      const nextHop = hop + 1
      steps.push({
        id: `${identity}:request`, edgeId: neighbour.edgeId, sourceId: id,
        targetId: neighbour.neighbour, reverse: neighbour.reverse, phase: 'request', hop: nextHop,
      })
      const target = devices.get(neighbour.neighbour)
      const timeout = target?.state === 'critical' || target?.state === 'unknown'
      steps.push({
        id: `${identity}:${timeout ? 'timeout' : 'reply'}`, edgeId: neighbour.edgeId,
        sourceId: neighbour.neighbour, targetId: id, reverse: !neighbour.reverse,
        phase: timeout ? 'timeout' : 'reply', hop: nextHop,
      })
      if (!timeout) queue.push({ id: neighbour.neighbour, hop: nextHop })
    }
  }
  return steps
}

export function probeStatistics(steps: ProbeStep[], index: number) {
  const elapsed = steps.slice(0, Math.max(0, index + 1))
  return {
    requests: elapsed.filter((step) => step.phase === 'request').length,
    replies: elapsed.filter((step) => step.phase === 'reply').length,
    timeouts: elapsed.filter((step) => step.phase === 'timeout').length,
  }
}
