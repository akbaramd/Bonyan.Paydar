import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Dialog } from 'radix-ui'
import { useNavigate } from 'react-router'
import { Boxes, GitBranch, LayoutDashboard, Monitor, Search, ShieldAlert, X, PanelTop } from 'lucide-react'
import { Button } from '../../shared/ui/Button'

const commands = [
  { label: 'مرکز عملیات', path: '/', icon: LayoutDashboard, detail: 'داشبورد وضعیت زیرساخت' },
  { label: 'نقشه توپولوژی', path: '/topology', icon: GitBranch, detail: 'ارتباطات و جزئیات تجهیزات' },
  { label: 'موجودی تجهیزات', path: '/assets', icon: Boxes, detail: 'لیست نودها و آدرس‌های شبکه' },
  { label: 'رویدادها و هشدارها', path: '/incidents', icon: ShieldAlert, detail: 'وضعیت و تحلیل رخدادها' },
  { label: 'Agentها', path: '/agents', icon: Monitor, detail: 'مدیریت سیستم‌های تحت پوشش' },
  ...(import.meta.env.DEV ? [{ label: 'دیزاین سیستم', path: '/design-system', icon: PanelTop, detail: 'کتابخانه کامپوننت‌های محصول' }] : []),
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener('keydown', listener as EventListener)
    return () => document.removeEventListener('keydown', listener as EventListener)
  }, [])

  const filtered = useMemo(() => commands.filter((item) =>
    `${item.label} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase())), [query])

  function navigateTo(path: string) {
    setOpen(false)
    setQuery('')
    setActive(0)
    navigate(path)
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    if (event.key === 'Enter' && filtered[active]) { event.preventDefault(); navigateTo(filtered[active].path) }
  }

  return <Dialog.Root open={open} onOpenChange={(value) => { setOpen(value); setQuery(''); setActive(0) }}>
    <Dialog.Trigger asChild><button className="command-trigger" aria-label="جست‌وجو در سامانه… Ctrl K"><Search size={16} aria-hidden="true" /><span>جست‌وجو در سامانه…</span><kbd dir="ltr">Ctrl K</kbd></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="ig-dialog-overlay" />
      <Dialog.Content className="command-palette" onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus() }}>
        <Dialog.Title className="visually-hidden">جست‌وجو و جابه‌جایی سریع</Dialog.Title>
        <Dialog.Description className="visually-hidden">صفحه دلخواه را با تایپ نام آن پیدا کرده و با Enter باز کنید.</Dialog.Description>
        <div className="command-input-row"><Search size={19} aria-hidden="true" /><input ref={inputRef} autoComplete="off" spellCheck={false} placeholder="نام بخش یا عملکرد…" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }} onKeyDown={onInputKeyDown} aria-label="جست‌وجوی سریع" /><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="بستن جست‌وجو"><X size={18}/></Button></Dialog.Close></div>
        <div className="command-results" role="group" aria-label="مسیرهای برنامه">
          <span className="command-group-label">صفحات و ابزارها</span>
          {filtered.map((item, index) => { const Icon = item.icon; return <button key={item.path} className={`command-item${index === active ? ' command-item--active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => navigateTo(item.path)}>
            <Icon size={18} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.detail}</small></span><kbd>↵</kbd>
          </button> })}
          {filtered.length === 0 && <p className="command-no-results">بخشی با این عنوان یافت نشد.</p>}
        </div>
        <div className="command-footer"><span>↑ ↓ جابه‌جایی</span><span>Enter انتخاب</span><span>Esc بستن</span></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}