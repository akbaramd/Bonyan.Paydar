import { useState } from 'react'
import { Popover } from 'radix-ui'
import { RotateCcw, Info, CircleDotDashed } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { TextField } from '../../../shared/ui/TextField'
import { SwitchField } from '../../../shared/ui/SwitchField'
import { CheckboxField } from '../../../shared/ui/CheckboxField'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { useSettings } from '../../../shared/preferences/settings-context'

export function ComponentShowcase() {
  const { setTheme, setDensity } = useSettings()
  const [hostname, setHostname] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [showUnknown, setShowUnknown] = useState(true)
  const [feedback, setFeedback] = useState('')

  return <section className="surface-card ds-section" aria-labelledby="patterns-title">
    <div className="section-heading">
      <div><span className="panel-eyebrow">INTERACTIVE PATTERNS</span><h2 id="patterns-title">فیلدها، تنظیمات، تأیید و نمایش وضعیت</h2><p>کامپوننت‌ها مستقل از ماژول کسب‌وکار هستند. نمونه‌ها اطلاعات واقعی را تغییر نمی‌دهند.</p></div>
    </div>
    <div className="ds-content ds-patterns">
      <div className="ds-pattern-card">
        <h3>ورودی و اعتبارسنجی</h3>
        <TextField label="شناسه تجهیز (آزمایشی)" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="مثلاً CORE-SW-01" hint="فیلدها دارای برچسب، متن کمکی و شناسه پایدار هستند." error={hostname.length > 0 && hostname.length < 3 ? 'شناسه باید حداقل سه کاراکتر باشد.' : undefined}/>
        <div className="ds-pattern-status">مقدار فعلی: <span dir="ltr">{hostname || '—'}</span></div>
      </div>
      <div className="ds-pattern-card">
        <h3>تنظیمات و انتخاب</h3>
        <SwitchField label="نمایش نمونه اعلان‌ها" hint="سوئیچ دسترس‌پذیر با Radix" checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled}/>
        <CheckboxField label="نمایش موارد با وضعیت نامشخص" checked={showUnknown} onCheckedChange={setShowUnknown}/>
        <div className="ds-pattern-status">{notificationsEnabled ? 'اعلان نمونه روشن است' : 'اعلان نمونه خاموش است'} · {showUnknown ? 'موارد نامشخص نمایش داده می‌شوند' : 'موارد نامشخص پنهان شده‌اند'}</div>
      </div>
      <div className="ds-pattern-card">
        <h3>تعامل‌ها و عملیات حساس</h3>
        <div className="ds-inline">
          <Popover.Root>
            <Popover.Trigger asChild><Button size="sm" variant="secondary"><Info size={15}/> راهنمای زمینه‌ای</Button></Popover.Trigger>
            <Popover.Portal><Popover.Content className="ig-popover" align="start" sideOffset={8}>
              <h4>الگوی Popover</h4><p>اطلاعات کوتاه و غیرمسدودکننده که نباید مسیر اصلی کار را قطع کند.</p>
              <Popover.Arrow className="ig-popover-arrow"/>
            </Popover.Content></Popover.Portal>
          </Popover.Root>
          <ConfirmDialog
            trigger={<Button size="sm" variant="secondary"><RotateCcw size={15}/> بازنشانی تنظیمات ظاهری</Button>}
            title="بازنشانی تنظیمات ظاهر"
            description="فقط تم و تراکم نمایش در مرورگر به حالت پیش‌فرض برمی‌گردند. هیچ تنظیم سرور یا تجهیزی تغییر نمی‌کند."
            confirmLabel="بازنشانی"
            onConfirm={() => { setTheme('dark'); setDensity('compact'); setFeedback('تنظیمات ظاهری به حالت پیش‌فرض برگشتند.') }}
          />
        </div>
        {feedback && <p role="status" className="ds-feedback">{feedback}</p>}
      </div>
      <div className="ds-pattern-card">
        <h3>بارگذاری و عدم وجود داده</h3>
        <div className="ds-skeleton-example"><Skeleton width="62%" height={16}/><Skeleton width="85%" height={12}/><Skeleton width="42%" height={12}/></div>
        <EmptyState icon={<CircleDotDashed size={26}/>} title="هیچ رکوردی وجود ندارد" description="به جای نمایش جدول جعلی، وضعیت بدون داده به‌وضوح اعلام می‌شود." />
      </div>
    </div>
  </section>
}