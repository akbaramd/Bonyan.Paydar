import type { ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { PanelBottomClose, PanelLeftClose, PanelRightClose } from 'lucide-react'
import './topology-docks.css'

export type DockTab = { id: string; label: string }
type Region = 'left' | 'right' | 'bottom'

export function DockPane({ region, title, activeLabel, onClose, children }: {
  region: Region
  title: string
  activeLabel: string
  onClose: () => void
  children: ReactNode
}) {
  const CloseIcon = region === 'left' ? PanelLeftClose : region === 'right' ? PanelRightClose : PanelBottomClose
  return <section className={`ig-dock-pane ig-dock-pane--${region}`} aria-label={title}
    data-testid={`topology-${region}-dock`} dir="rtl">
    <header className="ig-dock-titlebar">
      <strong>{activeLabel}</strong>
      <span className="ig-dock-titlebar-name">{title}</span>
      <button type="button" className="ig-dock-close" aria-label={`جمع‌کردن ${title}`} onClick={onClose}
        title="جمع‌کردن پنل؛ تب‌ها در لبه باقی می‌مانند">
        <CloseIcon size={15} aria-hidden="true"/>
      </button>
    </header>
    <div className="ig-dock-scroll" data-testid={`topology-${region}-dock-content`}>
      {children}
    </div>
  </section>
}

/** Rider-style tool-window strip stays visible whether the tool window is expanded or not. */
function DockRail({ region, tabs, active, expanded, onActivate }: {
  region: Region
  tabs: readonly DockTab[]
  active: string
  expanded: boolean
  onActivate: (id: string) => void
}) {
  const label = region === 'left' ? 'چپ' : region === 'right' ? 'راست' : 'پایین'
  return <nav className={`ig-dock-rail ig-dock-rail--${region}`} dir="rtl"
    data-testid={`topology-${region}-rail`} aria-label={`تب‌های پنل ${label}`}>
    {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={expanded && active === tab.id}
      aria-expanded={expanded && active === tab.id}
      onClick={() => onActivate(tab.id)} title={`${expanded && active === tab.id ? 'جمع‌کردن' : 'بازکردن'} ${tab.label}`}
      aria-label={`بازکردن تب ${tab.label}`}>
      {tab.label}
    </button>)}
  </nav>
}

/** One React Flow graph; tool strips remain permanently docked, content resizes beside it. */
export function TopologyDockLayout({ compact, leftOpen, rightOpen, bottomOpen, left, center, right, bottom,
  leftTabs, rightTabs, bottomTabs, leftActive, rightActive, bottomActive,
  onLeftTab, onRightTab, onBottomTab,
}: {
  compact: boolean
  leftOpen: boolean
  rightOpen: boolean
  bottomOpen: boolean
  left: ReactNode
  center: ReactNode
  right: ReactNode
  bottom: ReactNode
  leftTabs: readonly DockTab[]
  rightTabs: readonly DockTab[]
  bottomTabs: readonly DockTab[]
  leftActive: string
  rightActive: string
  bottomActive: string
  onLeftTab: (id: string) => void
  onRightTab: (id: string) => void
  onBottomTab: (id: string) => void
}) {
  const leftRail = <DockRail region="left" tabs={leftTabs} active={leftActive} expanded={leftOpen} onActivate={onLeftTab}/>
  const rightRail = <DockRail region="right" tabs={rightTabs} active={rightActive} expanded={rightOpen} onActivate={onRightTab}/>
  const bottomRail = <DockRail region="bottom" tabs={bottomTabs} active={bottomActive} expanded={bottomOpen} onActivate={onBottomTab}/>

  return <div className={`ig-dock-frame ig-ide-workspace${compact ? ' ig-dock-frame--compact' : ''}`}
    data-testid="topology-dock-layout">
    <div className="ig-ide-upper">
      {leftRail}
      <div className="ig-ide-main">
        {compact
          ? <div className="ig-dock-center">{center}</div>
          : <Group orientation="vertical" id="topology-vertical-split" className="ig-dock-group">
              <Panel id="topology-top-panel" defaultSize="73%" minSize="35%">
                <Group orientation="horizontal" id="topology-horizontal-split" className="ig-dock-group">
                  {leftOpen && <Panel id="topology-left-panel" defaultSize="23%" minSize={235} maxSize="38%">
                    {left}
                  </Panel>}
                  {leftOpen && <Separator className="ig-dock-resizer ig-dock-resizer--vertical" aria-label="تغییر عرض پنل چپ"/>}
                  <Panel id="topology-center-panel" defaultSize="54%" minSize="27%">
                    <div className="ig-dock-center">{center}</div>
                  </Panel>
                  {rightOpen && <Separator className="ig-dock-resizer ig-dock-resizer--vertical" aria-label="تغییر عرض پنل راست"/>}
                  {rightOpen && <Panel id="topology-right-panel" defaultSize="23%" minSize={265} maxSize="42%">
                    {right}
                  </Panel>}
                </Group>
              </Panel>
              {bottomOpen && <Separator className="ig-dock-resizer ig-dock-resizer--horizontal" aria-label="تغییر ارتفاع پنل پایین"/>}
              {bottomOpen && <Panel id="topology-bottom-panel" defaultSize="27%" minSize={145} maxSize="55%">
                {bottom}
              </Panel>}
            </Group>}
      </div>
      {rightRail}
    </div>
    {bottomRail}
    {compact && leftOpen && <aside className="ig-compact-dock ig-compact-dock--left">{left}</aside>}
    {compact && rightOpen && <aside className="ig-compact-dock ig-compact-dock--right">{right}</aside>}
    {compact && bottomOpen && <aside className="ig-compact-dock ig-compact-dock--bottom">{bottom}</aside>}
  </div>
}