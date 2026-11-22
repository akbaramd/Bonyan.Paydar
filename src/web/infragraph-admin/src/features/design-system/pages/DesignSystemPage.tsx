import { useState } from 'react'
import { Dialog, Tooltip } from 'radix-ui'
import { CheckCircle2, CircleAlert, CircleHelp, CircleMinus, Info, Settings2, X } from 'lucide-react'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { useSettings } from '../../../shared/preferences/settings-context'
import { coreTokens } from '../../../shared/styles/tokens.generated'
import { ComponentShowcase } from '../components/ComponentShowcase'

const swatches = [
  ['سطح اصلی', 'canvas'], ['پنل', 'surface'], ['پنل برجسته', 'surfaceRaised'],
  ['متن', 'text'], ['متن ثانویه', 'textMuted'], ['برند', 'brand'],
  ['سالم', 'success'], ['هشدار', 'warning'], ['خطا', 'danger'], ['نامشخص', 'unknown'],
] as const

export default function DesignSystemPage() {
  const { theme, density } = useSettings()
  const [dialogOpen, setDialogOpen] = useState(false)
  return <div className="page">
    <div className="page-eyebrow">FOUNDATIONS / UI SYSTEM</div>
    <div className="page-heading"><div><h1>دیزاین سیستم InfraGraph</h1><p>کامپوننت‌های مستقل از ظاهر کتابخانه، مبتنی بر Radix UI و توکن‌های اختصاصی؛ مناسب نمایش داده و عیب‌یابی سریع.</p></div><Badge tone="info">نسخه ۱٫۰ · {theme === 'dark' ? 'تیره' : 'روشن'} · {density === 'compact' ? 'فشرده' : 'راحت'}</Badge></div>
    <section className="surface-card ds-section" aria-labelledby="colors-title"><div className="section-heading"><div><span className="panel-eyebrow">SEMANTIC TOKENS</span><h2 id="colors-title">رنگ‌های معنایی</h2><p>متن و هشدارها تنها به رنگ وابسته نیستند؛ متن، آیکن و وضعیت نیز درج می‌شود.</p></div></div>
      <div className="swatch-grid">{swatches.map(([label, key]) => <div className="swatch" key={key}><span className="swatch-color" style={{ background: `var(--ig-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())})` }} /><span>{label}</span><code className="numeric">{key}</code></div>)}</div>
    </section>
    <section className="surface-card ds-section" aria-labelledby="components-title"><div className="section-heading"><div><span className="panel-eyebrow">DESIGN SYSTEM COMPONENTS</span><h2 id="components-title">کامپوننت‌های پایه و دسترسی‌پذیری</h2></div></div>
      <div className="ds-content">
        <div className="ds-group"><span className="ds-group-label">دکمه‌ها</span><div className="ds-inline"><Button variant="primary"><CheckCircle2 size={16} />عملیات اصلی</Button><Button variant="secondary"><Settings2 size={16} />عملیات ثانویه</Button><Button variant="ghost">بدون پس‌زمینه</Button><Button variant="danger">عملیات حساس</Button><Button variant="secondary" disabled>غیرفعال</Button></div></div>
        <div className="ds-group"><span className="ds-group-label">وضعیت‌ها</span><div className="ds-inline"><Badge tone="success"><CheckCircle2 size={13} />سالم</Badge><Badge tone="warning"><CircleAlert size={13} />هشدار</Badge><Badge tone="danger"><CircleAlert size={13} />خطا</Badge><Badge tone="unknown"><CircleMinus size={13} />نامشخص</Badge><Badge tone="info"><Info size={13} />اطلاع</Badge></div></div>
        <div className="ds-group"><span className="ds-group-label">تعامل‌های Headless</span><div className="ds-inline">
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger asChild><Button variant="secondary">بازکردن دیالوگ</Button></Dialog.Trigger>
            <Dialog.Portal><Dialog.Overlay className="ig-dialog-overlay"/><Dialog.Content className="ig-dialog-content">
              <div className="dialog-titlebar"><Dialog.Title>جزئیات کامپوننت Dialog</Dialog.Title><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="بستن دیالوگ"><X size={19} /></Button></Dialog.Close></div>
              <Dialog.Description>این دیالوگ با Radix UI ساخته شده است و پشتیبانی از کیبورد، مدیریت فوکوس و چیدمان RTL را فراهم می‌کند.</Dialog.Description>
              <div className="dialog-actions"><Dialog.Close asChild><Button variant="primary">متوجه شدم</Button></Dialog.Close></div>
            </Dialog.Content></Dialog.Portal>
          </Dialog.Root>
          <Tooltip.Root><Tooltip.Trigger asChild><Button variant="ghost"><CircleHelp size={17} />راهنمای بیشتر</Button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="ig-tooltip" sideOffset={7}>Tooltip دسترس‌پذیر با Radix</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
        </div></div>
      </div>
    </section>
    <ComponentShowcase />
    <section className="surface-card ds-section" aria-labelledby="density-title"><div className="section-heading"><div><span className="panel-eyebrow">DENSITY / RHYTHM</span><h2 id="density-title">تراکم و فاصله‌گذاری</h2><p>دسکتاپ: ارتفاع ردیف ۴۰ پیکسل. حالت راحت و تعامل لمسی: ۴۸ پیکسل. دکمه‌ها در صفحه لمسی حداقل ۴۴ پیکسل هستند.</p></div></div><div className="ds-content"><div className="spacing-scale">{Object.entries(coreTokens.space).map(([key, px]) => <div className="spacing-step" key={key}><code className="numeric">{key}</code><span style={{ inlineSize: px, minInlineSize: px === 0 ? 1 : undefined }} /><small className="numeric">{px}px</small></div>)}</div></div></section>
  </div>
}