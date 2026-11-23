import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSession, useSignOut } from '../../../shared/auth/session'
import { getGraph, toTopologyDataset, type GraphResponse } from '../api/graph'
import { ObservationForm } from '../components/ObservationForm'
import { EvidenceManager } from '../components/EvidenceManager'
import { ActiveScanPanel } from '../components/ActiveScanPanel'
import { Dialog, Select } from 'radix-ui'
import {
  ArrowRight, ChevronDown, Columns3, Download, FileUp, Focus, GitBranch, Info, Layers3,
  ListTree, Maximize2, Minimize2, Network, Route, Rows3, ScanSearch, Search,
  ShieldAlert, SlidersHorizontal, Trash2, X, CircleHelp,
} from 'lucide-react'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import type { TopologyDataset } from '../model/topology'
import { countStates } from '../model/topology'
import { logicalRoute, syntheticDiscoverySteps } from '../model/topology-playback'
import { TopologyCanvas } from '../components/TopologyCanvas'
import { NodeActionMenu, type NodeMenuTarget, type DiagnosticKind } from '../components/NodeActionMenu'
import { NodeDiagnosticsPanel } from '../components/NodeDiagnosticsPanel'
import { SiteScopeSelector } from '../components/SiteScopeSelector'
import { useSiteScope } from '../components/useSiteScope'
import { StudioActionMenu, type StudioAction } from '../components/StudioActionMenu'
import { NodeInspector, type InspectedLink } from '../components/NodeInspector'
import { AssetExplorer, PlaybackDock, StudioHelp } from '../components/TopologyStudioTools'
import { DockPane, TopologyDockLayout, type DockTab } from '../components/TopologyDockLayout'
import { SwitchField } from '../../../shared/ui/SwitchField'
import { readLocalSvg } from '../lib/svg-source'
import { leadingHypothesis, sharedParentHypothesis } from '../model/impact-hypothesis'
import { isPrivateIpv4 } from '../model/network-address'
import type { LayoutDirection } from '../lib/graph-layout'

const EMPTY: TopologyDataset = { origin: 'live', devices: [], nodes: [], edges: [], observedAt: null }
const sites = ['all', 'ساختمان A', 'ساختمان B', 'اتاق سرور'] as const
type StatusFilter = 'all' | 'critical' | 'warning' | 'unknown'
const LEFT_TABS: DockTab[] = [{id:'devices',label:'تجهیزات'},{id:'scan',label:'اسکن'},{id:'filter',label:'فیلترها'}]
const RIGHT_TABS: DockTab[] = [{id:'details',label:'مشخصات'},{id:'diagnostics',label:'عیب‌یابی'},{id:'evidence',label:'شواهد'},{id:'report',label:'ثبت لینک'},{id:'layers',label:'لایه‌ها'}]
const BOTTOM_TABS: DockTab[] = [{id:'activity',label:'وضعیت و شواهد'},{id:'path',label:'تحلیل مسیر'},{id:'replay',label:'Replay'}]

function useTablet(onCompact: () => void) {
  const [tablet, setTablet] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 980px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 980px)')
    const update = () => { setTablet(mq.matches); if (mq.matches) onCompact() }
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [onCompact])
  return tablet
}

function SiteSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Select.Root value={value} onValueChange={onChange} dir="rtl">
    <Select.Trigger className="ig-control-select" aria-label="فیلتر سایت">
      <SlidersHorizontal size={16} aria-hidden="true" />
      <Select.Value placeholder="همه سایت‌ها" />
      <Select.Icon><ChevronDown size={14}/></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="ig-control-select-menu" position="popper" sideOffset={6}>
        <Select.Viewport>
          {sites.map((item) => <Select.Item className="ig-control-option" key={item} value={item}>
            <Select.ItemText>{item === 'all' ? 'همه سایت‌ها' : item}</Select.ItemText>
            <Select.ItemIndicator className="select-check">✓</Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
}

/** A dedicated read-only operations studio. No real discovery is performed in the browser. */
export default function TopologyPage() {
  const [localDataset, setLocalDataset] = useState<TopologyDataset>(EMPTY)
  const [searchParams] = useSearchParams()
  const allowExplicitDemo = import.meta.env.DEV && searchParams.get('sample') === '1'
  const session = useSession()
  const signOut = useSignOut()
  const scope = useSiteScope()
  const apiSite = scope.siteId
  const [walkPreview, setWalkPreview] = useState<{ siteId: string; graph: GraphResponse } | null>(null)
  const [nodeMenu, setNodeMenu] = useState<NodeMenuTarget | null>(null)
  const [diagnosticIntent, setDiagnosticIntent] = useState<DiagnosticKind | null>(null)
  const graph = useQuery({ queryKey: ['topology', 'reported', apiSite], queryFn: ({ signal }) => getGraph(apiSite, signal), enabled: Boolean(session.data && apiSite), retry: false, refetchInterval: 30_000 })
  const previewGraph = walkPreview?.siteId === apiSite ? walkPreview.graph : null
  const displayedGraph = previewGraph ?? graph.data
  const dataset = useMemo(() => displayedGraph ? toTopologyDataset(displayedGraph) : localDataset,
    [displayedGraph, localDataset])
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('focus'))
  const [layoutMode, setLayoutMode] = useState<LayoutDirection>('LR')
  const [search, setSearch] = useState('')
  const [site, setSite] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<'logical' | 'floor'>('logical')
  const [blueprintUrl, setBlueprintUrl] = useState<string | null>(null)
  const [blueprintName, setBlueprintName] = useState('')
  const [svgError, setSvgError] = useState('')
  const [fullScreen, setFullScreen] = useState(false)
  const [theater, setTheater] = useState(false)
  const [fullScreenError, setFullScreenError] = useState('')
  const [leftOpen, setLeftOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 980px)').matches)
  const [rightOpen, setRightOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 980px)').matches)
  const [bottomOpen, setBottomOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 980px)').matches)
  const [leftTab, setLeftTab] = useState('devices')
  const [rightTab, setRightTab] = useState('details')
  const [bottomTab, setBottomTab] = useState('activity')
  const [help, setHelp] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [motion, setMotion] = useState(true)
  const [motionRestricted, setMotionRestricted] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [fitRequest, setFitRequest] = useState(0)
  const [focusRequest, setFocusRequest] = useState(() => new URLSearchParams(window.location.search).has('focus') ? 1 : 0)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('focus'))
  const [routeFrom, setRouteFrom] = useState('collector')
  const [routeTo, setRouteTo] = useState('access-a')
  const [route, setRoute] = useState<ReturnType<typeof logicalRoute>>(null)
  const [stepIndex, setStepIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const blobRef = useRef<string | null>(null)
  const collapseForCompact = useCallback(() => {
    setLeftOpen(false); setRightOpen(false); setBottomOpen(false)
    setFitRequest(value => value + 1)
  }, [])
  const isTablet = useTablet(collapseForCompact)
  const setSelection = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id && !isTablet) { setRightTab('details'); setRightOpen(true) }
  }, [isTablet])

  useEffect(() => {
    if (!allowExplicitDemo) return
    let active = true
    void import('../model/topology-demo').then(({ createSyntheticTopology }) => {
      if (active) {
        setLocalDataset(createSyntheticTopology())
      }
    })
    return () => { active = false }
  }, [allowExplicitDemo])

  useEffect(() => () => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
  }, [])

  useEffect(() => {
    const update = () => setFullScreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => {
      document.removeEventListener('fullscreenchange', update)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotionRestricted(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const selectedDevice = useMemo(() => dataset.devices.find((device) => device.id === selectedId) ?? null, [dataset.devices, selectedId])
  const contextDevice = useMemo(() => dataset.devices.find(device => device.id === nodeMenu?.id) ?? null, [dataset.devices, nodeMenu?.id])
  const contextPermitted = Boolean(contextDevice && dataset.origin === 'live' && apiSite &&
    (session.data?.role === 'admin' || session.data?.role === 'operator') &&
    contextDevice.kind !== 'subnet' &&
    isPrivateIpv4(contextDevice.address))
  const contextCanReport = Boolean(nodeMenu && contextDevice && apiSite &&
    session.data && session.data.role !== 'viewer' &&
    dataset.origin !== 'synthetic' && contextDevice.kind !== 'subnet')
  const openNodeManualLink = () => {
    if (!nodeMenu || !contextCanReport) return
    setSelectedId(nodeMenu.id)
    setRightTab('report')
    setRightOpen(true)
    setNodeMenu(null)
  }
  const openNodeDiagnostic = (kind: DiagnosticKind) => {
    if (!nodeMenu || !contextPermitted) return
    setSelectedId(nodeMenu.id)
    setDiagnosticIntent(kind)
    setRightTab('diagnostics')
    setRightOpen(true)
    setNodeMenu(null)
  }
  const connectionCount = useMemo(() => dataset.edges.filter(edge =>
    !edge.data?.logicalMembership && (edge.source === selectedId || edge.target === selectedId)
  ).length, [dataset.edges, selectedId])
  const inspectedLinks = useMemo<InspectedLink[]>(() => {
    if (!selectedId) return []
    const names = new Map(dataset.devices.map(device => [device.id, device.name]))
    return dataset.edges.filter(edge => !edge.data?.logicalMembership &&
      (edge.source === selectedId || edge.target === selectedId))
      .map(edge => {
        const forward = edge.source === selectedId
        const peerId = forward ? edge.target : edge.source
        const localPort = forward ? edge.data?.sourcePort : edge.data?.targetPort
        const remotePort = forward ? edge.data?.targetPort : edge.data?.sourcePort
        return {
          id: edge.id, peerName: names.get(peerId) ?? peerId,
          localPort: typeof localPort === 'string' ? localPort : null,
          remotePort: typeof remotePort === 'string' ? remotePort : null,
          protocol: typeof edge.label === 'string' ? edge.label : 'MANUAL',
          corroboration: typeof edge.data?.corroboration === 'string' ? edge.data.corroboration : null,
          verifiedLldp: edge.data?.verifiedLldp === true,
        }
      }).sort((a, b) => Number(b.verifiedLldp) - Number(a.verifiedLldp))
      .slice(0, 24)
  }, [dataset.edges, dataset.devices, selectedId])
  const counts = useMemo(() => countStates(dataset.devices), [dataset.devices])
  const hypothesis = useMemo(() => leadingHypothesis(dataset), [dataset])
  const affectedCount = selectedId ? (sharedParentHypothesis(dataset, selectedId)?.count ?? 0) : 0
  const demo = dataset.origin === 'synthetic'
  const hasMap = dataset.nodes.length > 0 || Boolean(blueprintUrl)
  const steps = useMemo(() => syntheticDiscoverySteps(dataset, 'collector'), [dataset])
  const activeProbe = stepIndex >= 0 ? steps[stepIndex] ?? null : null
  const motionEnabled = motion && !motionRestricted

  useEffect(() => {
    if (!playing) return
    if (stepIndex >= steps.length - 1 || steps.length === 0) {
      // Terminal state is not a running probe.
      const id = window.setTimeout(() => setPlaying(false), 180 / speed)
      return () => window.clearTimeout(id)
    }
    const id = window.setTimeout(() => setStepIndex((current) => current + 1), 920 / speed)
    return () => window.clearTimeout(id)
  }, [playing, stepIndex, steps.length, speed])

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const fitAll = useCallback(() => setFitRequest((v) => v + 1), [])
  const focusNode = useCallback((id: string) => {
    setSelection(id)
    setFocusNodeId(id)
    setFocusRequest((v) => v + 1)
  }, [setSelection])

  async function toggleFullscreen() {
    setFullScreenError('')
    if (document.fullscreenElement) {
      try { await document.exitFullscreen() } catch { setFullScreenError('خروج از حالت تمام‌صفحه ممکن نشد.') }
      return
    }
    if (theater) { setTheater(false); return }
    try {
      if (!document.documentElement.requestFullscreen) throw new Error('Unsupported')
      await document.documentElement.requestFullscreen()
    } catch {
      // CSS immersive mode remains fully operable in constrained/older browsers.
      setTheater(true)
      setFullScreenError('مرورگر Fullscreen را نپذیرفت؛ حالت تمرکز داخلی فعال شد.')
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest('input,textarea,select,[contenteditable],[role="dialog"]')) return
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleFullscreen() }
      if (event.key === '0') { event.preventDefault(); fitAll() }
      if (event.key === '?') { event.preventDefault(); setHelp(true) }
      if (event.key === 'Escape' && theater) setTheater(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function importSvg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const next = await readLocalSvg(file)
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
      blobRef.current = next
      setBlueprintUrl(next)
      setBlueprintName(file.name)
      setSvgError('')
      setView('floor')
    } catch (error) {
      setSvgError(error instanceof Error ? error.message : 'فایل انتخابی قابل پردازش نیست.')
    } finally {
      event.target.value = ''
    }
  }

  function clearSvg() {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    blobRef.current = null
    setBlueprintUrl(null)
    setBlueprintName('')
    setView('logical')
    setSvgError('')
  }

  function exportDemo() {
    if (!demo) return
    const payload = {
      schemaVersion: 1, provenance: 'synthetic-only-not-live',
      warning: 'A frontend mock; not collected from any physical network',
      devices: dataset.devices,
      links: dataset.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label })),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'infragraph-topology-demo.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function playReplay() {
    if (!demo || steps.length === 0) return
    if (playing) { setPlaying(false); return }
    if (stepIndex < 0 || stepIndex >= steps.length - 1) {
      setStepIndex(0)
      fitAll() // Start with the whole simulated network visible; packet markers travel across it.
    }
    setPlaying(true)
    setBottomTab('replay')
    setBottomOpen(true)
    setRoute(null)
  }

  function traceRoute() {
    if (!demo) return
    setPlaying(false)
    setRoute(logicalRoute(dataset, routeFrom, routeTo))
  }

  const studioActions: StudioAction[] = [
    { id: 'devices', label: 'کاوشگر تجهیزات', icon: ListTree, group: 'investigation', onSelect: () => {setLeftTab('devices');setLeftOpen(true)} },
    { id: 'path', label: 'تحلیل مسیر منطقی', icon: Route, group: 'investigation', onSelect: () => {setBottomTab('path');setBottomOpen(true)} },
    { id: 'replay', label: 'بازپخش کشف آزمایشی', icon: ScanSearch, group: 'investigation', onSelect: () => {setBottomTab('replay');setBottomOpen(true)} },
    { id: 'all', label: 'نمایش تمام نودها', icon: Focus, group: 'view', onSelect: () => {setStatusFilter('all');setSite('all');setSearch('');fitAll()} },
    { id: 'horizontal', label: 'چیدمان افقی', icon: Columns3, group: 'view', onSelect: () => setLayoutMode('LR') },
    { id: 'vertical', label: 'چیدمان عمودی', icon: Rows3, group: 'view', onSelect: () => setLayoutMode('TB') },
    { id: 'logical', label: 'نقشه ارتباطات', icon: GitBranch, group: 'view', onSelect: () => setView('logical') },
    { id: 'floor', label: 'پلان ساختمان SVG', icon: Layers3, group: 'view', onSelect: () => setView('floor') },
    { id: 'svg', label: 'بارگذاری پلان SVG', icon: FileUp, group: 'data', onSelect: () => fileRef.current?.click() },
    { id: 'remove-svg', label: 'حذف پلان', icon: Trash2, group: 'data', onSelect: clearSvg, disabled: !blueprintUrl },
    { id: 'export', label: 'خروجی JSON نمایشی', icon: Download, group: 'data', onSelect: exportDemo, disabled: !demo },
    ...(demo ? sites.map(item => ({ id: `site-${item}`, label: item === 'all' ? 'تمام سایت‌ها' : `سایت: ${item}`, icon: SlidersHorizontal, group: 'view' as const, onSelect: () => setSite(item) })) : []),
    ...(['all', 'critical', 'warning', 'unknown'] as const).map(item => ({ id: `filter-${item}`, label: `وضعیت: ${item === 'all' ? 'همه' : item === 'critical' ? 'بحرانی' : item === 'warning' ? 'هشدار' : 'نامشخص'}`, icon: ShieldAlert, group: 'view' as const, onSelect: () => setStatusFilter(item) })),
    { id: 'help', label: 'راهنما و میان‌برها', icon: CircleHelp, group: 'data', onSelect: () => setHelp(true) },
  ]


  const mainSurface = <div className="topology-main">
    <div className="topology-stage" data-testid="topology-stage"
      onKeyDownCapture={event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
        const node = (event.target as HTMLElement).closest('.react-flow__node[data-id]')
        const id = node?.getAttribute('data-id')
        if (!node || !id || !dataset.devices.some(device => device.id === id)) return
        const rect = node.getBoundingClientRect()
        event.preventDefault()
        setNodeMenu({ id, x: rect.left + Math.min(32, rect.width / 2), y: rect.top + Math.min(32, rect.height / 2) })
      }}>
      {hasMap ? <TopologyCanvas
        dataset={dataset} layoutMode={layoutMode} selectedId={selectedId} onSelect={setSelection}
        onNodeContext={(id, x, y) => setNodeMenu({ id, x, y })}
        search={search} site={demo ? site : 'all'} statusFilter={statusFilter}
        blueprintUrl={view === 'floor' ? blueprintUrl : null}
        route={route} activeProbe={activeProbe} probeRunning={playing} probeSpeed={speed}
        motionEnabled={motionEnabled} showGrid={showGrid} showMinimap={showMinimap} showLabels={showLabels}
        fitRequest={fitRequest} focusRequest={focusRequest} focusNodeId={focusNodeId}
      /> : <div className="topology-stage-empty"><Network size={44} strokeWidth={1.2}/>
        <h2>هنوز داده توپولوژی موجود نیست</h2>
        <p>کشف واقعی نیازمند شواهد و مجوز سایت است. SVG به‌تنهایی هیچ دستگاهی را کشف نمی‌کند.</p></div>}
      {demo && <div className="topology-demo-watermark" aria-hidden="true">DEMO DATA · NOT LIVE</div>}
      <NodeActionMenu target={nodeMenu} device={contextDevice}
        canDiagnose={contextPermitted} canReportLink={contextCanReport}
        onClose={() => setNodeMenu(null)}
        onInspect={() => { if (nodeMenu) setSelection(nodeMenu.id); setNodeMenu(null) }}
        onFocus={() => { if (nodeMenu) focusNode(nodeMenu.id); setNodeMenu(null) }}
        onDiagnose={openNodeDiagnostic} onReportLink={openNodeManualLink}/>
    </div>
  </div>

  const leftDock = <DockPane region="left" title="پنل چپ · کاوش"
    activeLabel={LEFT_TABS.find(tab => tab.id === leftTab)?.label ?? ''}
    onClose={() => setLeftOpen(false)}>
    {leftTab === 'devices' && <>
      <label className="ig-dock-search"><Search size={15}/>
        <span className="visually-hidden">جست‌وجوی نود</span>
        <input type="search" aria-label="جست‌وجوی نود" value={search}
          onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی تجهیز یا IP…"/>
      </label>
      <AssetExplorer devices={dataset.devices.filter(d =>
        !search.trim() || [d.name, d.title, d.address].some(x => x.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))}
        selectedId={selectedId} onSelect={id => {focusNode(id);if (isTablet) setLeftOpen(false)}}
        demo={demo}/>
    </>}
    {leftTab === 'scan' && (session.data
      ? <ActiveScanPanel siteId={apiSite} canStart={session.data.role === 'admin'}/>
      : <p className="ig-dock-message">برای اسکن واقعی ابتدا وارد شوید.</p>)}
    {leftTab === 'filter' && <div className="ig-dock-fields">
      <label>وضعیت تجهیزات
        <select className="studio-filter-select" aria-label="فیلتر وضعیت" value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          <option value="all">همه</option><option value="critical">بحرانی</option>
          <option value="warning">هشدار</option><option value="unknown">نامشخص</option>
        </select>
      </label>
      {demo && <SiteSelect value={site} onChange={setSite}/>}
      {session.data && <SiteScopeSelector compact siteId={apiSite}
        choices={scope.choices} canChoose={Boolean(scope.canChoose)}
        onChange={id => { scope.setChoice(id); setWalkPreview(null);setSelectedId(null);setNodeMenu(null) }}/>}
      {scope.isError && <p role="alert">بارگذاری سایت‌های موجود ناموفق بود؛ شناسهٔ جدید وارد نمی‌شود.</p>}
      <Button size="sm" variant="secondary" onClick={() => {setSearch('');setSite('all');setStatusFilter('all');fitAll()}}>پاک‌کردن فیلترها</Button>
    </div>}
  </DockPane>

  const rightDock = <DockPane region="right" title="پنل راست · بازرسی"
    activeLabel={RIGHT_TABS.find(tab => tab.id === rightTab)?.label ?? ''}
    onClose={() => setRightOpen(false)}>
    {rightTab === 'diagnostics' && <NodeDiagnosticsPanel key={(selectedId ?? 'none')+':' +(diagnosticIntent ?? 'manual')} device={selectedDevice}
      siteId={apiSite} permitted={Boolean(session.data && dataset.origin === 'live' &&
        (session.data.role === 'admin' || session.data.role === 'operator'))}
      initialKind={diagnosticIntent}/>}
    {rightTab === 'details' && <NodeInspector key={selectedId ?? 'none'} device={selectedDevice}
      connections={connectionCount} links={inspectedLinks}
      possibleDependents={affectedCount} onClose={() => setSelectedId(null)} demo={demo}/>}
    {rightTab === 'evidence' && (session.data && apiSite
      ? <EvidenceManager key={apiSite} siteId={apiSite} canWrite={session.data.role !== 'viewer'}
          onEvidenceChanged={() => setWalkPreview(null)}
          onPreview={result => {setWalkPreview({siteId: apiSite, graph: result.graph});setBottomTab('activity');setBottomOpen(true)}}/>
      : <p className="ig-dock-message">مرور شواهد با ورود به سایت واقعی در دسترس است.</p>)}
    {rightTab === 'report' && (session.data && session.data.role !== 'viewer' && !demo
      ? <ObservationForm key={apiSite + ':' + (selectedId ?? '')} siteId={apiSite}
          devices={dataset.devices} prefilledSourceId={selectedId}
          onChanged={() => setWalkPreview(null)}/>
      : <p className="ig-dock-message">ثبت لینک دستی به سایت واقعی و دسترسی اپراتور نیاز دارد.</p>)}
    {rightTab === 'layers' && <div className="ig-dock-fields">
      <SwitchField label="شبکه زمینه" checked={showGrid} onCheckedChange={setShowGrid}/>
      <SwitchField label="نمای کوچک" checked={showMinimap} onCheckedChange={setShowMinimap}/>
      <SwitchField label="نام پورت‌ها" checked={showLabels} onCheckedChange={setShowLabels}/>
      <SwitchField label="حرکت Replay" checked={motion && !motionRestricted} onCheckedChange={setMotion} disabled={motionRestricted}/>
      <div className="ig-dock-row">
        <Button size="sm" variant="secondary" onClick={() => setLayoutMode('LR')}><Columns3 size={15}/> شبکه‌ای / افقی</Button>
        <Button size="sm" variant="ghost" onClick={() => setLayoutMode('TB')}><Rows3 size={15}/> عمودی</Button>
      </div>
      <div className="ig-dock-row">
        <Button size="sm" variant="ghost" onClick={() => setView('logical')}>گراف شبکه</Button>
        <Button size="sm" variant="ghost" onClick={() => setView('floor')}>پلان SVG</Button>
      </div>
      <div className="ig-dock-row">
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><FileUp size={15}/> بارگذاری SVG</Button>
        <Button size="sm" variant="ghost" disabled={!blueprintUrl} onClick={clearSvg}><Trash2 size={15}/> حذف</Button>
      </div>
    </div>}
  </DockPane>

  const bottomDock = <DockPane region="bottom" title="پنل پایین · عملیات"
    activeLabel={BOTTOM_TABS.find(tab => tab.id === bottomTab)?.label ?? ''}
    onClose={() => setBottomOpen(false)}>
    {bottomTab === 'activity' && <div className="ig-dock-activity">
      <div className="ig-dock-metrics">
        <span>نودها <strong>{counts.total}</strong></span>
        <span data-testid="topology-agent-count">دارای Agent <strong>{dataset.devices.filter(d => d.agent).length}</strong></span>
        <span>لینک‌های مستند <strong>{dataset.edges.filter(e => !e.data?.logicalMembership).length}</strong></span>
        <span>نیازمند بررسی <strong>{counts.warning + counts.critical}</strong></span>
        <span>نامشخص <strong>{counts.unknown}</strong></span>
      </div>
      {displayedGraph && <p role="note" className="topology-note">
        SNMPv3: {displayedGraph.nodes.filter(n => n.identitySource === 'snmpv3-authpriv').length} تجهیز ·
        LLDP: {displayedGraph.links.filter(l => l.evidenceSource === 'snmpv3-authpriv' && l.protocol === 'LLDP').length} همسایگی ·
        FDB: {displayedGraph.nodes.reduce((sum, n) => sum + (n.learnedMacCount ?? 0), 0)} MAC.
        همسایگی LLDP به‌تنهایی سلامت کابل و پورت را ثابت نمی‌کند.
      </p>}
      {displayedGraph?.logicalSegments?.length ? <p role="note" className="topology-note">
        خطوط عضویت CIDR فقط گروه‌بندی منطقی IPها هستند، نه لینک فیزیکی یا سوئیچ واقعی.
      </p> : null}
      {previewGraph && <p className="topology-note" role="status">پیش‌نمایش آفلاین شواهد؛ هیچ اسکن جدیدی انجام نشده است.
        <Button size="sm" variant="ghost" onClick={() => setWalkPreview(null)}>بازگشت به گراف کامل</Button></p>}
      {graph.isError && <p role="alert" className="topology-note topology-note--error">دریافت یا اعتبارسنجی داده‌های نقشه ناموفق بود. <Button size="sm" variant="secondary" onClick={() => void graph.refetch()}>تلاش مجدد</Button></p>}
      {displayedGraph?.truncated && <p className="topology-note">گراف ناقص است؛ سقف ایمن داده رسیده است.</p>}
      {displayedGraph && displayedGraph.staleObservations > 0 && <p className="topology-note">{displayedGraph.staleObservations} مشاهده منقضی کنار گذاشته شد.</p>}
      {displayedGraph?.links.some(l => l.possibleCycle) && <p className="topology-note">چرخهٔ احتمالی؛ Loop فعال یا اشکال STP تأیید نشده است.</p>}
      {hypothesis && <div className="ig-dock-incident" data-testid="shared-fault-hypothesis"><ShieldAlert size={15}/>
        <span>فرضیه اختلال مشترک · DEMO · {hypothesis.count} نود پایین‌دست نامشخص</span>
        <Button size="sm" variant="ghost" onClick={() => focusNode(hypothesis.parentId)}>بررسی</Button>
      </div>}
      {(svgError || fullScreenError || (view === 'floor' && !blueprintUrl)) && <p
        role={svgError ? 'alert' : 'note'} className={svgError ? 'topology-note topology-note--error' : 'topology-note'}>
        <Info size={15}/> {svgError || fullScreenError || 'پلان SVG هنوز بارگذاری نشده است.'}
        {fullScreenError && <Button size="icon" variant="ghost" onClick={() => setFullScreenError('')} aria-label="بستن پیام"><X size={14}/></Button>}
      </p>}
      {blueprintName && view === 'floor' && <p className="topology-note">پلان محلی: <b dir="ltr">{blueprintName}</b></p>}
      <div className="ig-dock-legend">
        <span><i className="summary-dot summary-dot--healthy"/>سالم</span>
        <span><i className="summary-dot summary-dot--warning"/>هشدار</span>
        <span><i className="summary-dot summary-dot--critical"/>قطع</span>
        <span><i className="summary-dot summary-dot--unknown"/>نامشخص</span>
        <span><i className="summary-dot summary-dot--healthy"/>Agent: گزارش اخیر</span>
        <span><i className="summary-dot summary-dot--warning"/>Agent: داده قدیمی</span>
        <span>موقعیت نودها صرفاً نمایش گراف است، نه نقشهٔ فیزیکی.</span>
      </div>
    </div>}
    {(bottomTab === 'path' || bottomTab === 'replay') && <PlaybackDock
      devices={dataset.devices} steps={steps} index={stepIndex} playing={playing} speed={speed}
      onSpeed={setSpeed} onPlay={playReplay} onStop={() => {setPlaying(false);setStepIndex(-1)}}
      onBack={() => setStepIndex(i => Math.max(0, i-1))}
      onNext={() => setStepIndex(i => Math.min(steps.length - 1, i+1))}
      routeFrom={routeFrom} routeTo={routeTo} onFrom={id => {setRouteFrom(id);setRoute(null)}}
      onTo={id => {setRouteTo(id);setRoute(null)}} route={route}
      onTrace={traceRoute} onClearTrace={() => setRoute(null)}
      tab={bottomTab === 'path' ? 'path' : 'probe'} demo={demo}/>
    }
  </DockPane>

  return <div className={`topology-page topology-page--studio${theater ? ' topology-page--theater' : ''}`} data-testid="topology-studio">
    <header className="studio-appbar">
      <div className="studio-appbar-heading">
        <Link className="studio-exit" to="/monitoring/discovery" aria-label="بازگشت به Discovery" title="بازگشت به فهرست نودهای کشف‌شده"><ArrowRight size={18}/></Link>
        <span className="studio-brandmark"><Network size={20}/></span>
        <div className="studio-identity"><h1>توپولوژی شبکه</h1><span>PAYDAR / NETWORK OPERATIONS STUDIO</span></div>
        <span className="studio-appbar-divider"/>
        <span className="studio-workspace-label">مرکز بررسی و فرماندهی شبکه</span>
      </div>
      <div className="studio-appbar-actions">
        <Badge tone="unknown">فهرست نودها در Discovery</Badge>
        {previewGraph && <Badge tone="warning">پیمایش آفلاین محدوده‌دار</Badge>}
        {dataset.origin === 'reported' && <Badge tone="warning">گزارش دستی · تأییدنشده</Badge>}
        {session.data && <Button size="sm" variant="ghost" onClick={() => void signOut()}>خروج</Button>}
        {demo && <Badge tone="warning">حالت نمایشی · داده ساختگی</Badge>}
        <StudioActionMenu actions={studioActions}/>
        <Button size="icon" variant="ghost" onClick={fitAll} disabled={!hasMap} aria-label="بازگردانی نمای گراف" title="نمایش کل گراف (0)"><Focus size={18}/></Button>
        <Button size="icon" variant="ghost" onClick={() => setHelp(true)} aria-label="راهنمای استودیو" title="راهنمای میان‌برها (?)"><CircleHelp size={18}/></Button>
        <Button size="sm" variant="secondary" onClick={() => void toggleFullscreen()} aria-label={fullScreen || theater ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}>
          {fullScreen || theater ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
          <span>{fullScreen || theater ? 'بازگشت' : 'تمام‌صفحه'}</span>
        </Button>
      </div>
    </header>

    <section className="topology-workspace" aria-label="محیط بررسی توپولوژی">
      <input ref={fileRef} className="visually-hidden" type="file" accept=".svg,image/svg+xml"
        aria-label="انتخاب فایل SVG" onChange={event => void importSvg(event)} />
      <TopologyDockLayout compact={isTablet} leftOpen={leftOpen} rightOpen={rightOpen} bottomOpen={bottomOpen}
        left={leftDock} center={mainSurface} right={rightDock} bottom={bottomDock}
        leftTabs={LEFT_TABS} rightTabs={RIGHT_TABS} bottomTabs={BOTTOM_TABS}
        leftActive={leftTab} rightActive={rightTab} bottomActive={bottomTab}
        onLeftTab={tab => {
          if (leftOpen && leftTab === tab) setLeftOpen(false)
          else { setLeftTab(tab); setLeftOpen(true) }
        }}
        onRightTab={tab => {
          if (rightOpen && rightTab === tab) setRightOpen(false)
          else { setRightTab(tab); setRightOpen(true) }
        }}
        onBottomTab={tab => {
          if (bottomOpen && bottomTab === tab) setBottomOpen(false)
          else { setBottomTab(tab); setBottomOpen(true) }
        }}/>
    </section>
    <footer className="studio-footer">
      <span><span className="summary-dot summary-dot--unknown"/> {demo ? 'سناریوی آزمایشی · بدون ارسال بسته واقعی' : dataset.origin === 'reported' ? 'شواهد گزارش‌شده · وضعیت تجهیزات نامشخص' : 'کشف فعال IP · شواهد اتصال لایه ۲ مستقل است'}</span>
      <span>PAYDAR STUDIO <span className="numeric">/ pilot</span></span>
    </footer>
    <Dialog.Root open={isTablet && selectedDevice !== null} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ig-dialog-overlay"/>
        <Dialog.Content className="topology-inspector-drawer" aria-describedby="topology-inspector-description">
          <Dialog.Title className="visually-hidden">جزئیات نود انتخاب‌شده</Dialog.Title>
          <Dialog.Description id="topology-inspector-description" className="visually-hidden">نمایش مشخصات نود شبکه</Dialog.Description>
          <NodeInspector key={selectedId ?? 'none'} device={selectedDevice} connections={connectionCount} possibleDependents={affectedCount} onClose={() => setSelectedId(null)}/>
          <Dialog.Close className="visually-hidden">بستن</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <StudioHelp open={help} onOpenChange={setHelp}/>
  </div>
}