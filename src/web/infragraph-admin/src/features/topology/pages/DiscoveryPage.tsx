import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Activity, ArrowLeft, Clock3, Database, Map, Network, Radar, RefreshCw,
  Router, Search, Server, ShieldAlert, Wifi,
} from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { DataGrid } from '../../../shared/ui/DataGrid'
import { useSession } from '../../../shared/auth/session'
import { getGraph } from '../api/graph'
import { SiteScopeSelector } from '../components/SiteScopeSelector'
import { useSiteScope } from '../components/useSiteScope'
import { discoveryRows, discoveryTotals, discoveryStatusLabels, type DiscoveryRow } from '../model/discovery-rows'
import './discovery.css'

type StatusChoice = 'all' | DiscoveryRow['probeStatus']
type KindChoice = 'all' | DiscoveryRow['deviceKind']
const kindLabels: Record<DiscoveryRow['deviceKind'], string> = {
  router: 'روتر', switch: 'سوئیچ', workstation: 'رایانه دارای Agent', server: 'سرور', unknown: 'نامشخص',
}
const sourceLabels: Record<DiscoveryRow['source'], string> = {
  'snmpv3-authpriv': 'SNMPv3',
  'lldp-remote': 'LLDP · همسایه',
  'active-ipv4': 'IPv4 · ICMP/TCP',
  'agent-self-reported-ip': 'پایدار Agent · گزارش دستگاه',
}

function formatObserved(value: string | null) {
  if (!value) return 'ثبت نشده'
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? 'زمان نامعتبر' : time.toLocaleString('fa-IR')
}

const columns: ColumnDef<DiscoveryRow>[] = [
  { id: 'address', header: 'آدرس IP', size: 190, accessorFn: row => row.address || row.id,
    cell: ctx => <span className="discovery-ip" dir="ltr">{ctx.row.original.address || 'بدون IP'}</span> },
  { accessorKey: 'name', header: 'نام نود', size: 200,
    cell: ctx => <span className="cell-strong discovery-name" dir="ltr">{ctx.row.original.name}</span> },
  { accessorKey: 'deviceKind', header: 'نوع تجهیز', size: 130,
    cell: ctx => <span className="discovery-kind">
      {ctx.row.original.deviceKind === 'router' ? <Router size={15}/> :
        ctx.row.original.deviceKind === 'switch' ? <Network size={15}/> : <Server size={15}/>}
      {kindLabels[ctx.row.original.deviceKind]}
    </span> },
  { accessorKey: 'probeStatus', header: 'آخرین نتیجهٔ پایش', size: 205,
    cell: ctx => <span className={`discovery-health discovery-health--${ctx.row.original.probeStatus}`}>
      <span aria-hidden="true" className="discovery-health-dot"/>
      {discoveryStatusLabels[ctx.row.original.probeStatus]}
    </span> },
  { id: 'agentStatus', header: 'وضعیت Agent', size: 175,
    accessorFn: row => row.agentStatus ?? '',
    cell: ctx => ctx.row.original.agentStatus === 'recent' ? 'گزارش اخیر' :
      ctx.row.original.agentStatus === 'stale' ? 'داده قدیمی' :
        ctx.row.original.agentStatus === 'revoked' ? 'گواهی لغوشده' : 'بدون Agent' },
  { accessorKey: 'source', header: 'منبع شناسایی', size: 170,
    cell: ctx => <span className="discovery-source">{sourceLabels[ctx.row.original.source]}</span> },
  { id: 'icmpResponded', header: 'ICMP', size: 95,
    accessorFn: row => row.icmpResponded === true ? 2 : row.icmpResponded === false ? 1 : 0,
    cell: ctx => ctx.row.original.icmpResponded === null ? 'ثبت نشده' :
      ctx.row.original.icmpResponded ? 'پاسخ داد' : 'بدون پاسخ' },
  { id: 'ports', header: 'پورت‌های TCP پاسخ‌گو', size: 170,
    accessorFn: row => row.ports.join(', '),
    cell: ctx => <code className="discovery-ports" dir="ltr">{ctx.row.original.ports.length ?
      ctx.row.original.ports.join(', ') : '—'}</code> },
  { id: 'lastSeenAtUtc', header: 'آخرین مشاهده', size: 220,
    accessorFn: row => row.lastSeenAtUtc || '',
    cell: ctx => <time dir="ltr">{formatObserved(ctx.row.original.lastSeenAtUtc)}</time> },
  { id: 'map', header: 'نقشه', size: 135, enableSorting: false, enableHiding: false,
    cell: ctx => <Link className="discovery-map-link"
      to={`/topology?focus=${encodeURIComponent(ctx.row.original.id)}`}
      aria-label={`مشاهده نود ${ctx.row.original.name} در نقشه`}>
      <Map size={14}/> نمایش در نقشه
    </Link> },
]

export default function DiscoveryPage() {
  const session = useSession()
  const scope = useSiteScope()
  const site = scope.siteId
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState<StatusChoice>('all')
  const [kind, setKind] = useState<KindChoice>('all')

  const graph = useQuery({
    queryKey: ['topology', 'reported', site],
    queryFn: ({ signal }) => getGraph(site, signal),
    enabled: Boolean(session.data && site),
    refetchInterval: 30_000, retry: false,
  })
  const rows = useMemo(() => graph.data ? discoveryRows(graph.data) : [], [graph.data])
  const totals = useMemo(() => discoveryTotals(rows), [rows])
  const filteredRows = useMemo(() => rows.filter(row => {
    if (status !== 'all' && row.probeStatus !== status) return false
    if (kind !== 'all' && row.deviceKind !== kind) return false
    const needle = term.trim().toLocaleLowerCase()
    return !needle || [row.name, row.address, row.id, row.source].some(x => x.toLocaleLowerCase().includes(needle))
  }), [rows, term, status, kind])

  return <div className="page discovery-page" dir="rtl" data-testid="monitoring-discovery">
    <div className="page-eyebrow">MONITORING / DISCOVERY</div>
    <div className="page-heading discovery-heading">
      <div>
        <h1><Radar size={25} aria-hidden="true"/> کشف تجهیزات شبکه</h1>
        <p>فهرست نودها از پایش IPv4، شواهد SNMPv3/LLDP و گزارش Agent. دریافت Inventory به معنی سلامت دستگاه یا تأیید لینک فیزیکی نیست.</p>
      </div>
      <div className="discovery-heading-actions">
        <Button variant="secondary" size="sm" disabled={!site || graph.isFetching} onClick={() => void graph.refetch()}>
          <RefreshCw size={16}/> به‌روزرسانی
        </Button>
        <Button asChild size="sm" variant="primary"><Link to="/topology"><Map size={16}/> بازکردن استودیو نقشه <ArrowLeft size={14}/></Link></Button>
      </div>
    </div>

    <section className="discovery-stat-grid" aria-label="خلاصهٔ نتایج پایش">
      <div className="discovery-stat"><span><Database size={16}/> کل نودهای مشاهده‌شده</span><strong>{totals.total.toLocaleString('fa-IR')}</strong></div>
      <div className="discovery-stat"><span><Wifi size={16}/> پاسخ‌گو در آخرین پیمایش</span><strong>{totals.responsive.toLocaleString('fa-IR')}</strong></div>
      <div className="discovery-stat"><span><ShieldAlert size={16}/> نیازمند بررسی</span><strong>{(totals.suspect + totals.unresponsive).toLocaleString('fa-IR')}</strong></div>
      <div className="discovery-stat"><span><Clock3 size={16}/> داده قدیمی</span><strong>{totals.stale.toLocaleString('fa-IR')}</strong></div>
    </section>

    <section className="surface-card discovery-results" aria-label="فهرست نودهای کشف‌شده">
      <div className="discovery-section-head">
        <div>
          <h2>نودهای کشف‌شده</h2>
          <p>داده از API همین سایت خوانده می‌شود. فهرست با TanStack Table و ردیف‌های مجازی قابل جست‌وجو، مرتب‌سازی و تنظیم ستون است.</p>
        </div>
        <span className="discovery-timestamp" role="status"><Activity size={14}/>
          {graph.data ? `آخرین تولید گراف: ${formatObserved(graph.data.generatedAtUtc)}` :
            graph.isFetching ? 'در حال دریافت شواهد…' : 'داده دریافت نشده'}
        </span>
      </div>
      <div className="discovery-filters">
        {session.data && <SiteScopeSelector siteId={site} choices={scope.choices}
          canChoose={Boolean(scope.canChoose)} onChange={scope.setChoice} compact/>}
        <label className="field field--search">جست‌وجوی نود
          <span className="field-input-shell"><Search size={16} aria-hidden="true"/>
            <input type="search" aria-label="جست‌وجوی نودهای کشف‌شده" placeholder="IP، نام نود، شناسه…" value={term}
              onChange={e => setTerm(e.target.value)}/></span>
        </label>
        <label className="field">نتیجه پایش
          <select aria-label="فیلتر نتیجه پایش" value={status} onChange={e => setStatus(e.target.value as StatusChoice)}>
            <option value="all">همه وضعیت‌ها</option>
            <option value="responsive">پاسخ‌گو</option>
            <option value="suspect">یک دور بدون پاسخ</option>
            <option value="unresponsive">دو دور بدون پاسخ</option>
            <option value="stale">داده قدیمی</option>
            <option value="not-monitored">پایش نشده</option>
          </select>
        </label>
        <label className="field">نوع تجهیز
          <select aria-label="فیلتر نوع تجهیز" value={kind} onChange={e => setKind(e.target.value as KindChoice)}>
            <option value="all">همه انواع</option><option value="router">روتر</option>
            <option value="switch">سوئیچ</option><option value="workstation">رایانه</option><option value="server">سرور</option><option value="unknown">نامشخص</option>
          </select>
        </label>
        <span className="discovery-result-count">{filteredRows.length.toLocaleString('fa-IR')} نتیجه</span>
      </div>
      {graph.isError && <div role="alert" className="discovery-error">خطا در دریافت گراف سایت. نتیجه‌ای به‌عنوان دادهٔ زنده تأیید نشده است.</div>}
      {graph.data?.truncated && <div role="status" className="discovery-warning">گراف به سقف داده رسید؛ جدول ممکن است کامل نباشد.</div>}
      {!site && <div role="status" className="discovery-warning">برای مشاهدهٔ نتایج، سایت مجاز را انتخاب کنید.</div>}
      <DataGrid<DiscoveryRow> label="نودهای کشف‌شده شبکه" data={filteredRows} columns={columns}
        getRowId={row => row.id} emptyMessage={graph.isFetching && !graph.data
          ? 'در حال دریافت نودهای شبکه…'
          : 'هیچ نود شناسایی‌شده‌ای با این فیلترها وجود ندارد.'}/>
      <footer className="discovery-table-footer">
        <span>نوع «نامشخص» یعنی SNMPv3 برای تشخیص روتر/سوئیچ شاهد کافی ارائه نکرده است.</span>
        <span>IP شناسایی‌شده ≠ سوئیچ یا لینک فیزیکی شناسایی‌شده</span>
      </footer>
    </section>
  </div>
}