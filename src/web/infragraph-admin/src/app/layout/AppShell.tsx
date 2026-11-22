import { useState, type ReactNode } from 'react'
import './monitoring-navigation.css'
import { NavLink, useLocation } from 'react-router'
import { Dialog, Tooltip } from 'radix-ui'
import { Activity, Boxes, ChevronDown, CircleHelp, FlaskConical, LayoutDashboard, Map, Menu, Monitor, Moon, Network, PanelTop, Radar, ServerCog, Sun, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { CommandPalette } from './CommandPalette'
import { ActivityPanel } from './ActivityPanel'
import { useSettings } from '../../shared/preferences/settings-context'
import { useSystemSnapshot } from '../../features/overview/api/snapshot'
import { useSession, useSignOut } from '../../shared/auth/session'

const monitoringLinks = [
  { to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true },
  { to: '/monitoring/discovery', label: 'Discovery · کشف شبکه', icon: Radar },
  { to: '/topology', label: 'Maps · نقشه شبکه', icon: Map },
  { to: '/incidents', label: 'مشکلات و هشدارها', icon: Activity },
  { to: '/assets', label: 'موجودی تجهیزات', icon: Boxes },
] as const

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession()
  const { pathname } = useLocation()
  const [monitoringOpen, setMonitoringOpen] = useState(true)
  const [systemOpen, setSystemOpen] = useState(true)

  const renderLink = (item: {to: string; label: string; icon: typeof Map; end?: boolean}) => {
    const Icon = item.icon
    return <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate}
      className={({isActive}) => `nav-link monitoring-subitem${isActive ? ' nav-link--active' : ''}`}>
      <Icon size={16} aria-hidden="true"/><span>{item.label}</span>
    </NavLink>
  }

  return <nav className="app-nav monitoring-nav" aria-label="ناوبری اصلی">
    <div className="nav-section-label">NETWORK OPERATIONS</div>
    <button type="button" className={`nav-section-toggle${pathname === '/' || pathname.startsWith('/monitoring/') || pathname === '/topology' || pathname === '/assets' || pathname === '/incidents' ? ' nav-section-toggle--current' : ''}`}
      aria-expanded={monitoringOpen} aria-controls="navigation-monitoring-submenu"
      onClick={() => setMonitoringOpen(open => !open)}>
      <Activity size={18} aria-hidden="true"/><strong>مانیتورینگ</strong>
      <ChevronDown size={15} className={monitoringOpen ? 'nav-section-chevron' : 'nav-section-chevron nav-section-chevron--closed'} aria-hidden="true"/>
    </button>
    {monitoringOpen && <div id="navigation-monitoring-submenu" className="nav-submenu">
      {monitoringLinks.map(renderLink)}
    </div>}
    <button type="button" className="nav-section-toggle" aria-expanded={systemOpen}
      aria-controls="navigation-system-submenu" onClick={() => setSystemOpen(open => !open)}>
      <Monitor size={18} aria-hidden="true"/><strong>زیرساخت و مدیریت</strong>
      <ChevronDown size={15} className={systemOpen ? 'nav-section-chevron' : 'nav-section-chevron nav-section-chevron--closed'} aria-hidden="true"/>
    </button>
    {systemOpen && <div id="navigation-system-submenu" className="nav-submenu">
      {renderLink({to: '/monitoring/server', label: 'BaseServer · سرور پایش', icon: ServerCog})}
      {renderLink({to: '/agents', label: 'Agentها', icon: Monitor})}
      {session.data && <NavLink to="/account" onClick={onNavigate}
        className={({isActive}) => `nav-link monitoring-subitem${isActive ? ' nav-link--active' : ''}`}>حساب کاربری</NavLink>}
      {session.data?.role === 'admin' && <>
        <NavLink to="/admin/audit" onClick={onNavigate}
          className={({isActive}) => `nav-link monitoring-subitem${isActive ? ' nav-link--active' : ''}`}>گزارش امنیتی</NavLink>
        <NavLink to="/admin/users" onClick={onNavigate}
          className={({isActive}) => `nav-link monitoring-subitem${isActive ? ' nav-link--active' : ''}`}>کاربران و دسترسی</NavLink>
      </>}
    </div>}
    {import.meta.env.DEV && <>
      <div className="nav-section-label nav-section-label--secondary">DEVELOPER TOOLS</div>
      <NavLink to="/lab/data-grid" onClick={onNavigate}
        className={({isActive}) => `nav-link monitoring-subitem${isActive ? ' nav-link--active' : ''}`}>
        <FlaskConical size={16} aria-hidden="true"/><span>آزمایشگاه جدول</span></NavLink>
      <NavLink to="/design-system" onClick={onNavigate}
        className={({isActive}) => `nav-link monitoring-subitem${isActive ? ' nav-link--active' : ''}`}>
        <PanelTop size={16} aria-hidden="true"/><span>دیزاین سیستم</span></NavLink>
    </>}
  </nav>
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><Network size={22} strokeWidth={2.4} /></span>
      <div><strong dir="ltr">InfraGraph</strong><small dir="ltr">NETWORK COMMAND CENTER</small></div>
    </div>
  )
}

function ThemeControl() {
  const { theme, setTheme } = useSettings()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button size="icon" variant="ghost" onClick={() => setTheme(next)} aria-label={theme === 'dark' ? 'فعال‌سازی تم روشن' : 'فعال‌سازی تم تیره'}>
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="ig-tooltip" sideOffset={7}>{theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  )
}

function DensityControl() {
  const { density, setDensity } = useSettings()
  return <Button variant="ghost" className="density-action" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}>
    {density === 'compact' ? 'نمای راحت‌تر' : 'نمای فشرده'}
  </Button>
}

function ServerStatus() {
  const snapshot = useSystemSnapshot()
  const isScaffold = snapshot.data?.stage === 'ScaffoldOnly'
  return (
    <div className="server-status" role="status" aria-live="polite">
      <span className={`status-indicator ${snapshot.isError ? 'status-indicator--danger' : isScaffold ? 'status-indicator--unknown' : snapshot.isSuccess ? 'status-indicator--success' : 'status-indicator--unknown'}`} aria-hidden="true" />
      <span>{snapshot.isPending ? 'در حال اتصال' : snapshot.isError ? 'API در دسترس نیست' : isScaffold ? 'سامانه در مرحله راه‌اندازی' : 'API متصل'}</span>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()
  const session = useSession()
  const signOut = useSignOut()
  if (pathname === '/topology') return (
    <div className="topology-studio-shell">
      <a className="skip-link" href="#main-content">رفتن به محتوای اصلی</a>
      <main id="main-content" className="topology-studio-main" tabIndex={-1}>{children}</main>
    </div>
  )
  return (
    <div className="app-root">
      <a className="skip-link" href="#main-content">رفتن به محتوای اصلی</a>
      <aside className="sidebar-desktop"><Brand /><Navigation />
        <div className="sidebar-footer"><Badge tone="unknown">پایلوت محلی</Badge><p>کشف IP فعال است؛ شناسایی سوئیچ و لینک فیزیکی به شواهد SNMPv3/LLDP نیاز دارد.</p></div>
      </aside>
      <div className="app-workspace">
        <header className="app-header">
          <div className="header-start">
            <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
              <Dialog.Trigger asChild>
                <Button className="mobile-menu-button" size="icon" variant="ghost" aria-label="باز کردن منوی برنامه">
                  <Menu size={22} aria-hidden="true" />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="ig-dialog-overlay" />
                <Dialog.Content className="mobile-nav-drawer">
                  <Dialog.Title className="visually-hidden">منوی برنامه</Dialog.Title>
                  <Dialog.Description className="visually-hidden">جابه‌جایی بین بخش‌های InfraGraph</Dialog.Description>
                  <div className="drawer-heading"><Brand /><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="بستن منو"><X size={20} /></Button></Dialog.Close></div>
                  <Navigation onNavigate={() => setNavOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span className="header-label"><CircleHelp size={17} aria-hidden="true" /> مرکز فرماندهی زیرساخت</span>
          </div>
          <div className="header-actions"><CommandPalette/><ActivityPanel/><ServerStatus /><span className="header-divider" /><DensityControl /><ThemeControl />{session.data && <Button variant="ghost" onClick={() => void signOut()}>خروج</Button>}</div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
        <footer className="app-footer">InfraGraph · <span dir="ltr">UI Architecture v1.0</span> · اطلاعات شبکه بدون احراز هویت نمایش داده نمی‌شوند.</footer>
      </div>
    </div>
  )
}