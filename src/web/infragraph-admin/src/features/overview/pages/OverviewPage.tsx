import { Activity, ArrowUpLeft, Boxes, DatabaseZap, Network, RefreshCcw, ShieldCheck, Waypoints } from 'lucide-react'
import { Link } from 'react-router'
import { z } from 'zod'
import { getJson } from '../../../shared/api/http'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../../../shared/auth/session'
import { getSiteSummary } from '../api/site-summary'
import { useSystemSnapshot } from '../api/snapshot'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'

const capability = [
  { label: 'امنیت و ثبت Agent', stage: 'در مرحله بعد', status: 'waiting' },
  { label: 'کشف IP با ICMP/TCP', stage: 'فعال با CIDR مجاز', status: 'ready' },
  { label: 'روابط فیزیکی LLDP/SNMP', stage: 'هنوز فعال نیست', status: 'waiting' },
  { label: 'پایگاه داده و رویدادها', stage: 'بخش اولیه طراحی شده', status: 'planned' },
  { label: 'React، API و SPA Proxy', stage: 'ساخته شده', status: 'ready' },
] as const

function EmptyTopology() {
  return (
    <div className="topology-empty">
      <div className="topology-placeholder" aria-hidden="true">
        <span className="ghost-node ghost-node--a"><Network size={22} /></span>
        <span className="ghost-node ghost-node--b"><Boxes size={20} /></span>
        <span className="ghost-node ghost-node--c"><Activity size={20} /></span>
        <span className="ghost-node ghost-node--d"><ShieldCheck size={20} /></span>
      </div>
      <h3>هنوز شواهدی از شبکه دریافت نشده است</h3>
      <p>نقشه نهایی از اطلاعات واقعی SNMP، LLDP و Agent ساخته می‌شود؛ ارتباط فرضی به‌عنوان ارتباط قطعی نمایش داده نخواهد شد.</p>
      <Badge tone="unknown">وضعیت: نامشخص · بدون داده</Badge>
    </div>
  )
}

export default function OverviewPage() {
  const session = useSession()
  const [selectedSite, setSelectedSite] = useState('')
  const knownSites = useQuery({
    queryKey: ['sites'],
    queryFn: ({ signal }) => getJson('/api/v1/sites',
      z.object({ sites: z.array(z.string()) }), signal),
    enabled: session.data?.role === 'admin',
    retry: false,
  })
  const siteId = session.data?.role === 'admin'
    ? knownSites.data?.sites.includes(selectedSite) ? selectedSite : knownSites.data?.sites.includes('lan') ? 'lan' : knownSites.data?.sites[0] ?? ''
    : session.data?.siteId ?? ''
  const summary = useQuery({
    queryKey: ['overview', siteId],
    queryFn: ({ signal }) => getSiteSummary(siteId, signal),
    enabled: Boolean(session.data && siteId), retry: false, refetchInterval: 30_000,
  })
  const snapshot = useSystemSnapshot()
  const isScaffold = snapshot.data?.stage === 'ScaffoldOnly'
  const actualReady = snapshot.isSuccess && !isScaffold
  const kpis = [
    { title: 'میزبان‌های IP کشف‌شده', value: summary.data ? summary.data.scannedHosts.toLocaleString('fa-IR') : '—', icon: Network, note: 'تعداد IP با سابقه پاسخ مثبت؛ سلامت یا نوع دستگاه تأیید نشده' },
    { title: 'پاسخ‌گو در پایش فعلی', value: summary.data ? summary.data.respondingNow.toLocaleString('fa-IR') : '—', icon: Activity, note: 'پاسخ ICMP/TCP معتبر در محدوده اسکن جاری' },
    { title: 'شواهد لینک', value: summary.data ? summary.data.freshReportedObservations.toLocaleString('fa-IR') : '—', icon: Waypoints, note: 'گزارش‌های لینک؛ رابطه فیزیکی مستقل تأیید نشده' },
    { title: 'پایش IP', value: summary.data ? summary.data.scanActive ? 'فعال' : 'غیرفعال' : 'نامشخص', icon: ShieldCheck, note: summary.data ? `تجهیزات ثبت دستی: ${summary.data.registeredAssets} · فقط پایش محدوده مجاز` : 'برای مشاهده داده، سایت را انتخاب کنید' },
  ]
  return (
    <div className="page">
      <div className="page-eyebrow">OVERVIEW / COMMAND CENTER</div>
      <div className="page-heading">
        <div><h1>مرکز عملیات زیرساخت</h1><p>رویدادهای مهم، پوشش شبکه و وابستگی تجهیزات؛ با اولویت عیب‌یابی سریع.</p></div>
        <div className="page-actions">
          <Badge tone={actualReady ? 'success' : 'unknown'}>{actualReady ? 'آماده' : 'فاز پیاده‌سازی'}</Badge>
          <Button variant="secondary" onClick={() => { void snapshot.refetch(); void summary.refetch() }}><RefreshCcw size={15} aria-hidden="true" />بازخوانی وضعیت</Button>
        </div>
      </div>

      {session.data?.role === 'admin' && <label className="access-dashboard-site">محدودهٔ مدیریتی گزارش
        <select aria-label="سایت داشبورد" value={siteId}
          onChange={event => setSelectedSite(event.target.value)}>
          {!siteId && <option value="">انتخاب سایت موجود</option>}
          {knownSites.data?.sites.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>}
      {summary.isError && <div role="alert" className="inline-alert inline-alert--danger">گزارش این سایت از API دریافت نشد.</div>}
      {snapshot.isError && <div role="alert" className="inline-alert inline-alert--danger">ارتباط با API برقرار نشد. اطلاعات قبلی، در صورت وجود، ممکن است منقضی شده باشند.</div>}
      {snapshot.isSuccess && isScaffold && <div className="inline-alert"><DatabaseZap size={17} aria-hidden="true" /><span>کشف IP در محدوده تأییدشده فعال است؛ شناسایی اتصالات فیزیکی LLDP/SNMP و مانیتورینگ Agent هنوز فعال نیست.</span></div>}

      <section className="metric-grid" aria-label="شاخص‌های اصلی">
        {kpis.map(({ title, value, icon: Icon, note }) => (
          <article key={title} className="metric-card">
            <div className="metric-top"><span>{title}</span><Icon size={18} aria-hidden="true" /></div>
            <strong className={value === 'نامشخص' ? 'metric-value metric-value--text' : 'metric-value'}>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </section>
      <div className="overview-panels">
        <section className="surface-card topology-panel" aria-labelledby="topology-title">
          <div className="card-heading"><div><span className="panel-eyebrow">NETWORK TOPOLOGY</span><h2 id="topology-title">نمای زنده شبکه</h2></div><Link className="text-link" to="/topology">نمای کامل <ArrowUpLeft size={15} aria-hidden="true" /></Link></div>
          {summary.data && summary.data.scannedHosts > 0
            ? <div className="topology-empty"><h3>{summary.data.scannedHosts.toLocaleString('fa-IR')} میزبان IP با شواهد اسکن ثبت شده است</h3>
                <p>{summary.data.scanActive
                  ? 'پایش محدوده انتخاب‌شده فعال است. آخرین پاسخ‌های مثبت و تغییر وضعیت در توپولوژی قابل مشاهده‌اند.'
                  : 'پایش متوقف است. سوابق میزبان‌ها حفظ شده‌اند اما وضعیت جاری آن‌ها نامشخص است.'}</p>
                <Badge tone="warning">ارتباط لایه ۲ هنوز تأیید نشده</Badge>
              </div>
            : summary.data && summary.data.freshReportedObservations > 0
            ? <div className="topology-empty"><h3>شواهد گزارش‌شده برای این سایت موجود است</h3>
                <p>این گزارش‌ها هنوز از شبکه تأیید نشده‌اند. برای مشاهده ارتباطات به استودیو بروید.</p>
                <Badge tone="warning">{summary.data.freshReportedObservations.toLocaleString('fa-IR')} گزارش تازه</Badge>
              </div> : <EmptyTopology />}
        </section>
        <section className="surface-card" aria-labelledby="capability-title">
          <div className="card-heading"><div><span className="panel-eyebrow">PLATFORM READINESS</span><h2 id="capability-title">آمادگی ماژول‌ها</h2></div></div>
          <div className="readiness-list">
            {capability.map(({ label, stage, status }) => <div className="readiness-row" key={label}><span className={`readiness-dot readiness-dot--${status}`} /><span className="readiness-name">{label}</span><span className="readiness-stage">{stage}</span></div>)}
          </div>
          <div className="card-tip">در نسخه عملیاتی، این بخش وضعیت سلامت Collector، Gateway، Worker و پایگاه داده را با زمان آخرین مشاهده نمایش می‌دهد.</div>
        </section>
      </div>
    </div>
  )
}