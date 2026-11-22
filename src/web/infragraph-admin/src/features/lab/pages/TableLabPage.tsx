import { useDeferredValue, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Filter, Search, ShieldAlert } from 'lucide-react'
import { Badge, type Tone } from '../../../shared/ui/Badge'
import { DataGrid } from '../../../shared/ui/DataGrid'
import { demoSites, filterDemoAssets, generateDemoAssets, type DemoAsset, type DemoAssetStatus } from '../lib/demo-assets'

const statuses: Record<DemoAssetStatus, { title: string; tone: Tone }> = {
  healthy: { title: 'سالم (نمونه)', tone: 'success' },
  degraded: { title: 'اختلال (نمونه)', tone: 'warning' },
  down: { title: 'قطع (نمونه)', tone: 'danger' },
  unknown: { title: 'نامشخص (نمونه)', tone: 'unknown' },
}

const columns: ColumnDef<DemoAsset>[] = [
  { accessorKey: 'name', header: 'نام نود', size: 218, cell: (ctx) => <strong className="cell-strong">{ctx.getValue<string>()}</strong> },
  { accessorKey: 'ip', header: 'IP Address', size: 168, cell: (ctx) => <span className="numeric">{ctx.getValue<string>()}</span> },
  { accessorKey: 'type', header: 'نوع تجهیز', size: 156 },
  { accessorKey: 'site', header: 'موقعیت', size: 183 },
  { accessorKey: 'status', header: 'وضعیت', size: 168, cell: (ctx) => { const status = statuses[ctx.getValue<DemoAssetStatus>()]; return <Badge tone={status.tone}>{status.title}</Badge> } },
  { accessorKey: 'seenAt', header: 'زمان آخرین مشاهده', size: 210, cell: (ctx) => <time className="numeric" dateTime={ctx.getValue<string>()}>{ctx.getValue<string>().slice(0, 16).replace('T', ' ')}</time> },
]

const testAssets = generateDemoAssets(12_000)

export default function TableLabPage() {
  const [search, setSearch] = useState('')
  const [site, setSite] = useState('all')
  const [status, setStatus] = useState('all')
  const deferredSearch = useDeferredValue(search)
  const data = useMemo(() => filterDemoAssets(testAssets, deferredSearch, site, status), [deferredSearch, site, status])

  return (
    <div className="page">
      <div className="page-eyebrow">DESIGN LAB / DATA GRID</div>
      <div className="page-heading"><div><h1>آزمایشگاه جدول‌های حجیم</h1><p>بررسی عملکرد، فیلترها، مرتب‌سازی، ستون‌ها و پیمایش در دسکتاپ و تبلت.</p></div><Badge tone="warning"><ShieldAlert size={13} /> ۱۲٬۰۰۰ ردیف ساختگی</Badge></div>
      <div className="inline-alert" role="note"><Filter size={18} aria-hidden="true" /><span>تمام این ردیف‌ها دادهٔ <strong>مصنوعی و محلی</strong> هستند و هیچ دستگاهی از شبکه شما را نشان نمی‌دهند. برای داده‌های عملیاتی حجیم، فیلتر و مرتب‌سازی باید در PostgreSQL/API انجام شود.</span></div>
      <section className="surface-card data-section" aria-labelledby="lab-title">
        <div className="section-heading"><div><span className="panel-eyebrow">TANSTACK TABLE + VIRTUAL</span><h2 id="lab-title">داده‌های تجهیزات آزمایشی</h2><p>تنها ردیف‌های قابل مشاهده رندر می‌شوند. وضعیت فیلتر و مرتب‌سازی برای این نمونه در مرورگر نگهداری می‌شود.</p></div></div>
        <div className="table-filters">
          <label className="field field--search"><span>جست‌وجوی تجهیز یا IP</span><span className="field-input-shell"><Search size={16} aria-hidden="true" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="نام تجهیز، IP یا نوع" /></span></label>
          <label className="field"><span>سایت</span><select value={site} onChange={(e) => setSite(e.target.value)}><option value="all">همه سایت‌ها</option>{demoSites.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="field"><span>وضعیت</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">همه وضعیت‌ها</option><option value="healthy">سالم</option><option value="degraded">دارای اختلال</option><option value="unknown">نامشخص</option><option value="down">قطع</option></select></label>
        </div>
        <DataGrid<DemoAsset> label="داده‌های آزمایشی تجهیزات شبکه" columns={columns} data={data} getRowId={(row) => row.id} emptyMessage="هیچ ردیف آزمایشی با فیلترهای فعلی مطابقت ندارد." />
      </section>
      <p className="page-footnote">این صفحه ابزار ارزیابی UI است؛ قابلیت ذخیره یا ارسال رویداد شبکه در آن وجود ندارد.</p>
    </div>
  )
}
