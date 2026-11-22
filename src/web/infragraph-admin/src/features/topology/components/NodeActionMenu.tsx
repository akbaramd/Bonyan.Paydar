import { DropdownMenu } from 'radix-ui'
import { Crosshair, Info, Network, Radar, Copy, GitBranch } from 'lucide-react'
import type { Device } from '../model/topology'
import './node-diagnostics.css'

export type NodeMenuTarget = { id: string; x: number; y: number }
export type DiagnosticKind = 'ping' | 'traceroute'

export function NodeActionMenu({ target, device, canDiagnose, onClose, onInspect, onFocus, onReportLink, onDiagnose, canReportLink }: {
  target: NodeMenuTarget | null
  device: Device | null
  canDiagnose: boolean
  canReportLink: boolean
  onClose: () => void
  onInspect: () => void
  onFocus: () => void
  onReportLink: () => void
  onDiagnose: (kind: DiagnosticKind) => void
}) {
  return <DropdownMenu.Root open={Boolean(target && device)}
    onOpenChange={open => { if (!open) onClose() }} modal={false} dir="rtl">
    <DropdownMenu.Trigger asChild>
      <button type="button" tabIndex={-1} aria-label="عملیات نود"
        className="node-context-anchor" style={{ left: target?.x ?? -100, top: target?.y ?? -100 }}/>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content side="bottom" align="start" sideOffset={4}
        className="node-context-content" aria-label="عملیات نود">
        <div className="node-context-heading">
          <strong dir="ltr">{device?.name ?? ''}</strong>
          <small dir="ltr">{device?.address ?? ''}</small>
        </div>
        <DropdownMenu.Item className="node-context-item" onSelect={onInspect}>
          <Info size={16}/> مشاهدهٔ مشخصات
        </DropdownMenu.Item>
        <DropdownMenu.Item className="node-context-item" onSelect={onFocus}>
          <Crosshair size={16}/> تمرکز روی نود
        </DropdownMenu.Item>
        <DropdownMenu.Item className="node-context-item" disabled={!device?.address || device.address === 'نامشخص'}
          onSelect={() => { if (device) void navigator.clipboard.writeText(device.address).catch(() => undefined) }}>
          <Copy size={16}/> کپی آدرس IP
        </DropdownMenu.Item>
        <DropdownMenu.Item className="node-context-item" disabled={!canReportLink}
          onSelect={onReportLink}>
          <GitBranch size={16}/> ثبت ارتباط از این نود
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="node-context-separator"/>
        <DropdownMenu.Item className="node-context-item" disabled={!canDiagnose}
          onSelect={() => onDiagnose('ping')}>
          <Radar size={16}/> Ping از BaseServer
        </DropdownMenu.Item>
        <DropdownMenu.Item className="node-context-item" disabled={!canDiagnose}
          onSelect={() => onDiagnose('traceroute')}>
          <Network size={16}/> Traceroute از BaseServer
        </DropdownMenu.Item>
        <p className="node-context-note">فقط IP واقعی در سایت دارای شواهد؛ اجرای شبکه نیازمند تأیید است.</p>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}