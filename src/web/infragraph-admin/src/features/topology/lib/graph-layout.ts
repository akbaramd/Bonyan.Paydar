import dagre from '@dagrejs/dagre'
import { Position, type Edge, type Node } from '@xyflow/react'

export type LayoutDirection = 'LR' | 'TB'
const WIDTH = 164
const HEIGHT = 152
const GRID_X = 184
const GRID_Y = 172

function asPositioned(nodes: Node[], positions: Map<string, { x: number; y: number }>, direction: LayoutDirection): Node[] {
  return nodes.map(node => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
    sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
    targetPosition: direction === 'LR' ? Position.Left : Position.Top,
    data: { ...node.data, orientation: direction },
  }))
}

/**
 * A CIDR membership is not a switch-port edge. For large IP inventories, rank
 * layout would stack every host into one extremely tall fan-out. Instead, place
 * each logical subnet's discovered hosts in a balanced grid, keeping grouping
 * semantics without inventing physical connections.
 */
function layoutMembershipGrid(nodes: Node[], edges: Edge[]): Node[] {
  const memberEdges = edges.filter(edge => edge.data?.logicalMembership)
  const children = new Map<string, Set<string>>()
  for (const edge of memberEdges) {
    if (!children.has(edge.source)) children.set(edge.source, new Set())
    children.get(edge.source)!.add(edge.target)
  }

  const byId = new Map(nodes.map(node => [node.id, node]))
  const sections = [...children.entries()]
    .filter(([id]) => byId.has(id))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, hostIds]) => ({
      heading: id,
      members: [...hostIds].filter(hostId => byId.has(hostId)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }))
  const assigned = new Set(sections.flatMap(section => [section.heading, ...section.members]))
  const loose = nodes.filter(node => !assigned.has(node.id)).map(node => node.id).sort()
  if (loose.length) sections.push({ heading: '', members: loose })

  const sectionsPerRow = sections.length > 1 ? 2 : 1
  const biggestSection = Math.max(1, ...sections.map(s => s.members.length))
  const columnsPerSection = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(biggestSection * 1.15))))
  const sectionWidth = columnsPerSection * GRID_X + 55
  const positions = new Map<string, { x: number; y: number }>()

  let top = 28
  for (let index = 0; index < sections.length; index += sectionsPerRow) {
    const row = sections.slice(index, index + sectionsPerRow)
    let maxRowCount = 0
    row.forEach((section, localIndex) => {
      const left = 28 + localIndex * sectionWidth
      if (section.heading) positions.set(section.heading, { x: left, y: top })
      const margin = section.heading ? 155 : 0
      section.members.forEach((id, number) =>
        positions.set(id, { x: left + number % columnsPerSection * GRID_X,
          y: top + margin + Math.floor(number / columnsPerSection) * GRID_Y }))
      maxRowCount = Math.max(maxRowCount, Math.ceil(section.members.length / columnsPerSection) + (section.heading ? 1 : 0))
    })
    top += maxRowCount * GRID_Y + 54
  }
  return asPositioned(nodes, positions, 'LR')
}

function layoutDisconnectedGrid(nodes: Node[]): Node[] {
  const columns = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(nodes.length * 1.4))))
  const positions = new Map<string, { x: number; y: number }>()
  nodes.slice().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .forEach((node, i) => positions.set(node.id, {
      x: 28 + (i % columns) * GRID_X,
      y: 28 + Math.floor(i / columns) * GRID_Y,
    }))
  return asPositioned(nodes, positions, 'LR')
}

/** Deterministic diagram layout, never a claim about geolocation or cable coordinates. */
export function layoutGraph(nodes: Node[], edges: Edge[], direction: LayoutDirection): Node[] {
  if (nodes.length === 0) return []
  const membershipEdges = edges.filter(edge => edge.data?.logicalMembership)
  const actualEdges = edges.filter(edge => !edge.data?.logicalMembership)
  if (direction === 'LR' && membershipEdges.length >= 9 && actualEdges.length === 0) {
    return layoutMembershipGrid(nodes, edges)
  }
  if (direction === 'LR' && edges.length === 0 && nodes.length > 8) {
    return layoutDisconnectedGrid(nodes)
  }

  const graph = new dagre.graphlib.Graph()
  const nodeWidth = direction === 'TB' ? 120 : WIDTH
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: direction, align: 'UL', ranksep: direction === 'LR' ? 48 : 52,
    nodesep: direction === 'LR' ? 26 : 20, marginx: 28, marginy: 28,
  })
  for (const node of nodes) graph.setNode(node.id, { width: nodeWidth, height: HEIGHT })
  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target)
  }
  dagre.layout(graph)
  const positions = new Map(nodes.map(node => {
    const center = graph.node(node.id)
    return [node.id, { x: center.x - nodeWidth / 2, y: center.y - HEIGHT / 2 }] as const
  }))
  return asPositioned(nodes, positions, direction)
}
