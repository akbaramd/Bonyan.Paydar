import { useEffect, useMemo, useState } from 'react'
import { HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { postSecure } from '../../../shared/auth/session'
import { HttpError } from '../../../shared/api/http'
import { getHostScopeCandidates, getScanEvents, getScanJobs, scanEventSchema, type ScanEvent } from '../api/active-scan'

const labels: Record<string, string> = {
  pending: 'در صف', running: 'اسکن فعال', cancelling: 'در حال توقف',
  cancelled: 'متوقف‌شده', failed: 'ناموفق',
  started: 'اسکن آغاز شد', progress: 'پیشرفت', sweep: 'دور پایش کامل شد',
  'host-discovered': 'میزبان کشف شد', 'host-suspect': 'اولین پیمایش بدون پاسخ',
  'host-unresponsive': 'دو پیمایش متوالی بدون پاسخ',
  'host-recovered': 'میزبان دوباره پاسخ داد',
  'topology-updated': 'شواهد SNMPv3/LLDP به‌روزرسانی شد',
}

export function ActiveScanPanel({ siteId, canStart }: {
  siteId: string
  canStart: boolean
}) {
  const qc = useQueryClient()
  const [cidrs, setCidrs] = useState('')
  const [interval, setInterval] = useState(60)
  const [approved, setApproved] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [connected, setConnected] = useState(false)
  const [feed, setFeed] = useState<ScanEvent[]>([])

  const scopes = useQuery({
    queryKey: ['discovery', 'host-scope-candidates'],
    queryFn: ({ signal }) => getHostScopeCandidates(signal),
    enabled: canStart && Boolean(siteId), retry: false,
  })
  const jobs = useQuery({
    queryKey: ['discovery', 'scans', siteId],
    queryFn: ({ signal }) => getScanJobs(siteId, signal),
    enabled: Boolean(siteId), retry: false, refetchInterval: 5000,
  })
  const current = jobs.data?.items[0]
  const active = jobs.data?.items.find(item =>
    item.status === 'pending' || item.status === 'running' || item.status === 'cancelling')
  const eventQuery = useQuery({
    queryKey: ['discovery', 'events', siteId, current?.id],
    queryFn: ({ signal }) => getScanEvents(current!.id, 0, signal),
    enabled: Boolean(siteId && current?.id), retry: false, refetchInterval: 10000,
  })
  const events = useMemo(() => {
    const seen = new Map<number, ScanEvent>()
    for (const item of eventQuery.data?.items ?? []) seen.set(item.id, item)
    for (const item of feed) if (item.jobId === current?.id) seen.set(item.id, item)
    return [...seen.values()].sort((a, b) => b.id - a.id).slice(0, 16)
  }, [eventQuery.data, feed, current?.id])

   useEffect(() => {
    if (!siteId) return
    let closed = false
    const hub = new HubConnectionBuilder()
      .withUrl('/hubs/status')
      .withAutomaticReconnect([0, 1000, 3000, 5000])
      .build()
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['discovery', 'scans', siteId] })
      void qc.invalidateQueries({ queryKey: ['topology', 'reported', siteId] })
      void qc.invalidateQueries({ queryKey: ['discovery', 'events', siteId] })
    }
    hub.on('scanEvent', (value: unknown) => {
      const parsed = scanEventSchema.safeParse(value)
      if (!parsed.success || parsed.data.siteId !== siteId) return
      setFeed(items => [...items, parsed.data].slice(-50))
      refresh()
    })
    hub.onreconnecting(() => setConnected(false))
    hub.onreconnected(() => {
      if (closed) return
      void hub.invoke('JoinSite', siteId).then(() => {
        if (!closed) { setConnected(true); refresh() }
      }).catch(() => setConnected(false))
    })
    hub.onclose(() => setConnected(false))
    void hub.start().then(async () => {
      if (closed) { await hub.stop(); return }
      await hub.invoke('JoinSite', siteId)
      if (!closed) { setConnected(true); refresh() }
    }).catch(() => { if (!closed) setConnected(false) })
    return () => {
      closed = true
      setConnected(false)
      if (hub.state !== HubConnectionState.Disconnected)
        void hub.stop().catch(() => undefined)
    }
  }, [siteId, qc])

  async function start() {
    if (!canStart || !siteId || !approved || working || active) return
    setWorking(true); setError(''); setNotice('')
    const entries = cidrs.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean)
    try {
      await postSecure('/api/v1/discovery/scans', {
        siteId, cidrs: entries, intervalSeconds: interval, approved: true,
      })
      setApproved(false)
      setNotice('درخواست اسکن در PostgreSQL ثبت شد؛ Worker محدوده را بررسی می‌کند.')
      await qc.invalidateQueries({ queryKey: ['discovery', 'scans', siteId] })
    } catch (ex) {
      setError(ex instanceof HttpError && ex.status === 409
        ? 'برای این سایت یک اسکن فعال وجود دارد.'
        : 'شروع اسکن رد شد. CIDR باید خصوصی، دارای آدرس شبکه صحیح و حداکثر ۱۰۲۴ هدف باشد.')
    } finally { setWorking(false) }
  }

  async function cancel() {
    if (!active || working || !canStart) return
    setWorking(true); setError('')
    try {
      await postSecure(`/api/v1/discovery/scans/${active.id}/cancel`, {})
      setNotice('درخواست توقف ثبت شد؛ پس از دستهٔ فعلی اعمال می‌شود.')
      await qc.invalidateQueries({ queryKey: ['discovery', 'scans', siteId] })
    } catch { setError('درخواست توقف ناموفق بود.') }
    finally { setWorking(false) }
  }

  if (!siteId) return <section className="scan-panel" aria-label="کشف فعال شبکه">
    <strong>کشف فعال IPv4</strong>
    <p>ابتدا شناسه سایت را در نوار ابزار مشخص کنید.</p>
  </section>

  return <section className="scan-panel" aria-label="کشف فعال شبکه">
    <div className="scan-panel-heading">
      <div><strong>کشف فعال IP و پایش تغییرات</strong>
        <p>ICMP + TCP · فقط CIDR خصوصی تأییدشده · بدون اسکن خودکار شبکه‌های مجاور</p>
      </div>
      <span role="status" className={connected ? 'scan-stream scan-stream--connected' : 'scan-stream'}>
        {connected ? 'SignalR متصل' : 'SignalR قطع؛ بازیابی دوره‌ای فعال'}
      </span>
    </div>
    {canStart && <div className="scan-panel-controls">
      {scopes.data?.available && scopes.data.candidates.length > 0 &&
        <label>شبکه‌های پیشنهادی از کارت شبکه همین سرور
          <select aria-label="انتخاب محدوده پیشنهادی سرور" value=""
            onChange={event => setCidrs(event.target.value)}
            disabled={Boolean(active) || working}>
            <option value="">انتخاب CIDR برای بررسی و تأیید</option>
            {scopes.data.candidates.map((item, index) =>
              <option key={index} value={item.cidr}>
                {item.interfaceAlias}: {item.cidr} ({item.adapterAddress})
              </option>)}
          </select>
          <small>این فهرست صرفاً پیشنهاد مبتنی بر رابط‌های میزبان Windows است؛ دسترسی Worker و مجوز اسکن باید جداگانه تأیید شود.</small>
        </label>}
      <label>محدوده‌های مجاز IPv4 /22 تا /32
        <input dir="ltr" value={cidrs} onChange={event => setCidrs(event.target.value)}
          disabled={Boolean(active) || working} placeholder="192.168.1.0/24" maxLength={250}
          aria-label="CIDRهای مجاز برای اسکن" />
      </label>
      <label>فاصله پایش (ثانیه)
        <input type="number" min={30} max={3600} step={30}
          value={interval} onChange={event => setInterval(Number(event.target.value))}
          disabled={Boolean(active) || working} aria-label="فاصله اسکن ثانیه" />
      </label>
      <label className="scan-approval">
        <input type="checkbox" checked={approved} disabled={Boolean(active) || working}
          onChange={event => setApproved(event.target.checked)} />
        مجوز اسکن این CIDRها را دارم
      </label>
      <button type="button" disabled={Boolean(active) || working || !approved || !cidrs.trim()}
        onClick={() => void start()}>شروع اسکن واقعی</button>
      {active && <button type="button" className="scan-stop"
        disabled={working || active.status === 'cancelling'}
        onClick={() => void cancel()}>توقف اسکن</button>}
    </div>}
    {jobs.isError && <p role="alert">گزارش اسکن از API دریافت نشد.</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {current ? <div className="scan-progress">
      <div><b>{labels[current.status]}</b> · دور پایش {current.cycle} ·
        {current.responsiveCount} میزبان پاسخ‌گو از {current.probedCount}/{current.targetCount} هدف</div>
      <progress aria-label="پیشرفت اسکن واقعی" max={current.targetCount}
        value={current.probedCount}/>
      {current.lastSweepAtUtc && <small>آخرین دور کامل: {new Date(current.lastSweepAtUtc).toLocaleString('fa-IR')}</small>}
      {current.error && <p role="alert">{current.error}</p>}
    </div> : <p>هنوز هیچ اسکن واقعی برای این سایت ثبت نشده است.</p>}
    {events.length > 0 && <div className="scan-feed" aria-label="رویدادهای اسکن">
      {events.map(item => <div key={item.id}>
        <time>{new Date(item.atUtc).toLocaleTimeString('fa-IR')}</time>
        <span>{labels[item.kind] ?? item.kind}</span>
        {item.address && <code dir="ltr">{item.address}</code>}
      </div>)}
    </div>}
    <small className="scan-caveat">میزبان‌های بدون پاسخ اولیه به‌عنوان دستگاه ثبت نمی‌شوند.
      قطع پاسخ ICMP/TCP اثبات خاموشی نیست؛ اولین عدم پاسخ فقط «مشکوک» است.
      پس از توقف اسکن، میزبان‌ها «قدیمی» نشان داده می‌شوند. کشف ارتباط فیزیکی L2 به LLDP/SNMP نیاز دارد.</small>
  </section>
}