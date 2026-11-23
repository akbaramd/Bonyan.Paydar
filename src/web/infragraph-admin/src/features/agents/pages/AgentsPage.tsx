import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { getJson } from '../../../shared/api/http'
import { useSession } from '../../../shared/auth/session'
import { getAgents, getAgentCapabilities } from '../api/agents'
import AgentApprovalForm from './AgentApprovalForm'

const sitesSchema = z.object({ sites: z.array(z.string()) })

export default function AgentsPage() {
  const session = useSession()
  const [selectedSite, setSelectedSite] = useState('')
  const [page, setPage] = useState(1)
  const sites = useQuery({
    queryKey: ['sites'], queryFn: ({ signal }) => getJson('/api/v1/sites', sitesSchema, signal),
    enabled: session.data?.role === 'admin', retry: false,
  })
  const siteId = session.data?.role === 'admin'
    ? sites.data?.sites.includes(selectedSite) ? selectedSite : sites.data?.sites.includes('lan') ? 'lan' : sites.data?.sites[0] ?? ''
    : session.data?.siteId ?? ''
  const agents = useQuery({
    queryKey: ['agents', siteId, page],
    queryFn: ({ signal }) => getAgents(siteId, page, signal),
    enabled: Boolean(session.data && siteId), retry: false,
  })
  const caps = useQuery({
    queryKey: ['agents', 'capabilities'],
    queryFn: ({ signal }) => getAgentCapabilities(signal),
    enabled: Boolean(session.data), retry: false,
  })

  return <div className="page" dir="rtl">
    <div className="page-eyebrow">AGENT REGISTRY / INVENTORY</div>
    <div className="page-heading"><div>
      <h1>Agentها</h1>
      <p>فهرست Agentهای ثبت‌شده و آخرین گزارش واقعی دستگاه‌ها؛ وضعیت اخیر به معنی سلامت قطعی سیستم نیست.</p>
    </div><Badge tone="unknown">نسخه آزمایشی</Badge></div>
    <section className="surface-card data-section">
      <div className="section-heading"><div>
        <h2>وضعیت اتصال AgentGateway</h2>
        <p>تأیید دستی گواهی دستگاه فعال است. دریافت Inventory نیازمند Gateway پیکربندی‌شده و گواهی معتبر است.</p>
      </div></div>
      {caps.isError && <p role="alert">دریافت قابلیت‌های Gateway از API ناموفق بود.</p>}
      {caps.data && <p role="status">ثبت خودکار: غیرفعال · تأیید دستی: فعال · به‌روزرسانی امضاشده: غیرفعال</p>}
    </section>
    {session.data?.role === 'admin' && <AgentApprovalForm />}
    <section className="surface-card data-section">
      <div className="section-heading"><div><h2>نصب‌های ثبت‌شده</h2>
        <p>فقط رکوردهای سایت مجاز از PostgreSQL نمایش داده می‌شوند.</p></div></div>
      {session.data?.role === 'admin' && <div className="access-form"><label>محدودهٔ مدیریتی
        <select aria-label="سایت Agentها" value={siteId}
          onChange={event => { setSelectedSite(event.target.value); setPage(1) }}>
          {!siteId && <option value="">انتخاب سایت موجود</option>}
          {sites.data?.sites.map(site => <option key={site} value={site}>{site}</option>)}
        </select>
      </label></div>}
      {!siteId && <p>برای مشاهده Agentها سایت را انتخاب کنید.</p>}
      {agents.isError && <p role="alert">دریافت فهرست Agentها ناموفق بود.</p>}
      {agents.isPending && siteId && <p>در حال بارگذاری Agentها…</p>}
      {agents.data && <>
        <div className="access-table-wrapper"><table className="access-table">
          <thead><tr><th>شناسه Agent</th><th>سایت</th><th>نسخه</th>
            <th>آخرین دریافت ثبت‌شده</th><th>ارزیابی</th></tr></thead>
          <tbody>{agents.data.items.map(agent => <tr key={agent.agentId}>
            <td dir="ltr">{agent.agentId}</td><td>{agent.siteId}</td>
            <td dir="ltr">{agent.agentVersion}</td>
            <td>{agent.lastReceivedAtUtc
              ? new Date(agent.lastReceivedAtUtc).toLocaleString('fa-IR')
              : 'هیچ داده‌ای ثبت نشده'}</td>
            <td>{agent.evidenceStatus === "revoked" ? "گواهی لغو شده" :
              agent.evidenceStatus === "recent" ? "گزارش اخیر دریافت شده" :
                agent.evidenceStatus === "stale" ? "گزارش قدیمی" : "منتظر نخستین گزارش"}</td>
          </tr>)}</tbody>
        </table></div>
        {agents.data.total === 0 && <p>Agent ثبت‌شده‌ای برای این سایت وجود ندارد.</p>}
        <div className="access-pagination">
          <span>صفحه {agents.data.page} · مجموع {agents.data.total.toLocaleString('fa-IR')}</span>
          <Button size="sm" variant="secondary" disabled={page <= 1}
            onClick={() => setPage(x => x - 1)}>قبلی</Button>
          <Button size="sm" variant="secondary" disabled={page * 25 >= agents.data.total}
            onClick={() => setPage(x => x + 1)}>بعدی</Button>
        </div>
      </>}
    </section>
  </div>
}