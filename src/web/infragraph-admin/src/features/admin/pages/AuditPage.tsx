import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { getJson } from '../../../shared/api/http'
import { useSession } from '../../../shared/auth/session'

const schema = z.object({
  page: z.number().int().positive(), pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.string().uuid(), actor: z.string(), action: z.string(),
    target: z.string(), success: z.boolean(), atUtc: z.string(),
  })),
})

export default function AuditPage() {
  const user = useSession()
  const [page, setPage] = useState(1)
  const result = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: ({ signal }) => getJson(`/api/v1/admin/audit?page=${page}&pageSize=25`, schema, signal),
    enabled: user.data?.role === 'admin', retry: false,
  })
  if (user.data?.role !== 'admin') return <section role="alert">دسترسی مدیر لازم است.</section>
  return <section className="access-admin" dir="rtl">
    <h1>رویدادهای امنیتی</h1>
    <p>تاریخچه تغییرات کاربران و تلاش‌های ورود. فقط برای مدیر قابل مشاهده است.</p>
    {result.isPending && <p>در حال دریافت…</p>}
    {result.isError && <p role="alert">دریافت تاریخچه از سرور ناموفق بود.</p>}
    {result.data && <>
      <div className="access-table-wrapper">
        <table className="access-table">
          <thead><tr><th>زمان</th><th>عامل</th><th>عملیات</th><th>هدف</th><th>نتیجه</th></tr></thead>
          <tbody>{result.data.items.map(item => <tr key={item.id}>
            <td dir="ltr">{new Date(item.atUtc).toLocaleString('en-GB')}</td>
            <td dir="ltr">{item.actor}</td>
            <td dir="ltr">{item.action}</td>
            <td dir="ltr">{item.target}</td>
            <td>{item.success ? 'موفق' : 'ناموفق'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!result.data.items.length && <p>هنوز رویدادی وجود ندارد.</p>}
      <nav className="access-pagination" aria-label="صفحه‌بندی رویدادها">
        <span>صفحه {page} · مجموع {result.data.total.toLocaleString('fa-IR')} رویداد</span>
        <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>قبلی</button>
        <button type="button" disabled={page * 25 >= result.data.total} onClick={() => setPage(p => p + 1)}>بعدی</button>
      </nav>
    </>}
  </section>
}
