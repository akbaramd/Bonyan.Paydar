import { useCallback, useEffect, useMemo, useRef } from 'react'
import '@xyflow/react/dist/style.css'
import {
  Background, BackgroundVariant, MiniMap, Panel, ReactFlow, ReactFlowProvider,
  useReactFlow, useNodesInitialized, useViewport, type Edge, type Node,
  type NodeTypes, type EdgeTypes,
} from '@xyflow/react'
import { Focus, Minus, Plus } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { useSettings } from '../../../shared/preferences/settings-context'
import { themes } from '../../../shared/styles/tokens.generated'
import type { Device, DeviceState, TopologyDataset } from '../model/topology'
import type { LogicalRoute, ProbeStep } from '../model/topology-playback'
import { BlueprintNode } from './BlueprintNode'
import { DeviceNode } from './DeviceNode'
import { SignalEdge } from './SignalEdge'
import { layoutGraph, type LayoutDirection } from '../lib/graph-layout'
import { countUnobservedEndpoints } from '../lib/topology-impact'
import { sharedParentHypothesis, leadingHypothesis } from '../model/impact-hypothesis'

const nodeTypes: NodeTypes = { device: DeviceNode, blueprint: BlueprintNode }
const edgeTypes: EdgeTypes = { signal: SignalEdge }

type Props = {
  dataset: TopologyDataset
  layoutMode: LayoutDirection
  selectedId: string | null
  onSelect: (id: string | null) => void
  onNodeContext: (id: string, x: number, y: number) => void
  search: string
  site: string
  statusFilter: 'all' | 'critical' | 'warning' | 'unknown'
  blueprintUrl: string | null
  route: LogicalRoute | null
  activeProbe: ProbeStep | null
  probeRunning: boolean
  probeSpeed: number
  motionEnabled: boolean
  showGrid: boolean
  showMinimap: boolean
  showLabels: boolean
  fitRequest: number
  focusRequest: number
  focusNodeId: string | null
}

function CanvasInner({
  dataset, layoutMode, selectedId, onSelect, onNodeContext, search, site, statusFilter,
  blueprintUrl, route, activeProbe, probeRunning, probeSpeed,
  motionEnabled, showGrid, showMinimap, showLabels, fitRequest,
  focusRequest, focusNodeId,
}: Props) {
  const flow = useReactFlow()
  const { zoom } = useViewport()
  const { theme } = useSettings()
  const nodesReady = useNodesInitialized()
  const lastSearch = useRef('')
  const lastFittedSignature = useRef('')
  const lastLayout = useRef(layoutMode)
  const layoutedNodes = useMemo(() => layoutGraph(dataset.nodes, dataset.edges, layoutMode), [dataset.nodes, dataset.edges, layoutMode])

  const fitModel = useCallback((animate: boolean, overview = true) => {
    if (layoutedNodes.length === 0) return
    const rect = document.querySelector('.ig-network-flow')?.getBoundingClientRect()
    if (!rect || rect.width < 100 || rect.height < 100) return
    const xs = layoutedNodes.map(node => node.position.x)
    const ys = layoutedNodes.map(node => node.position.y)
    const worldLeft = Math.min(...xs)
    const worldTop = Math.min(...ys)
    const worldWidth = Math.max(...xs) + (layoutMode === 'TB' ? 124 : 168) - worldLeft
    const worldHeight = Math.max(...ys) + 158 - worldTop
    // Dock tools do not overlay the graph: reserve only the viewport padding.
    const left = 22
    const right = 22
    const top = 22
    const bottom = 35
    const availableWidth = Math.max(140, rect.width - left - right)
    const availableHeight = Math.max(150, rect.height - top - bottom)
    const allNodesZoom = Math.max(0.08, Math.min(1.04, availableWidth / worldWidth, availableHeight / worldHeight))
    // A 100+ host inventory cannot be read at the global fit zoom. Initially
    // show a readable top-left region; the operator can choose Fit All anytime.
    const readableInventory = !overview && layoutedNodes.length > 50 && dataset.edges.every(edge => edge.data?.logicalMembership)
    const nextZoom = readableInventory ? Math.max(allNodesZoom, 0.68) : allNodesZoom
    const x = readableInventory
      ? left + 24 - worldLeft * nextZoom
      : left + (availableWidth - worldWidth * nextZoom) / 2 - worldLeft * nextZoom
    const y = readableInventory
      ? top + 20 - worldTop * nextZoom
      : top + (availableHeight - worldHeight * nextZoom) / 2 - worldTop * nextZoom
    void flow.setViewport({ x, y, zoom: nextZoom }, { duration: animate ? 300 : 0 })
  }, [layoutedNodes, layoutMode, flow, dataset.edges])

  const graphSignature = useMemo(() => layoutedNodes.map(node => node.id).join('|'), [layoutedNodes])
  useEffect(() => {
    if (!layoutedNodes.length || lastFittedSignature.current === graphSignature) return
    const timer = window.setTimeout(() => {
      fitModel(false, false)
      lastFittedSignature.current = graphSignature
    }, 260)
    return () => window.clearTimeout(timer)
  }, [graphSignature, layoutedNodes.length, fitModel])

  useEffect(() => {
    if (!nodesReady || lastLayout.current === layoutMode || !layoutedNodes.length) return
    lastLayout.current = layoutMode
    fitModel(true)
  }, [layoutMode, nodesReady, layoutedNodes.length, fitModel])

  useEffect(() => {
    if (fitRequest > 0) fitModel(true)
  }, [fitRequest, fitModel])

  useEffect(() => {
    if (!focusNodeId || focusRequest === 0) return
    const item = layoutedNodes.find((node) => node.id === focusNodeId)
    if (item) void flow.setCenter(item.position.x + (layoutMode === 'TB' ? 60 : 82), item.position.y + 51, { zoom: 1.03, duration: 300 })
  }, [focusRequest, focusNodeId, layoutedNodes, flow, layoutMode])

  const hypothesis = useMemo(() => leadingHypothesis(dataset), [dataset])
  const possibleChildren = useMemo(() => new Set(hypothesis?.unknownIds ?? []), [hypothesis])
  const routeNodes = useMemo(() => new Set(route?.nodes ?? []), [route])
  const routeEdges = useMemo(() => new Set(route?.edges ?? []), [route])

  const nodes = useMemo<Node[]>(() => {
    const term = search.trim().toLocaleLowerCase()
    const found: Node[] = layoutedNodes.map((node) => {
      const device = node.data.device as Device
      const wrongSite = site !== 'all' && !device.site.includes(site)
      const wrongStatus = statusFilter !== 'all' && device.state !== statusFilter
      const wrongTerm = Boolean(term) && ![device.name, device.title, device.address].some((v) => v.toLocaleLowerCase().includes(term))
      return {
        ...node,
        selected: node.id === selectedId,
        data: {
          ...node.data,
          affected: device.kind === 'switch' && device.state === 'critical' ? countUnobservedEndpoints(dataset, node.id) : 0,
          dimmed: wrongSite || wrongStatus || wrongTerm || (routeNodes.size > 0 && !routeNodes.has(node.id)),
          inRoute: routeNodes.has(node.id),
          possibleDependents: sharedParentHypothesis(dataset, node.id)?.count ?? 0,
          possibleChild: possibleChildren.has(node.id),
          probePhase: activeProbe && (activeProbe.targetId === node.id || activeProbe.sourceId === node.id) ? activeProbe.phase : null,
        },
      }
    })
    if (blueprintUrl) found.unshift({
      id: '__blueprint__', position: { x: -135, y: 115 },
      type: 'blueprint', draggable: false, selectable: false, focusable: false,
      width: 1280, height: 870, data: { url: blueprintUrl },
    })
    return found
  }, [layoutedNodes, selectedId, search, site, statusFilter, routeNodes, activeProbe, blueprintUrl, dataset, possibleChildren])

  const edges = useMemo<Edge[]>(() => {
    // Hide overlapping CIDR membership spokes; grouping is not a physical link claim.
    const memberships = dataset.edges.filter(edge => edge.data?.logicalMembership).length
    const hideMembership = memberships >= 9 && memberships === dataset.edges.length
    return dataset.edges.filter(edge => !hideMembership || !edge.data?.logicalMembership).map((edge) => {
    const focus = activeProbe?.edgeId === edge.id ? activeProbe : null
    return {
      ...edge,
      type: 'signal',
      animated: false,
      data: {
        ...edge.data,
        phase: focus?.phase ?? null,
        stepId: focus?.id,
        reverse: focus?.reverse,
        speed: probeSpeed,
        running: probeRunning,
        motion: motionEnabled,
        showLabel: showLabels,
        unknown: dataset.devices.some(d => d.id === edge.target && d.state === 'unknown'),
        route: routeEdges.has(edge.id),
        suspected: possibleChildren.has(edge.target) && edge.source === hypothesis?.parentId,
        dimmed: (routeEdges.size > 0 && !routeEdges.has(edge.id)) || site !== 'all',
      },
    }
  })
  }, [dataset.edges, activeProbe, probeSpeed, probeRunning, motionEnabled, showLabels, routeEdges, site, possibleChildren, hypothesis, dataset.devices])

  useEffect(() => {
    if (!search.trim() || search === lastSearch.current) return
    lastSearch.current = search
    const found = layoutedNodes.find((node) =>
      (node.data.device as Device).name.toLocaleLowerCase() === search.trim().toLocaleLowerCase())
    if (found) {
      void flow.setCenter(found.position.x + (layoutMode === 'TB' ? 60 : 82), found.position.y + 51, { zoom: 1.08, duration: 360 })
      onSelect(found.id)
    }
  }, [layoutedNodes, search, flow, onSelect, layoutMode])

  return (
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodeClick={(_event, node) => { if (node.id !== '__blueprint__') onSelect(node.id) }}
      onNodeContextMenu={(event, node) => {
        event.preventDefault()
        if (node.id !== '__blueprint__')
          onNodeContext(node.id, event.clientX, event.clientY)
      }}
      onPaneClick={() => onSelect(null)}
      onEdgeClick={(_event, edge) => onSelect(edge.target)}
      minZoom={0.08} maxZoom={2.3}
      nodesDraggable={false} nodesConnectable={false}
      edgesReconnectable={false} elementsSelectable
      panOnDrag zoomOnScroll zoomOnPinch
      zoomOnDoubleClick={false} preventScrolling
      proOptions={{ hideAttribution: false }}
      className="ig-network-flow"
      aria-label="نقشه تعاملی توپولوژی شبکه"
    >
      {showGrid && <Background variant={BackgroundVariant.Dots} gap={24} size={1} />}
      {showMinimap && <MiniMap
        pannable zoomable
        position="bottom-right"
        nodeColor={(node) => {
          const device = node.data?.device as Device | undefined
          const palette = themes[theme]
          const colors: Record<DeviceState, string> = {
            healthy: palette.success, warning: palette.warning,
            critical: palette.danger, unknown: palette.unknown,
          }
          return device ? colors[device.state] : palette.borderStrong
        }}
        maskColor="rgba(10,17,27,0.55)"
        className="ig-flow-minimap"
        ariaLabel="نمای کوچک نقشه شبکه"
      />}
      <Panel position="bottom-left" className="ig-canvas-quicktools">
        <Button size="icon" variant="secondary" onClick={() => void flow.zoomIn({ duration: 240 })} title="بزرگ‌نمایی" aria-label="بزرگ‌نمایی"><Plus size={16}/></Button>
        <Button size="icon" variant="secondary" onClick={() => void flow.zoomOut({ duration: 240 })} title="کوچک‌نمایی" aria-label="کوچک‌نمایی"><Minus size={16}/></Button>
        <Button size="icon" variant="secondary" onClick={() => fitModel(true)} title="نمایش کامل نقشه" aria-label="نمایش کامل نقشه"><Focus size={16}/></Button>
        <span className="ig-zoom-level numeric" aria-label="درصد بزرگ‌نمایی">{Math.round(zoom * 100)}%</span>
      </Panel>
    </ReactFlow>
  )
}

export function TopologyCanvas(props: Props) {
  return <ReactFlowProvider><CanvasInner {...props} /></ReactFlowProvider>
}