import { useQuery } from '@tanstack/react-query'
import { Button } from '../../../shared/ui/Button'
import { getAgentInventory } from '../api/agents'

function gb(bytes: number): string {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 })
    .format(bytes / 1024 ** 3) + ' گیگابایت'
}

export default function AgentInventoryDetails({ agentId, onClose }: {
  agentId: string; onClose: () => void
}) {
  const query = useQuery({
    queryKey: ['agents', 'inventory', agentId],
    queryFn: ({ signal }) => getAgentInventory(agentId, signal),
    retry: false,
  })
  return <section className="surface-card data-section" aria-label="جزئیات سخت‌افزاری Agent">
    <div className="section-heading">
      <div><h2>شناسنامه Agent</h2>
        <p>اطلاعات گزارش‌شده توسط خود دستگاه؛ وضعیت قطعات مستقلاً تأیید نشده است.</p>
      </div>
      <Button type="button" onClick={onClose} variant="secondary">بستن</Button>
    </div>
    {query.isPending && <p>در حال دریافت اطلاعات سیستم…</p>}
    {query.isError && <p role="alert">دریافت Inventory این Agent ناموفق بود یا دسترسی به آن مجاز نیست.</p>}
    {query.data && (() => {
      const { inventory, evidenceStatus, receivedAtUtc } = query.data
      return <>
        <div className="access-form">
          <p><strong>نام سیستم:</strong> {inventory.hostName}</p>
          <p><strong>سیستم‌عامل:</strong> {inventory.osVersion}</p>
          <p><strong>CPU:</strong> {inventory.cpuName} ({inventory.logicalProcessors.toLocaleString('fa-IR')} پردازنده منطقی)</p>
          <p><strong>RAM:</strong> {gb(inventory.ramTotalBytes)}</p>
          <p><strong>آخرین دریافت:</strong> {new Date(receivedAtUtc).toLocaleString('fa-IR')}
            {' — '}{evidenceStatus === 'recent' ? 'گزارش اخیر' : 'گزارش قدیمی'}</p>
        </div>

        <h3>کارت گرافیک ({inventory.gpus.length.toLocaleString('fa-IR')})</h3>
        {inventory.gpus.length === 0 ? <p>داده‌ای برای کارت گرافیک گزارش نشده است.</p> :
          <ul>{inventory.gpus.map((gpu, index) =>
            <li key={index}>{gpu.name}{gpu.driverVersion ? ' — Driver: ' + gpu.driverVersion : ''}</li>
          )}</ul>}

        <h3>دیسک‌ها ({inventory.disks.length.toLocaleString('fa-IR')})</h3>
        <div className="access-table-wrapper"><table className="access-table">
          <thead><tr><th>درایو</th><th>حجم کل</th><th>فضای آزاد</th><th>فرمت</th></tr></thead>
          <tbody>{inventory.disks.map((disk, index) =>
            <tr key={index}><td dir="ltr">{disk.name}</td><td>{gb(disk.totalBytes)}</td>
              <td>{gb(disk.freeBytes)}</td><td>{disk.fileSystem ?? '—'}</td></tr>
          )}</tbody>
        </table></div>

        <h3>آداپتورهای شبکه ({inventory.networks.length.toLocaleString('fa-IR')})</h3>
        <div className="access-table-wrapper"><table className="access-table">
          <thead><tr><th>نام</th><th>MAC</th><th>IPها</th><th>وضعیت</th></tr></thead>
          <tbody>{inventory.networks.map((network, index) =>
            <tr key={index}><td>{network.name}</td>
              <td dir="ltr">{network.macAddress ?? '—'}</td>
              <td dir="ltr">{network.ipAddresses.join(', ') || '—'}</td>
              <td>{network.status}</td></tr>
          )}</tbody>
        </table></div>

        <details>
          <summary>دستگاه‌های متصل و PnP ({inventory.devices.length.toLocaleString('fa-IR')})</summary>
          <div className="access-table-wrapper"><table className="access-table">
            <thead><tr><th>نام</th><th>نوع</th><th>Instance ID</th></tr></thead>
            <tbody>{inventory.devices.slice(0, 100).map((device, index) =>
              <tr key={index}><td>{device.name}</td><td>{device.deviceClass ?? '—'}</td>
                <td dir="ltr">{device.instanceId ?? '—'}</td></tr>
            )}</tbody>
          </table></div>
          {inventory.devices.length > 100 &&
            <p>برای جلوگیری از سنگین‌شدن صفحه، فقط ۱۰۰ مورد نخست نمایش داده شده است.</p>}
        </details>
      </>
    })()}
  </section>
}
