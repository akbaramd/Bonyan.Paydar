import { Building2, Info, LockKeyhole } from 'lucide-react'
import './site-scope.css'

export function SiteScopeSelector({ siteId, choices, canChoose, onChange, compact = false }: {
  siteId: string
  choices: readonly string[]
  canChoose: boolean
  onChange: (siteId: string) => void
  compact?: boolean
}) {
  return <div className={`site-scope-selector${compact ? ' site-scope-selector--compact' : ''}`} dir="rtl">
    <div className="site-scope-identity">
      <Building2 size={17} aria-hidden="true"/>
      <span><strong>محدودهٔ مدیریتی</strong>
        <small>سایت داده‌ها، تجهیزات و مجوزها را از هم جدا می‌کند.</small></span>
    </div>
    {canChoose
      ? <label className="site-scope-select">
        <span>سایت موجود</span>
        <select aria-label="انتخاب سایت مدیریت‌شده" value={siteId} onChange={event => onChange(event.target.value)}>
          {!siteId && <option value="">سایتی ثبت نشده است</option>}
          {choices.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      : <div className="site-scope-locked"><LockKeyhole size={15}/>
        <span>سایت اختصاص‌یافته</span><strong dir="ltr">{siteId || 'نامشخص'}</strong></div>}
    <p className="site-scope-explainer"><Info size={14} aria-hidden="true"/>
      شناسهٔ داخلی سایت از شواهد شبکه و تخصیص کاربران به دست می‌آید؛ تایپ یک نام جدید مجوز اسکن ایجاد نمی‌کند.
      افزودن سایت و شبکهٔ جدید باید در جریان مدیریتی جداگانه با تأیید محدوده انجام شود.
    </p>
  </div>
}