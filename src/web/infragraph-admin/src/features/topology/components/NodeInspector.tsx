import { Copy, ExternalLink, HardDrive, Info, Network, ShieldCheck, X, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import type { Device } from '../model/topology'
import { stateLabels } from '../model/topology'
import { DeviceGlyph } from './DeviceGlyph'
import { kindNames } from '../model/device-labels'
import './inspector-links.css'
import { AgentInspectorStatus } from './AgentInspectorStatus'

export type InspectedLink = {
  id: string
  peerName: string
  localPort: string | null
  remotePort: string | null
  protocol: string
  corroboration: string | null
  verifiedLldp: boolean
}
type Props = { device: Device | null; connections: number; links?: readonly InspectedLink[];
  possibleDependents?: number; onClose: () => void; demo?: boolean }

const tones = { healthy: 'success', warning: 'warning', critical: 'danger', unknown: 'unknown' } as const

export function NodeInspector({ device, connections, links = [], possibleDependents = 0, onClose, demo = false }: Props) {
  const [copied, setCopied] = useState(false)
  if (!device) return (
    <aside className="topology-inspector" aria-label="پنل جزئیات نود">
      <div className="inspector-topbar"><span>جزئیات تجهیز</span><span className="inspector-placeholder-status">NO SELECTION</span></div>
      <div className="inspector-empty">
        <div className="inspector-empty-icon"><Network size={28} strokeWidth={1.4} /></div>
        <strong>یک نود را انتخاب کنید</strong>
        <p>با انتخاب تجهیزات روی نقشه، وضعیت، موقعیت و مشخصات ارتباط آن‌ها در این بخش نمایش داده می‌شود.</p>
      </div>
      <div className="inspector-footer"><Info size={15} /> برای جزئیات، یک نود را از SVG انتخاب کنید. نوع و وضعیت تجهیزات فقط بر اساس شواهد موجود است.</div>
    </aside>
  )
  return (
    <aside className="topology-inspector" aria-label={`جزئیات نود ${device.name}`} data-testid="node-inspector">
      <div className="inspector-topbar"><span>مشخصات تجهیز</span><Button size="icon" variant="ghost" onClick={onClose} aria-label="بستن جزئیات"><X size={17} /></Button></div>
      <div className="inspector-device-head">
        <div className="inspector-kind-icon inspector-kind-icon--equipment"><DeviceGlyph kind={device.kind} controlPlane={device.role === 'collector' || device.controlPlane === true}/></div>
        <div><span className="inspector-overline">{device.kind.toUpperCase()}</span><h2 dir="ltr">{device.name}</h2><p>{device.title} · {device.role === 'collector' ? 'مرکز کشف شبکه' : kindNames[device.kind]}</p></div>
      </div>
      <div className="inspector-status-row">
        <Badge tone={tones[device.state]}>{stateLabels[device.state]} · {demo ? 'نمونه آزمایشی' : 'بر اساس شواهد موجود'}</Badge>
      </div>
      {device.agent && !demo && <AgentInspectorStatus agent={device.agent}/>}
      {possibleDependents > 0 && <div className="inspector-hypothesis" data-testid="inspector-impact-hypothesis">
        <div><AlertTriangle size={17}/><strong>فرضیه اختلال مشترک · نیازمند تأیید</strong></div>
        <p>این سوئیچ در نمونه آموزشی بحرانی است و {possibleDependents} دستگاه پایین‌دست وضعیت «نامشخص» دارند. ممکن است علت، سوئیچ، لینک بالادستی یا اختلال در سیستم جمع‌آوری داده باشد. وضعیت نامشخص به معنی قطع قطعی رایانه‌ها نیست.</p>
      </div>}
      <div className="inspector-section">
        <div className="inspector-section-heading"><HardDrive size={15} aria-hidden="true" /> اطلاعات دستگاه</div>
        <dl className="inspector-dl">
          <div><dt>آدرس IP</dt><dd className="inspector-ip"><span className="numeric">{device.address}</span><Button variant="ghost" size="icon" aria-label="کپی آدرس IP" onClick={() => { void navigator.clipboard?.writeText(device.address).then(() => setCopied(true)).catch(() => setCopied(false)) }}><Copy size={14}/></Button></dd></div>
          <div><dt>سایت / موقعیت</dt><dd>{device.site}</dd></div>
          <div><dt>نوع دستگاه</dt><dd className="ltr">{device.kind}</dd></div>
          <div><dt>مدل / سازنده</dt><dd dir="ltr">{device.vendor}</dd></div>
          <div><dt>پورت‌های TCP پاسخ‌گو</dt><dd className="numeric">{device.port}</dd></div>
          <div><dt>تعداد لینک</dt><dd className="numeric">{connections}</dd></div>
        </dl>
        {copied && <p className="inspector-copy-msg" role="status">آدرس IP کپی شد.</p>}
      </div>
      <div className="inspector-section inspector-link-evidence">
        <div className="inspector-section-heading"><Network size={15} aria-hidden="true" />
          اتصالات ثبت‌شده و پورت‌ها</div>
        {links.length === 0
          ? <p className="inspector-link-empty">
              برای این نود هنوز شاهد LLDP یا گزارش ارتباط دستی موجود نیست.
              عضو یک CIDR بودن، اتصال کابل یا سوئیچ را اثبات نمی‌کند.
            </p>
          : <div className="inspector-link-list">
            {links.map(link => <article className="inspector-link-card" key={link.id}>
              <div className="inspector-link-top">
                <strong dir="ltr">{link.peerName}</strong>
                <span className={link.verifiedLldp ? 'inspector-link-tag inspector-link-tag--lldp' : 'inspector-link-tag'}>
                  {link.verifiedLldp
                    ? link.corroboration === 'reciprocal' ? 'LLDP دوطرفه'
                      : link.corroboration === 'ambiguous-port' ? 'پورت مبهم'
                      : link.corroboration === 'unresolved' ? 'همسایه حل‌نشده'
                      : 'LLDP یک‌طرفه'
                    : 'گزارش دستی؛ تأییدنشده'}
                </span>
              </div>
              <div className="inspector-link-ports">
                <span>پورت این نود: <code dir="ltr">{link.localPort || 'نامشخص'}</code></span>
                <span>پورت همسایه: <code dir="ltr">{link.remotePort || 'نامشخص'}</code></span>
              </div>
              {!link.verifiedLldp && <small>
                این ارتباط از شبکه تأیید نشده و ممکن است منقضی یا پس گرفته شود.
              </small>}
            </article>)}
          </div>}
        {links.length >= 24 && <p className="inspector-link-empty">
          فقط ۲۴ لینک اول نمایش داده می‌شود؛ برای همهٔ روابط از نقشه استفاده کنید.
        </p>}
      </div>
      <div className="inspector-section">
        <div className="inspector-section-heading"><Network size={15} aria-hidden="true" /> تحلیل ارتباط</div>
        <p className="inspector-note">{device.description}</p>
      </div>
      <div className="inspector-section">
        <div className="inspector-section-heading"><ShieldCheck size={15} aria-hidden="true" /> منبع شواهد</div>
        <div className="inspector-evidence"><Info size={16} aria-hidden="true" />{device.evidence}</div>
      </div>
      <div className="inspector-footer"><ExternalLink size={14} /> کنترل و Remote Access هنوز پیاده‌سازی نشده‌اند.</div>
    </aside>
  )
}