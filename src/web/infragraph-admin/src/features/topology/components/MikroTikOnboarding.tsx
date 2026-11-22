import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2, ChevronDown, ClipboardCopy, Info, Network, PlugZap, Router, ShieldAlert,
} from 'lucide-react'
import { getHostScopeCandidates } from '../api/active-scan'
import type { ScanJob } from '../api/active-scan'
import type { GraphResponse } from '../api/graph'
import { isPrivateIpv4 } from '../model/network-address'
import {
  buildMikrotikSnmpCommand, buildSnmpTargetFile, isTargetCoveredByFreshJob,
} from '../model/snmp-onboarding'
import './mikrotik-onboarding.css'

type Props = {
  siteId: string
  canConfigure: boolean
  jobs: readonly ScanJob[]
  graph: GraphResponse | undefined
}

function CopySnippet({ name, value, disabled = false }: {
  name: string; value: string; disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true) }
    catch { setCopied(false) }
  }
  return <button type="button" className="mikrotik-copy" disabled={disabled}
    onClick={() => void copy()} aria-label={'کپی ' + name}>
    {copied ? <CheckCircle2 size={14}/> : <ClipboardCopy size={14}/>}
    {copied ? 'کپی شد' : 'کپی'}
  </button>
}

/**
 * Onboarding is deliberately read-only. There are no credentials, SNMP
 * packets, router login, or server configuration writes in this component.
 */
export function MikroTikOnboarding({ siteId, canConfigure, jobs, graph }: Props) {
  const [address, setAddress] = useState('')
  const [source, setSource] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const scopes = useQuery({
    queryKey: ['discovery', 'host-scope-candidates'],
    queryFn: ({ signal }) => getHostScopeCandidates(signal),
    enabled: canConfigure && Boolean(siteId), retry: false, staleTime: 60_000,
  })
  const sources = useMemo(() => scopes.data?.candidates.filter(item =>
    isPrivateIpv4(item.adapterAddress)) ?? [], [scopes.data])
  const validTarget = isPrivateIpv4(address)
  const validSource = isPrivateIpv4(source) && sources.some(item => item.adapterAddress === source)
  const covered = isTargetCoveredByFreshJob(address, jobs, nowMs)
  const targetConfig = buildSnmpTargetFile(siteId, validTarget ? address : 'MANAGEMENT_IP',
    Boolean(covered && confirmed && canConfigure))
  const command = buildMikrotikSnmpCommand(validSource ? source : '')
  const observed = graph?.nodes.filter(node => node.identitySource === 'snmpv3-authpriv') ?? []
  const observedLinks = graph?.links.filter(link => link.evidenceSource === 'snmpv3-authpriv') ?? []
  const configured = observed.find(node => node.address === address)

  return <section className="surface-card mikrotik-onboarding" dir="rtl"
    aria-label="اتصال تجهیزات MikroTik با SNMPv3" data-testid="mikrotik-onboarding">
    <details>
      <summary className="mikrotik-onboarding-summary">
        <span className="mikrotik-heading-icon"><PlugZap size={19}/></span>
        <span className="mikrotik-heading-text">
          <strong>اتصال MikroTik و سوئیچ‌های مدیریت‌شده</strong>
          <small>SNMPv3 authPriv · LLDP · پورت‌ها · نقشهٔ مستند · بدون ارسال دستور به روتر</small>
        </span>
        <span className="mikrotik-counter">
          {graph ? observed.length.toLocaleString('fa-IR') : '—'} تجهیز دارای شاهد
        </span>
        <ChevronDown size={18} className="mikrotik-arrow" aria-hidden="true"/>
      </summary>
      <div className="mikrotik-onboarding-body">
        <p className="mikrotik-lead">
          InfraGraph از سرور Worker به IP مدیریتی تجهیز درخواست SNMPv3 روی UDP/161 می‌فرستد.
          نام تجهیز از sysName و اتصال پورت‌ها از LLDP خوانده می‌شود؛ Ping به‌تنهایی نام
          سوئیچ یا کابل فیزیکی را مشخص نمی‌کند.
        </p>
        <div className="mikrotik-readiness" aria-label="پوشش واقعی SNMPv3">
          <div><Router size={16}/><span>تجهیزات با هویت SNMPv3</span>
            <strong>{graph ? observed.length : '—'}</strong></div>
          <div><Network size={16}/><span>همسایگی‌های گزارش‌شده با LLDP</span>
            <strong>{graph ? observedLinks.length : '—'}</strong></div>
        </div>
        {observed.length > 0 && <div className="mikrotik-observed">
          <strong>تجهیزات دارای شواهد اخیر در همین سایت</strong>
          {observed.slice(0, 8).map(node =>
            <div key={node.id}>
              <span>{node.systemName || node.address || node.id}</span>
              <code dir="ltr">{node.address ?? '—'}</code>
              <span>{node.deviceKind === 'router' ? 'روتر' :
                node.deviceKind === 'switch' ? 'سوئیچ' : 'نوع نامشخص'}</span>
            </div>)}
        </div>}
        {!canConfigure && <p role="status" className="mikrotik-caution">
          مشاهدهٔ شواهد برای شما مجاز است؛ راه‌اندازی و تأیید تجهیزات به مدیر نیاز دارد.
        </p>}
        {canConfigure && <>
          <div className="mikrotik-section-header">
            <span>۰۱</span><div><h3>انتخاب تجهیز و سرور جمع‌آورنده</h3>
              <p>نام سایت از محدودهٔ مدیریتی موجود گرفته می‌شود. IP روتر باید قبلاً مجاز شده باشد.</p></div>
          </div>
          <div className="mikrotik-fields">
            <label>شناسهٔ داخلی سایت (فقط خواندنی)
              <code className="mikrotik-static-field" dir="ltr">{siteId || 'سایتی انتخاب نشده'}</code>
            </label>
            <label>IP مدیریتی تجهیز
              <input dir="ltr" aria-label="IP مدیریتی MikroTik" autoComplete="off"
                maxLength={15} placeholder="مثلاً 192.168.88.1" value={address}
                onChange={event => { setAddress(event.target.value.trim()); setConfirmed(false) }}/>
            </label>
            <label>IP مبدأ احتمالی Worker (سرور)
              <select aria-label="آدرس مبدأ SNMP" value={validSource ? source : ''}
                onChange={event => setSource(event.target.value)}>
                <option value="">انتخاب کارت شبکهٔ سرور</option>
                {sources.map(item => <option value={item.adapterAddress}
                  key={item.interfaceAlias + item.adapterAddress}>
                  {item.interfaceAlias} — {item.adapterAddress}
                </option>)}
              </select>
            </label>
          </div>
          <p className="mikrotik-help">
            <Info size={15}/>
            IP کارت شبکه فقط «نامزد مبدأ» است. با Routing، VPN یا NAT ممکن است IP واقعی
            ارسال بسته متفاوت باشد؛ باید در MikroTik بررسی شود.
            {scopes.isError && ' دریافت کارت‌های شبکه از سرور ناموفق بود.'}
          </p>
          <div className="mikrotik-scope-status" role="status" aria-live="polite">
            {covered
              ? <><CheckCircle2 size={17}/> IP در محدودهٔ یک Scan Job فعال و تازهٔ همین سایت قرار دارد.</>
              : <><ShieldAlert size={17}/> این IP هنوز پوشش یک Scan Job فعال و تازه را ندارد؛
                Worker مجاز به خواندن SNMP آن نیست.</>}
          </div>
          {configured && <p role="status" className="mikrotik-proof">
            <CheckCircle2 size={16}/> این IP دارای هویت SNMPv3 ثبت‌شده است:
            <strong>{configured.systemName || configured.address}</strong>
          </p>}

          <div className="mikrotik-section-header">
            <span>۰۲</span><div><h3>تنظیم فقط‌خواندنی MikroTik</h3>
              <p>در WinBox یا Terminal، برای Worker حساب SNMPv3 مستقل بسازید؛
                RouterOS 7.25 یا بالاتر برای SHA-256 لازم است.</p></div>
          </div>
          <div className="mikrotik-snippet">
            <div className="mikrotik-snippet-head">
              <span>RouterOS Terminal · SNMPv3 SHA256 / AES</span>
              <CopySnippet name="تنظیمات MikroTik" value={command} disabled={!validSource}/>
            </div>
            <pre dir="ltr"><code>{command}</code></pre>
          </div>
          <p className="mikrotik-caution">
            رمزهای <code>SET_AUTH_SECRET</code> و <code>SET_PRIV_SECRET</code> فقط
            جای‌نگهدارند؛ رمز واقعی در این صفحه وارد یا ذخیره نمی‌شود.
            در فایروال INPUT فقط UDP/161 از IP مبدأ Worker را، قبل از Drop مرتبط،
            مجاز کنید. به SNMP مجوز نوشتن ندهید. پورت مدیریتی را در WAN باز نکنید.
          </p>
          <div className="mikrotik-section-header">
            <span>۰۳</span><div><h3>فعال‌کردن LLDP در پورت‌های داخلی</h3>
              <p>در WinBox: IP ← Neighbors ← Discovery Settings.
                فقط پورت‌های LAN مدیریت‌شده را در interface list قرار دهید؛
                LLDP باید در حالت دریافت فعال باشد. WAN را اضافه نکنید.</p></div>
          </div>
          <div className="mikrotik-snippet">
            <div className="mikrotik-snippet-head"><span>RouterOS · فقط نمایش تنظیمات فعلی</span>
              <CopySnippet name="دستورات بررسی LLDP"
                value={'/ip/neighbor/discovery-settings/print\n/ip/neighbor/lldp/print'}/>
            </div>
            <pre dir="ltr"><code>{'/ip/neighbor/discovery-settings/print\n/ip/neighbor/lldp/print'}</code></pre>
          </div>
          <p className="mikrotik-help"><Info size={15}/>
            جدول LLDP فقط همسایه‌های سازگار را نشان می‌دهد؛ برای تأیید دوطرفه و نمایش
            نام و پورت هر دو سوئیچ، ترجیحاً SNMPv3 هر دو تجهیز را اضافه کنید.
          </p>
          <div className="mikrotik-section-header">
            <span>۰۴</span><div><h3>ثبت هدف در Worker InfraGraph</h3>
              <p>فرایند فعلی از فایل محلی امن روی سرور استفاده می‌کند، نه از رمز داخل UI.</p></div>
          </div>
          <label className="mikrotik-approval">
            <input type="checkbox" checked={confirmed}
              disabled={!covered || !validTarget || !siteId}
              onChange={event => setConfirmed(event.target.checked)}/>
            مجوز مدیریت و خواندن SNMP این IP را دارم و این محدوده تأیید شده است.
          </label>
          <div className="mikrotik-snippet">
            <div className="mikrotik-snippet-head">
              <span>infra/local/snmp-targets.json</span>
              <CopySnippet name="JSON هدف SNMP" value={targetConfig}
                disabled={!validTarget || !siteId}/>
            </div>
            <pre dir="ltr"><code>{targetConfig}</code></pre>
          </div>
          <p className="mikrotik-caution">
            مقدار <code>approved: true</code> فقط پس از تأیید دستی ساخته می‌شود.
            فایل را با حفظ سایر targetهای مجاز موجود و سقف ۱۶ تجهیز مدیریت‌شده
            تنظیم کنید. نام SNMPv3 و دو رمز را فقط در فایل محافظت‌شدهٔ
            <code dir="ltr"> infra/local/.env </code> وارد کنید.
            پس از آن Worker باید جداگانه Restart شود؛ این صفحه هیچ تنظیمی را روی سرور یا روتر اعمال نمی‌کند.
          </p>
          <div className="mikrotik-snippet">
            <div className="mikrotik-snippet-head">
              <span>کلیدهای پیکربندی Worker · فقط جای‌نگهدار</span>
              <CopySnippet name="کلیدهای SNMPv3" value={
                'INFRAGRAPH_SNMPV3_USERNAME=infragraph-ro\n' +
                'INFRAGRAPH_SNMPV3_AUTH_PASSPHRASE=<AUTH_SECRET>\n' +
                'INFRAGRAPH_SNMPV3_PRIV_PASSPHRASE=<PRIV_SECRET>'}/>
            </div>
            <pre dir="ltr"><code>{'INFRAGRAPH_SNMPV3_USERNAME=infragraph-ro\n' +
              'INFRAGRAPH_SNMPV3_AUTH_PASSPHRASE=<AUTH_SECRET>\n' +
              'INFRAGRAPH_SNMPV3_PRIV_PASSPHRASE=<PRIV_SECRET>'}</code></pre>
          </div>
          <p className="mikrotik-footnote">
            بدون شواهد SNMPv3 موفق و LLDP تازه، اتصال واقعی و نام سوئیچ تأیید نمی‌شود.
            صرف ثبت IP در فایل، نقشهٔ کابل‌ها ایجاد نمی‌کند.
          </p>
        </>}
      </div>
    </details>
  </section>
}
