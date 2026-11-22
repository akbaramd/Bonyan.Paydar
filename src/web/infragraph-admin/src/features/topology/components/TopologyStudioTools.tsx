import { Dialog, Popover, Select } from 'radix-ui'
import {
  ArrowLeftRight, CheckCircle2, ChevronDown, CircleHelp, CircleX, Clock3,
  ListTree, Pause, Play, RotateCcw, Route, Settings2, SkipBack,
  SkipForward, Square, Terminal, X,
} from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { SwitchField } from '../../../shared/ui/SwitchField'
import type { Device } from '../model/topology'
import { stateLabels } from '../model/topology'
import type { LogicalRoute, ProbeStep } from '../model/topology-playback'
import { probeStatistics } from '../model/topology-playback'

export function LayerSettings({ showGrid, onGrid, showMinimap, onMinimap, showLabels, onLabels, motion, onMotion, motionRestricted }: {
  showGrid: boolean; onGrid: (v: boolean) => void
  showMinimap: boolean; onMinimap: (v: boolean) => void
  showLabels: boolean; onLabels: (v: boolean) => void
  motion: boolean; onMotion: (v: boolean) => void
  motionRestricted: boolean
}) {
  return <Popover.Root>
    <Popover.Trigger asChild>
      <Button size="sm" variant="ghost" aria-label="تنظیمات لایه‌ها"><Settings2 size={16}/> لایه‌ها <ChevronDown size={13}/></Button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="studio-layer-popover" sideOffset={8} align="end">
        <div className="studio-popover-head"><strong>تنظیمات نمایش</strong><span>VIEW SETTINGS</span></div>
        <SwitchField label="شبکه زمینه" hint="نقاط راهنمای فضای گراف" checked={showGrid} onCheckedChange={onGrid}/>
        <SwitchField label="نقشه کوچک" hint="ناوبری سریع در گراف‌های بزرگ" checked={showMinimap} onCheckedChange={onMinimap}/>
        <SwitchField label="نام پورت‌ها" hint="برچسب ارتباط روی لینک‌ها" checked={showLabels} onCheckedChange={onLabels}/>
        <SwitchField label="حرکت نشانگرها" hint={motionRestricted ? 'بر اساس تنظیمات کاهش حرکت سیستم غیرفعال است' : 'انیمیشن محدود به Replay آزمایشی'} checked={motion && !motionRestricted} onCheckedChange={onMotion} disabled={motionRestricted}/>
        <Popover.Arrow className="ig-popover-arrow"/>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
}

export function DeviceSelect({ label, devices, value, onChange }: {
  label: string; devices: readonly Device[]; value: string; onChange: (value: string) => void
}) {
  return <div className="studio-device-select">
    <label>{label}</label>
    <Select.Root value={value} onValueChange={onChange} dir="rtl">
      <Select.Trigger className="studio-select-trigger" aria-label={label}>
        <Select.Value placeholder="انتخاب تجهیز"/>
        <Select.Icon><ChevronDown size={14}/></Select.Icon>
      </Select.Trigger>
      <Select.Portal><Select.Content position="popper" className="studio-select-menu" sideOffset={6}>
        <Select.Viewport>
          {devices.map((device) => <Select.Item key={device.id} value={device.id} className="studio-select-option">
            <Select.ItemText><span dir="ltr">{device.name}</span><small>{stateLabels[device.state]}</small></Select.ItemText>
            <Select.ItemIndicator><CheckCircle2 size={13}/></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content></Select.Portal>
    </Select.Root>
  </div>
}

export function AssetExplorer({ devices, selectedId, onSelect, demo = false }: {
  devices: readonly Device[]; selectedId: string | null; onSelect: (id: string) => void; demo?: boolean
}) {
  const order = { critical: 0, warning: 1, unknown: 2, healthy: 3 }
  const sorted = [...devices].sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name))
  return <aside className="studio-explorer" aria-label="فهرست تجهیزات شبکه" data-testid="topology-explorer">
    <div className="studio-explorer-summary"><ListTree size={15}/> {sorted.length} تجهیز در نمای فعلی <span>{demo ? 'نمایشی' : 'شواهد شبکه'}</span></div>
    <div className="studio-explorer-list">
      {sorted.length === 0 ? <p className="studio-explorer-empty">داده‌ای برای نمایش وجود ندارد.</p> : sorted.map((device) =>
        <button key={device.id} type="button"
          className={`studio-explorer-item${selectedId === device.id ? ' studio-explorer-item--selected' : ''}`}
          onClick={() => onSelect(device.id)} aria-label={`رفتن به ${device.name}`}>
          <span className={`summary-dot summary-dot--${device.state}`}/>
          <span><strong dir="ltr">{device.name}</strong><small>{device.title}</small></span>
          <span className="studio-explorer-ip" dir="ltr">{device.address}</span>
        </button>)}
    </div>
    <footer>انتخاب دستگاه، نقشه را روی همان نود متمرکز می‌کند.</footer>
  </aside>
}

type PlaybackProps = {
  devices: readonly Device[]
  steps: ProbeStep[]
  index: number
  playing: boolean
  speed: number
  onSpeed: (v: number) => void
  onPlay: () => void
  onStop: () => void
  onBack: () => void
  onNext: () => void
  routeFrom: string
  routeTo: string
  onFrom: (id: string) => void
  onTo: (id: string) => void
  route: LogicalRoute | null
  onTrace: () => void
  onClearTrace: () => void
  tab: 'probe' | 'path'
  demo: boolean
}
const phaseNames = { request: 'ارسال درخواست', reply: 'دریافت پاسخ', timeout: 'بدون پاسخ آزمایشی' }
export function PlaybackDock({
  devices, steps, index, playing, speed, onSpeed, onPlay, onStop, onBack, onNext,
  routeFrom, routeTo, onFrom, onTo, route, onTrace, onClearTrace, tab, demo,
}: PlaybackProps) {
  const stats = probeStatistics(steps, index)
  const item = steps[index] ?? null
  const names = new Map(devices.map((device) => [device.id, device.name]))
  return <section className="studio-dock" aria-label="کنسول تحلیل شبکه" data-testid="topology-dock" dir="rtl">
    {tab === 'probe' && <div className="studio-dock-content studio-dock-probe">
        <div className="studio-probe-actions">
          <Button variant="primary" size="sm" disabled={!demo || steps.length === 0} onClick={onPlay}>
            {playing ? <Pause size={15}/> : <Play size={15}/>}
            {playing ? 'توقف موقت' : index < 0 || index === steps.length - 1 ? 'اجرای Replay' : 'ادامه Replay'}
          </Button>
          <Button variant="ghost" size="icon" disabled={!demo || index < 0} onClick={onStop} aria-label="بازنشانی Replay"><Square size={15}/></Button>
          <span className="studio-dock-action-divider"/>
          <Button variant="ghost" size="icon" disabled={!demo || playing || index <= 0} onClick={onBack} aria-label="مرحله قبل"><SkipBack size={16}/></Button>
          <Button variant="ghost" size="icon" disabled={!demo || playing || index >= steps.length - 1} onClick={onNext} aria-label="مرحله بعد"><SkipForward size={16}/></Button>
          <label className="studio-speed"><span>سرعت</span>
            <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="سرعت Replay">
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
            </select>
          </label>
        </div>
        <div className="studio-probe-main">
          <div className="studio-probe-transport">
            <div className="studio-probe-transport-head">
              <strong>{item ? phaseNames[item.phase] : 'آماده اجرای سناریو'}</strong>
              <span className="numeric">{steps.length ? `${Math.max(0, index + 1)} / ${steps.length}` : '0 / 0'}</span>
            </div>
            <div className="studio-progress-track" role="progressbar" aria-label="پیشرفت Replay" aria-valuemin={0} aria-valuemax={steps.length || 1} aria-valuenow={Math.max(0, index + 1)}>
              <span style={{ width: `${steps.length ? Math.max(0, index + 1) / steps.length * 100 : 0}%` }}/>
            </div>
            <div className="studio-probe-description" aria-live="polite">
              {item
                ? <><span dir="ltr">{names.get(item.sourceId)}</span><ArrowLeftRight size={12}/><span dir="ltr">{names.get(item.targetId)}</span><span>· گام {item.hop}</span></>
                : demo ? 'مبدأ: DISCOVERY-SRV · هیچ Probe واقعی ارسال نمی‌شود.' : 'برای اجرای واقعی به سرویس Discovery و شواهد معتبر نیاز است.'}
            </div>
          </div>
          <div className="studio-probe-metrics" aria-label="آمار Replay">
            <div><span>درخواست</span><b className="numeric">{stats.requests}</b></div>
            <div><span>پاسخ</span><b className="numeric">{stats.replies}</b></div>
            <div><span>بی‌پاسخ</span><b className="numeric">{stats.timeouts}</b></div>
          </div>
          <div className="studio-probe-recent" aria-label="رویدادهای اخیر Replay">
            {index < 0 ? <span className="studio-probe-quiet"><Terminal size={16}/> رویدادی ثبت نشده است</span>
              : steps.slice(Math.max(0, index - 2), index + 1).reverse().map((step) => <div key={step.id} className={`studio-probe-log studio-probe-log--${step.phase}`}>
                {step.phase === 'reply' ? <CheckCircle2 size={14}/> : step.phase === 'timeout' ? <CircleX size={14}/> : <Clock3 size={14}/>}
                <span>{phaseNames[step.phase]}</span><code dir="ltr">{names.get(step.phase === 'reply' ? step.sourceId : step.targetId)}</code>
              </div>)}
          </div>
        </div>
    </div>}
    {tab === 'path' && <div className="studio-dock-content studio-path-content">
        <div className="studio-path-controls">
          <DeviceSelect label="مبدأ مسیر" devices={devices} value={routeFrom} onChange={onFrom}/>
          <ArrowLeftRight className="studio-path-arrows" size={17}/>
          <DeviceSelect label="مقصد مسیر" devices={devices} value={routeTo} onChange={onTo}/>
          <Button variant="primary" size="sm" disabled={!demo || !routeFrom || !routeTo || routeFrom === routeTo} onClick={onTrace}><Route size={15}/> تحلیل مسیر</Button>
          {route && <Button variant="ghost" size="sm" onClick={onClearTrace}><RotateCcw size={14}/> پاک‌کردن مسیر</Button>}
        </div>
        <div className="studio-path-result" role="status">
          {route
            ? <><strong>مسیر منطقی نمونه · {route.edges.length} لینک</strong>
              <div className="studio-path-chips">{route.nodes.map((id, i) => <span key={id}><code dir="ltr">{names.get(id) ?? id}</code>{i < route.nodes.length - 1 && <span className="studio-path-arrow">←</span>}</span>)}</div>
              <p className={route.blockedAt ? 'studio-path-risk' : ''}>{route.blockedAt ? `مسیر شامل نود قطع/نامشخص است: ${names.get(route.blockedAt)}. این تحلیل، اثبات دسترسی یا مسیر بسته نیست.` : 'مسیر از روی همسایگی ساختگی محاسبه شده؛ مسیر واقعی بسته تأیید نشده است.'}</p></>
            : <p>مبدأ و مقصد را انتخاب کنید. مسیر براساس ارتباطات منطقی نمایش داده می‌شود، نه Traceroute واقعی.</p>}
        </div>
    </div>}
  </section>
}

export function StudioHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="ig-dialog-overlay"/>
      <Dialog.Content className="studio-help-dialog">
        <div className="studio-help-title"><CircleHelp size={21}/><div><Dialog.Title>راهنمای مرکز فرماندهی شبکه</Dialog.Title><Dialog.Description>میان‌برها و تفاوت بین Replay آزمایشی و داده‌های واقعی</Dialog.Description></div>
          <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="بستن راهنما"><X size={18}/></Button></Dialog.Close>
        </div>
        <div className="studio-help-grid">
          {[['کشیدن روی نقشه','جابجایی در سطح گراف'],['اسکرول / Pinch','تغییر بزرگ‌نمایی'],['انتخاب نود','نمایش اطلاعات تجهیز'],['F','تمام‌صفحه'],['0','نمایش کامل گراف'],['?','بازکردن راهنما'],['Esc','خروج از حالت تمرکز']].map(([key, label]) =>
            <div key={key}><span>{label}</span><kbd dir="ltr">{key}</kbd></div>)}
        </div>
        <div className="studio-help-disclaimer"><Terminal size={18}/> انیمیشن Replay یک بازنمایی فرضی از درخواست و پاسخ روی گراف نمونه است. هیچ بسته شبکه‌ای از مرورگر ارسال نمی‌شود؛ موقعیت نودها، لینک‌ها و وضعیت‌ها شواهد واقعی نیستند.</div>
        <div className="studio-help-actions"><Dialog.Close asChild><Button variant="primary">متوجه شدم</Button></Dialog.Close></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}