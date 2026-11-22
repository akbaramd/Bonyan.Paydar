import { useState } from 'react'
import { z } from 'zod'
import { CheckCircle2, Clock3, Gauge, Network, Radar, ShieldAlert } from 'lucide-react'
import { postSecure } from '../../../shared/auth/session'
import { HttpError } from '../../../shared/api/http'
import type { Device } from '../model/topology'
import { isPrivateIpv4 } from '../model/network-address'
import type { DiagnosticKind } from './NodeActionMenu'
import './node-diagnostics.css'

const diagnosticResultSchema = z.object({
  kind:z.enum(['ping','traceroute']), address:z.string(), source:z.literal('controlplane'),
  observedAtUtc:z.string(),
  steps:z.array(z.object({
    ttl:z.number().int(), status:z.string(), from:z.string().nullable(), rttMs:z.number().nullable(),
  })).max(12),
  reachedDestination:z.boolean(), responses:z.number().int(), attempts:z.number().int(),
  averageRttMs:z.number().nullable(), interpretation:z.string(),
})
type Result = z.infer<typeof diagnosticResultSchema>
const statusText: Record<string, string> = {
  reply:'پاسخ', 'ttl-expired':'روتر میانی', timeout:'بی‌پاسخ',
  unreachable:'مقصد دسترس‌ناپذیر', 'icmp-error':'پاسخ ICMP نامشخص',
}
export function NodeDiagnosticsPanel({ device, siteId, permitted, initialKind }: {
  device: Device | null
  siteId: string
  permitted: boolean
  initialKind: DiagnosticKind | null
}) {
  const [kind,setKind] = useState<DiagnosticKind>(initialKind ?? 'ping')
  const [confirm,setConfirm] = useState(false)
  const [working,setWorking] = useState(false)
  const [result,setResult] = useState<Result | null>(null)
  const [error,setError] = useState('')
  const valid = Boolean(device && siteId && permitted &&
    isPrivateIpv4(device.address) && device.kind !== 'subnet')
  const reset = (next:DiagnosticKind) => {
    if (working) return
    setKind(next);setConfirm(false);setResult(null);setError('')
  }
  async function run() {
    if (!valid || !device || !confirm || working) return
    setWorking(true);setError('');setResult(null)
    try {
      const answer = await postSecure('/api/v1/diagnostics/run',{
        siteId, address:device.address, kind, confirmed:true,
      })
      setResult(diagnosticResultSchema.parse(answer))
    } catch(e) {
      setError(e instanceof HttpError && e.status===404
        ? 'IP در شواهد اسکن اخیر همین سایت و محدودهٔ مجاز یافت نشد.'
        : e instanceof HttpError && e.status===403
          ? 'مجوز اجرای تشخیص برای این سایت وجود ندارد.'
          : e instanceof HttpError && e.status===429
            ? 'ظرفیت تشخیص شبکه پر است؛ تعداد عملیات مجاز محدود شده است.'
            : 'عملیات ناموفق بود؛ ارتباط با BaseServer یا پاسخ ICMP را بررسی کنید.')
    } finally {setWorking(false);setConfirm(false)}
  }
  if (!device) return <div className="node-diagnostics-empty"><Network size={21}/>
    <p>یک نود واقعی را انتخاب کنید تا ابزارهای عیب‌یابی فعال شوند.</p></div>
  return <section className="node-diagnostics" dir="rtl" aria-label="عیب‌یابی نود" data-testid="node-diagnostics">
    <header className="node-diagnostics-heading">
      <div><small>NETWORK DIAGNOSTICS</small><strong dir="ltr">{device.name}</strong>
        <code dir="ltr">{device.address}</code></div>
      <span><Gauge size={18}/> BaseServer</span>
    </header>
    <div className="node-diagnostics-options" role="group" aria-label="انتخاب ابزار تشخیص">
      <button type="button" aria-pressed={kind==='ping'} disabled={working}
        onClick={()=>reset('ping')}><Radar size={15}/> Ping</button>
      <button type="button" aria-pressed={kind==='traceroute'} disabled={working}
        onClick={()=>reset('traceroute')}><Network size={15}/> Traceroute</button>
    </div>
    <div className="node-diagnostics-policy">
      <ShieldAlert size={16}/>
      <p>این عملیات از <strong>سرور InfraGraph</strong> اجرا می‌شود، نه مرورگر شما.
        فقط نودی که اخیراً در محدودهٔ تأییدشدهٔ همین سایت اسکن شده باشد مجاز است.
        {kind==='ping' ? ' تعداد درخواست‌ها: ۳ ICMP.' : ' حداکثر ۱۲ hop با ICMP TTL.'}
        پاسخ‌ندادن ICMP به معنی قطع قطعی دستگاه نیست.</p>
    </div>
    {!permitted && <p role="status" className="node-diagnostics-warning">
      این حساب اجازهٔ عملیات تشخیصی ندارد. دسترسی اپراتور یا مدیر لازم است.</p>}
    {device.kind==='subnet' && <p role="status" className="node-diagnostics-warning">
      CIDR یک نود فیزیکی نیست؛ برای تشخیص، میزبان دارای IP را انتخاب کنید.</p>}
    <label className="node-diagnostics-approval">
      <input type="checkbox" checked={confirm} disabled={!valid || working}
        onChange={event=>setConfirm(event.target.checked)}/>
      اجرای محدود این عملیات روی IP انتخاب‌شده را تأیید می‌کنم.
    </label>
    <button className="node-diagnostics-run" type="button" disabled={!valid || !confirm || working}
      onClick={()=>void run()}>{working ? 'در حال دریافت پاسخ…' : kind==='ping' ? 'اجرای Ping' : 'اجرای Traceroute'}</button>
    {working && <p role="status" className="node-diagnostics-progress"><Clock3 size={15}/> در حال اجرای تشخیص محدود…</p>}
    {error && <p role="alert" className="node-diagnostics-error">{error}</p>}
    {result && <div className="node-diagnostics-result" aria-live="polite">
      <div className="node-diagnostics-result-head"><CheckCircle2 size={17}/>
        <strong>نتیجهٔ واقعی ICMP</strong>
        <time>{new Date(result.observedAtUtc).toLocaleString('fa-IR')}</time>
      </div>
      <div className="node-diagnostics-summary">
        <span>پاسخ‌ها: <strong dir="ltr">{result.responses} / {result.attempts}</strong></span>
        <span>میانگین RTT: <strong>{result.averageRttMs===null?'ثبت نشد':result.averageRttMs+' ms'}</strong></span>
        <span>رسیدن به مقصد: <strong>{result.reachedDestination?'تأیید پاسخ ICMP':'تأیید نشده'}</strong></span>
      </div>
      <div className="node-diagnostics-table-wrap"><table>
        <thead><tr><th>گام / TTL</th><th>وضعیت</th><th>IP پاسخ‌دهنده</th><th>RTT</th></tr></thead>
        <tbody>{result.steps.map(step=><tr key={step.ttl}>
          <td>{step.ttl}</td><td>{statusText[step.status]??step.status}</td>
          <td><code dir="ltr">{step.from??'—'}</code></td>
          <td dir="ltr">{step.rttMs===null?'—':step.rttMs+' ms'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="node-diagnostics-interpretation">{result.kind==='ping'
        ? 'پاسخ یا عدم پاسخ ICMP تنها شاهد دسترس‌پذیری از BaseServer است و سلامت فیزیکی تجهیز را اثبات نمی‌کند.'
        : 'مسیر از BaseServer ثبت شده؛ سوئیچ لایهٔ ۲ در Traceroute دیده نمی‌شود و * به‌تنهایی نشانهٔ قطعی لینک نیست.'}</p>
    </div>}
  </section>
}