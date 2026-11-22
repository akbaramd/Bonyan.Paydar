import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { getJson } from '../../../shared/api/http'
import { postSecure, useSession } from '../../../shared/auth/session'
import { getIncidents, type IncidentSeverity, type IncidentStatus } from '../api/incidents'

const sitesSchema = z.object({ sites: z.array(z.string()) })
const severityText: Record<IncidentSeverity, string> = {
  low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی',
}
const statusText: Record<IncidentStatus, string> = {
  open: 'باز', acknowledged: 'بررسی‌شده', resolved: 'بسته‌شده',
}

export default function IncidentsPage() {
  const session = useSession()
  const qc = useQueryClient()
  const [selectedSite, setSelectedSite] = useState('')
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<IncidentStatus | 'all'>('all')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('medium')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const canWrite = session.data?.role === 'admin' || session.data?.role === 'operator'
  const sites = useQuery({
    queryKey: ['sites'], queryFn: ({ signal }) => getJson('/api/v1/sites', sitesSchema, signal),
    enabled: session.data?.role === 'admin', retry: false,
  })
  const siteId = session.data?.role === 'admin'
    ? sites.data?.sites.includes(selectedSite) ? selectedSite : sites.data?.sites.includes('lan') ? 'lan' : sites.data?.sites[0] ?? ''
    : session.data?.siteId ?? ''
  const incidents = useQuery({
    queryKey: ['incidents', siteId, page, filter],
    queryFn: ({ signal }) => getIncidents(siteId, page, filter, signal),
    enabled: Boolean(session.data && siteId), retry: false,
  })

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy || !siteId || !canWrite) return
    setBusy(true); setMessage(''); setError('')
    try {
      await postSecure('/api/v1/incidents', {
        siteId, title: title.trim(), description: description.trim() || null, severity,
      })
      setTitle(''); setDescription(''); setPage(1); setFilter('all')
      await qc.invalidateQueries({ queryKey: ['incidents', siteId] })
      setMessage('گزارش دستی ایجاد شد؛ تشخیص خودکار شبکه انجام نشده است.')
    } catch { setError('ایجاد گزارش انجام نشد؛ اطلاعات، مجوز سایت و اتصال API را بررسی کنید.') }
    finally { setBusy(false) }
  }

  async function changeStatus(id: string, status: 'acknowledged' | 'resolved') {
    if (busy || !canWrite) return
    setBusy(true); setMessage(''); setError('')
    try {
      await postSecure(`/api/v1/incidents/${id}/status`, { status })
      await qc.invalidateQueries({ queryKey: ['incidents', siteId] })
      setMessage(status === 'resolved' ? 'گزارش بسته شد.' : 'بررسی گزارش ثبت شد.')
    } catch { setError('تغییر وضعیت ناموفق بود؛ ممکن است گزارش قبلاً تغییر کرده باشد.') }
    finally { setBusy(false) }
  }

  return <div className="page" dir="rtl">
    <div className="page-eyebrow">OPERATIONS / MANUAL INCIDENTS</div>
    <div className="page-heading"><div>
      <h1>رویدادها و گزارش‌های دستی</h1>
      <p>این فهرست فقط گزارش‌های ثبت‌شده توسط اپراتور است. اتصال پایش زنده و تشخیص خودکار اختلال هنوز فعال نیست.</p>
    </div><Badge tone="unknown">بدون مانیتورینگ زنده</Badge></div>
    <section className="surface-card data-section">
      <div className="section-heading"><div><h2>گزارش‌های سایت</h2>
        <p>فیلتر و صفحه‌بندی در سرور انجام می‌شود؛ مشاهده اطلاعات فقط در سایت مجاز ممکن است.</p>
      </div></div>
      {session.data?.role === 'admin' && <div className="access-form">
        <label>سایت موجود
          <select aria-label="سایت رویدادها" value={siteId}
            onChange={e => { setSelectedSite(e.target.value); setPage(1) }}>
            {!siteId && <option value="">انتخاب سایت موجود</option>}
            {sites.data?.sites.map(site => <option key={site} value={site}>{site}</option>)}
          </select>
        </label>
      </div>}
      <div className="access-form"><label>فیلتر وضعیت
        <select aria-label="فیلتر وضعیت رویدادها" value={filter} onChange={e => {
          setFilter(e.target.value as IncidentStatus | 'all'); setPage(1)
        }}>
          <option value="all">همه</option>
          <option value="open">باز</option>
          <option value="acknowledged">بررسی‌شده</option>
          <option value="resolved">بسته‌شده</option>
        </select>
      </label></div>
      {!siteId && <p>برای مشاهده گزارش‌ها سایت را انتخاب کنید.</p>}
      {canWrite && <form className="access-form" onSubmit={e => void submit(e)}>
        <strong>ثبت گزارش دستی اختلال</strong>
        <label>عنوان<input aria-label="عنوان گزارش اختلال" maxLength={240} required
          value={title} onChange={e => setTitle(e.target.value)}/></label>
        <label>شرح<textarea aria-label="شرح گزارش اختلال" maxLength={1000}
          value={description} onChange={e => setDescription(e.target.value)}/></label>
        <label>شدت<select aria-label="شدت گزارش" value={severity}
          onChange={e => setSeverity(e.target.value as IncidentSeverity)}>
          {Object.entries(severityText).map(([value, label]) =>
            <option key={value} value={value}>{label}</option>)}
        </select></label>
        <Button type="submit" disabled={busy || !siteId}>ثبت گزارش دستی</Button>
      </form>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {incidents.isError && <p role="alert">دریافت رویدادها از API ناموفق بود.</p>}
      {incidents.isPending && siteId && <p>در حال دریافت گزارش‌ها…</p>}
      {incidents.data && <>
        <div className="access-table-wrapper"><table className="access-table">
          <thead><tr><th>گزارش</th><th>شدت</th><th>وضعیت</th>
            <th>ثبت‌کننده</th><th>زمان ثبت</th><th>عملیات</th></tr></thead>
          <tbody>{incidents.data.items.map(item => <tr key={item.id}>
            <td><strong>{item.title}</strong>
              {item.description && <p>{item.description}</p>}</td>
            <td>{severityText[item.severity]}</td>
            <td>{statusText[item.status]} · دستی</td>
            <td dir="ltr">{item.createdBy}</td>
            <td>{new Date(item.createdAtUtc).toLocaleString('fa-IR')}</td>
            <td>{canWrite && item.status === 'open' && <Button size="sm" variant="secondary"
              disabled={busy} onClick={() => void changeStatus(item.id, 'acknowledged')}>
              ثبت بررسی</Button>}
              {canWrite && item.status !== 'resolved' && <Button size="sm"
                disabled={busy} onClick={() => void changeStatus(item.id, 'resolved')}>
                بستن گزارش</Button>}</td>
          </tr>)}</tbody>
        </table></div>
        {incidents.data.total === 0 && <p>گزارشی برای این سایت و وضعیت ثبت نشده است.</p>}
        <div className="access-pagination">
          <span>صفحه {incidents.data.page} · مجموع {incidents.data.total.toLocaleString('fa-IR')}</span>
          <Button size="sm" variant="secondary" disabled={page <= 1}
            onClick={() => setPage(x => x - 1)}>قبلی</Button>
          <Button size="sm" variant="secondary" disabled={page * 25 >= incidents.data.total}
            onClick={() => setPage(x => x + 1)}>بعدی</Button>
        </div>
      </>}
    </section>
  </div>
}