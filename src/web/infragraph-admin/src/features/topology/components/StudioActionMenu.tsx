import { DropdownMenu } from 'radix-ui'
import { ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
export type StudioAction = { id: string; label: string; group: 'investigation' | 'view' | 'data'; icon: LucideIcon; onSelect: () => void; disabled?: boolean }
const names = { investigation: 'کاوش و تحلیل', view: 'نمایش نقشه', data: 'داده و فایل' } as const
/** Append arbitrary actions without adding UI rows or hardcoded mobile limits. */
export function StudioActionMenu({ actions }: { actions: readonly StudioAction[] }) {
  const groups = (['investigation', 'view', 'data'] as const).filter(g => actions.some(a => a.group === g))
  return <DropdownMenu.Root dir="rtl">
    <DropdownMenu.Trigger asChild><Button size="sm" variant="secondary" aria-label="ابزارهای بیشتر توپولوژی"><MoreHorizontal size={17}/><span>ابزارها</span><ChevronDown size={12}/></Button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="studio-command-menu" align="end" sideOffset={9} aria-label="ابزارهای توپولوژی">
      {groups.map((g, index) => <div key={g} role="group" aria-label={names[g]}>
        {index > 0 && <DropdownMenu.Separator className="studio-command-separator"/>}
        <DropdownMenu.Label className="studio-command-group">{names[g]}</DropdownMenu.Label>
        {actions.filter(a => a.group === g).map(a => <DropdownMenu.Item key={a.id} disabled={a.disabled} className="studio-command-item" onSelect={a.onSelect}>
          <a.icon size={16} aria-hidden="true"/><span>{a.label}</span>
        </DropdownMenu.Item>)}
      </div>)}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>
}