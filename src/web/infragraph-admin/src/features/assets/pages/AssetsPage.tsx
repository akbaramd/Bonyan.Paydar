import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes } from 'lucide-react'
import { Link } from 'react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { DataGrid } from '../../../shared/ui/DataGrid'
import { postSecure, useSession } from '../../../shared/auth/session'
import { getAssets, getSites } from '../api/assets'

type Row = { id: string; name: string; site: string; state: string; registeredAt: string }
const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'شناسه/نام دستگاه', size: 260 },
  { accessorKey: 'site', header: 'سایت', size: 170 },
  { accessorKey: 'state', header: 'وضعیت شناسایی', size: 190 },
  { accessorKey: 'registeredAt', header: 'ثبت در سامانه', size: 180 },
]

export default function AssetsPage() {
  const session = useSession()
  const qc = useQueryClient()
  const [selectedSite, setSelectedSite] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const sites = useQuery({
    queryKey: ['sites'], queryFn: ({ signal }) => getSites(signal),
    enabled: Boolean(session.data), staleTime: 30_000,
  })
  const siteId = session.data?.role === 'admin'
    ? sites.data?.sites.includes(selectedSite) ? selectedSite : sites.data?.sites.includes('lan') ? 'lan' : sites.data?.sites[0] ?? ''
    : session.data?.siteId ?? ''
  const assets = useQuery({
    queryKey: ['assets', siteId, term, page],
    queryFn: ({ signal }) => getAssets(siteId, term, page, signal),
    enabled: Boolean(session.data && siteId), retry: false,
  })
  const rows: Row[] = assets.data?.items.map(item => ({
    id: item.id, name: item.displayName ?? 'بدون نام', site: item.siteId,
    state: 'ثبت دستی · سلامت نامشخص',
    registeredAt: new Date(item.createdAtUtc).toLocaleString('fa-IR'),
  })) ?? []

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      await postSecure('/api/v1/assets', { siteId, displayName: name.trim() })
      setName('')
      setPage(1)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['assets'] }),
        qc.invalidateQueries({ queryKey: ['sites'] }),
        qc.invalidateQueries({ queryKey: ['overview'] }),
      ])
      setMessage('دستگاه به‌صورت دستی و تأییدنشده ثبت شد.')
    } catch { setMessage('ثبت دستگاه ناموفق بود؛ نشست، مجوز سایت یا اتصال API را بررسی کنید.') }
    finally { setBusy(false) }
  }

  return <div className="page">
    <div className="page-eyebrow">INVENTORY / ASSETS</div>
    <div className="page-heading">
      <div><h1>موجودی تجهیزات</h1><p>ثبت دستی تجهیزات، بدون ادعای کشف یا تأیید سلامت شبکه.</p></div>
      <Badge tone="unknown">داده ثبت‌شده · تأییدنشده</Badge>
    </div>
    <section className="surface-card data-section">
      <div className="section-heading">
        <div><h2>دستگاه‌های سایت</h2><p>داده‌ها از API صفحه‌بندی‌شده و با محدودیت سایت کاربر دریافت می‌شوند.</p></div>
        {import.meta.env.DEV && <Button asChild variant="secondary"><Link to="/lab/data-grid"><Boxes size={16}/> آزمایشگاه جدول</Link></Button>}
      </div>
      <div className="access-form" dir="rtl">
        {session.data?.role === 'admin' && <label>سایت موجود
          <select aria-label="سایت موجودی" value={siteId}
            onChange={e => { setSelectedSite(e.target.value); setPage(1) }}>
            {!siteId && <option value="">انتخاب سایت موجود</option>}
            {sites.data?.sites.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>}
        <label>جست‌وجوی نام دستگاه
          <input aria-label="جست‌وجوی موجودی" maxLength={100} value={term}
            onChange={e => { setTerm(e.target.value); setPage(1) }} />
        </label>
      </div>
      {session.data && session.data.role !== 'viewer' && <form className="access-form" dir="rtl" onSubmit={(e) => void submit(e)}>
        <label>نام دستگاه برای ثبت دستی
          <input aria-label="نام دستگاه جدید" maxLength={240} required value={name}
            onChange={e => setName(e.target.value)}/>
        </label>
        <Button type="submit" disabled={busy || !siteId}>ثبت تجهیز</Button>
      </form>}
      {message && <p role="status">{message}</p>}
      {assets.isError && <p role="alert">دریافت موجودی از API ناموفق بود.</p>}
      {!siteId && <p>برای مشاهده یا ثبت تجهیزات، شناسه سایت را مشخص کنید.</p>}
      <DataGrid<Row> label="فهرست تجهیزات" data={rows} columns={columns}
        getRowId={row => row.id} emptyMessage={assets.isPending && siteId
          ? 'در حال دریافت تجهیزات…' : 'در این سایت تجهیزی ثبت نشده است؛ این به معنی سالم بودن شبکه نیست.'} />
      {assets.data && <div className="access-pagination" dir="rtl">
        <span>صفحه {assets.data.page} · مجموع {assets.data.total.toLocaleString('fa-IR')} دستگاه</span>
        <Button size="sm" variant="secondary" disabled={page <= 1}
          onClick={() => setPage(x => x - 1)}>قبلی</Button>
        <Button size="sm" variant="secondary" disabled={page * 25 >= assets.data.total}
          onClick={() => setPage(x => x + 1)}>بعدی</Button>
      </div>}
    </section>
  </div>
}