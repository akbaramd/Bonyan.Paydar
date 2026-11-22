import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowLeft, Database, Globe2, HardDrive, LockKeyhole, Network,
  RadioTower, ServerCog, ShieldCheck, Wifi } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '../../../shared/ui/Button'
import { useSession } from '../../../shared/auth/session'
import { getGraph } from '../api/graph'
import { discoveryRows, discoveryTotals } from '../model/discovery-rows'
import { ActiveScanPanel } from '../components/ActiveScanPanel'
import { getScanJobs } from '../api/active-scan'
import { SiteScopeSelector } from '../components/SiteScopeSelector'
import { useSiteScope } from '../components/useSiteScope'
import { MikroTikOnboarding } from '../components/MikroTikOnboarding'
import './base-server.css'

async function checkStatus(path: string, signal?: AbortSignal) {
  const reply = await fetch(path, { method: 'GET', signal, cache: 'no-store', credentials: 'same-origin' })
  return reply.status
}

/** Operator-visible BaseServer status: no invented DB or worker health claims. */
export default function BaseServerPage() {
  const session = useSession()
  const scope = useSiteScope()
  const siteId = scope.siteId
  const canStart = session.data?.role === 'admin'
  const scanJobs = useQuery({
    queryKey: ['discovery','scans',siteId],
    queryFn: ({ signal }) => getScanJobs(siteId, signal),
    enabled: Boolean(siteId && session.data), retry: false, refetchInterval: 30_000,
  })
  const live = useQuery({
    queryKey: ['base-server', 'live'],
    queryFn: ({ signal }) => checkStatus('/health/live', signal),
    refetchInterval: 15_000, retry: false,
  })
  const ready = useQuery({
    queryKey: ['base-server', 'ready'],
    queryFn: ({ signal }) => checkStatus('/health/ready', signal),
    refetchInterval: 30_000, retry: false,
  })
  const graph = useQuery({
    queryKey: ['topology', 'reported', siteId],
    queryFn: ({ signal }) => getGraph(siteId, signal),
    enabled: Boolean(session.data && siteId), retry: false, refetchInterval: 30_000,
  })
  const rows = useMemo(() => graph.data ? discoveryRows(graph.data) : [], [graph.data])
  const totals = useMemo(() => discoveryTotals(rows), [rows])
  const snmp = graph.data?.nodes.filter(node => node.identitySource === 'snmpv3-authpriv').length ?? 0
  const links = graph.data?.links.filter(link => link.evidenceSource === 'snmpv3-authpriv').length ?? 0
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  return <div className="page baseserver-page" data-testid="monitoring-base-server" dir="rtl">
    <div className="page-eyebrow">MONITORING / BASE SERVER</div>
    <div className="page-heading baseserver-heading">
      <div><h1><ServerCog size={26}/> BaseServer · سرور پایش</h1>
        <p>مرکز کنترل مانیتورینگ و Discovery، متصل به همان پایگاه‌داده و Worker موجود؛ بدون راه‌اندازی سرویس موازی.</p></div>
      <div className="baseserver-actions">
        <Button asChild variant="secondary" size="sm"><Link to="/monitoring/discovery"><Database size={16}/> فهرست نودها</Link></Button>
        <Button asChild variant="secondary" size="sm"><Link to="/topology"><Network size={16}/> استودیو نقشه <ArrowLeft size={14}/></Link></Button>
      </div>
    </div>

    <div className="baseserver-stats">
      <article className="baseserver-stat">
        <div><Activity size={17}/> وضعیت API</div>
        <strong className={live.data === 200 ? 'baseserver-positive' : 'baseserver-muted'}>
          {live.isPending ? 'در حال بررسی' : live.data === 200 ? 'پاسخ‌گو' : 'نامشخص / خطا'}</strong>
        <small>بر اساس پاسخ HTTPS از /health/live</small>
      </article>
      <article className="baseserver-stat">
        <div><ShieldCheck size={17}/> آمادگی بهره‌برداری</div>
        <strong className={ready.data === 200 ? 'baseserver-positive' : 'baseserver-muted'}>
          {ready.isPending ? 'در حال بررسی' : ready.data === 200 ? 'آماده' : ready.data === 503 ? 'هنوز تأیید نشده' : 'نامشخص'}</strong>
        <small>گیت /health/ready؛ پاسخ ۵۰۳ به معنی خرابی قطعی شبکه نیست.</small>
      </article>
      <article className="baseserver-stat">
        <div><Wifi size={17}/> نودهای شناسایی‌شده</div>
        <strong>{graph.data ? totals.total.toLocaleString('fa-IR') : '—'}</strong>
        <small>محدود به شواهد سایت انتخابی، نه تعداد کل تجهیزات فیزیکی</small>
      </article>
      <article className="baseserver-stat">
        <div><RadioTower size={17}/> تجهیزات با شاهد SNMPv3</div>
        <strong>{graph.data ? snmp.toLocaleString('fa-IR') : '—'}</strong>
        <small>لینک‌های مستند SNMPv3: {graph.data ? links.toLocaleString('fa-IR') : 'نامشخص'}</small>
      </article>
    </div>

    <section className="surface-card baseserver-runtime" aria-label="اتصال و امنیت سرور">
      <div className="section-heading"><div><h2>اتصال و حفاظت</h2>
        <p>BaseServer همان ControlPlane اصلی است. کاربری، سایت، مجوزها و حفاظت CSRF روی API اعمال می‌شوند.</p></div></div>
      <div className="baseserver-info-grid">
        <div><span><Globe2 size={15}/> آدرس فعلی</span><code dir="ltr">{origin}</code></div>
        <div><span><LockKeyhole size={15}/> کانال مرورگر</span><strong>{origin.startsWith('https://') ? 'HTTPS' : 'غیر HTTPS · فقط توسعه'}</strong></div>
        <div><span><ShieldCheck size={15}/> سطح دسترسی</span><strong>{session.data?.role ?? 'نامشخص'}</strong></div>
        <div><span><HardDrive size={15}/> ذخیره‌سازی و Worker</span><strong>در حال استفاده از سرویس‌های موجود؛ سلامت مستقل در این API گزارش نمی‌شود</strong></div>
      </div>
      <p className="baseserver-note">دسترسی LAN به پورت HTTPS سرور نیازمند تنظیم Bind، گواهی معتبر برای IP و قانون فایروال محدود است. تنظیمات حساس تجهیزات و رمزهای SNMP از طریق این صفحه منتشر نمی‌شوند.</p>
    </section>

    <section className="surface-card baseserver-discovery" aria-label="پیکربندی کشف شبکه">
      <div className="section-heading"><div><h2>Discovery و تنظیمات پایش سایت</h2>
        <p>تنظیم فاصلهٔ پایش، CIDR خصوصی و شروع/توقف فقط با مجوز صریح ادمین. کنترل‌ها مستقیماً به API واقعی متصل‌اند.</p></div>
        <span>Server / Worker</span>
      </div>
      <div className="baseserver-scope">
        <SiteScopeSelector siteId={siteId} choices={scope.choices}
          canChoose={Boolean(scope.canChoose)} onChange={scope.setChoice}/>
        {scope.isError && <p role="alert">فهرست محدوده‌های موجود دریافت نشد.</p>}
        {graph.isError && <span role="alert">دریافت گراف سایت ناموفق بود.</span>}
      </div>
      <div className="baseserver-scopes-review">
        <h3>محدوده‌های مصوب Discovery</h3>
        <p>فقط CIDRهایی که قبلاً با تأیید مدیر در Scan Job ذخیره شده‌اند. این فهرست مجوز جدید ایجاد نمی‌کند.</p>
        {scanJobs.isPending ? <p role="status">در حال دریافت محدوده‌های ثبت‌شده…</p> :
          scanJobs.isError ? <p role="alert">خواندن محدوده‌های ثبت‌شده ناموفق بود.</p> :
          scanJobs.data?.items.length ? <div className="baseserver-scope-list">
          {scanJobs.data.items.slice(0,5).map(item => <div key={item.id}>
            <div className="baseserver-scope-status"><strong>{item.status}</strong>
              <span>فاصله پایش: {item.intervalSeconds} ثانیه</span></div>
            <div>{(item.cidrs ?? []).map(cidr=><code key={cidr} dir="ltr">{cidr}</code>)}</div>
            <small>آخرین پیمایش: {item.lastSweepAtUtc
              ? new Date(item.lastSweepAtUtc).toLocaleString('fa-IR') : 'ثبت نشده'}</small>
          </div>)}
        </div> : <p role="status">هیچ محدودهٔ اسکن ثبت‌شده‌ای برای این سایت وجود ندارد.</p>}
      </div>
      <div className="baseserver-scan"><ActiveScanPanel key={siteId} siteId={siteId} canStart={canStart}/></div>
    </section>
    <MikroTikOnboarding siteId={siteId} canConfigure={canStart}
      jobs={scanJobs.data?.items ?? []} graph={graph.data}/>
    <p className="baseserver-footnote">BaseServer نقش مدیریتی و جمع‌آوری دارد؛ این پیاده‌سازی هنوز جایگزین کامل Zabbix Server نیست و قابلیت‌های SNMPv3/LLDP فقط با پیکربندی معتبر تجهیزات و آزمون میدانی قابل تأیید هستند.</p>
  </div>
}