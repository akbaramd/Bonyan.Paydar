import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { z } from 'zod'
import { getJson } from '../../../shared/api/http'
import type { Device } from '../model/topology'

const agentDetailsSchema = z.object({
  agentId: z.string().uuid(),
  siteId: z.string(),
  receivedAtUtc: z.string(),
  inventory: z.object({
    hostName: z.string(),
    osVersion: z.string(),
    cpuName: z.string(),
    logicalProcessors: z.number().int().nonnegative(),
    ramTotalBytes: z.number().nonnegative(),
    agentVersion: z.string(),
    gpus: z.array(z.object({ name: z.string() })),
    disks: z.array(z.object({ name: z.string(), totalBytes: z.number().nonnegative(), freeBytes: z.number().nonnegative() })),
    networks: z.array(z.object({ name: z.string(), ipAddresses: z.array(z.string()), status: z.string() })),
    devices: z.array(z.object({ name: z.string() })),
  }),
})

type Props = { agent: NonNullable<Device['agent']> }

const statusText = {
  recent: 'گزارش اخیر دریافت شده',
  stale: 'ارتباط اخیر تأیید نشده',
  revoked: 'دسترسی Agent لغو شده',
} as const

const decimal = (value: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value)
const giga = (value: number) => decimal(value / (1024 ** 3)) + ' GB'

export function AgentInspectorStatus({ agent }: Props) {
  const report = useQuery({
    queryKey: ['topology', 'agent-hardware', agent.id],
    queryFn: ({ signal }) => getJson(
      `/api/v1/agents/${encodeURIComponent(agent.id)}/inventory`, agentDetailsSchema, signal),
    staleTime: 30_000,
    retry: false,
  })

  return <section className="inspector-section" data-testid="agent-inspector">
    <div className="inspector-section-heading">پایدار Agent · مدیریت نقطه پایانی</div>
    <div className="ig-agent-status">
      <div className="ig-agent-status-header">
        <strong className="ig-agent-status-title">Windows Agent</strong>
        <span className={`ig-agent-status-indicator ig-agent-status-indicator--${agent.status}`}
          data-testid="agent-connection-status">{statusText[agent.status]}</span>
      </div>
      <p className="ig-agent-status-description">
        آخرین دریافت Inventory ملاک این وضعیت است؛ نه Ping، روشن‌بودن سیستم یا سلامت سخت‌افزار.
      </p>
      <dl>
        <div><dt>آخرین ارتباط</dt><dd>{new Date(agent.lastSeenAtUtc).toLocaleString('fa-IR')}</dd></div>
        <div><dt>نسخه Agent</dt><dd dir="ltr">{agent.version ?? 'نامشخص'}</dd></div>
        <div><dt>Agent ID</dt><dd dir="ltr">{agent.id}</dd></div>
      </dl>
      {report.isPending && <p className="ig-agent-status-description" role="status">در حال دریافت اطلاعات سخت‌افزار…</p>}
      {report.isError && <p className="ig-agent-status-description" role="alert">
        جزئیات سخت‌افزار در دسترس نیست؛ وضعیت ارتباط از آخرین مشاهده قبلی نمایش داده می‌شود.
      </p>}
      {report.data && <div>
        <div className="ig-agent-specs">
          <div className="ig-agent-spec"><span>پردازنده</span><strong>{report.data.inventory.cpuName}</strong></div>
          <div className="ig-agent-spec"><span>حافظه RAM</span><strong>{giga(report.data.inventory.ramTotalBytes)}</strong></div>
          <div className="ig-agent-spec"><span>گرافیک</span><strong>{decimal(report.data.inventory.gpus.length)} کارت</strong></div>
          <div className="ig-agent-spec"><span>تجهیزات متصل</span><strong>{decimal(report.data.inventory.devices.length)} دستگاه PnP</strong></div>
          <div className="ig-agent-spec"><span>دیسک‌ها</span><strong>{decimal(report.data.inventory.disks.length)} درایو</strong></div>
          <div className="ig-agent-spec"><span>رابط‌های شبکه</span><strong>{decimal(report.data.inventory.networks.length)} رابط</strong></div>
        </div>
        <p className="ig-agent-status-description">{report.data.inventory.osVersion}</p>
      </div>}
      <Link className="ig-agent-details-link" to="/agents">مدیریت و شناسنامه کامل Agent</Link>
    </div>
  </section>
}
