import { useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { postSecure } from '../../../shared/auth/session'
import type { Device } from '../model/topology'

export function ObservationForm({ siteId, devices, prefilledSourceId, onChanged }: {
  siteId: string
  devices?: readonly Device[]
  prefilledSourceId?: string | null
  onChanged?: () => void
}) {
  const options = useMemo(() => (devices ?? []).filter(item => item.kind !== 'subnet')
    .slice().sort((a, b) => a.name.localeCompare(b.name, 'fa')), [devices])
  const [source, setSource] = useState(prefilledSourceId ?? '')
  const [target, setTarget] = useState('')
  const [sourcePort, setSourcePort] = useState('')
  const [targetPort, setTargetPort] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()
  const exists = (id: string) => options.some(item => item.id === id)
  const valid = Boolean(siteId && exists(source) && exists(target) && source !== target && !busy)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!valid) {
      setMessage('دو نود متفاوت از همین نقشه انتخاب کنید.')
      return
    }
    setBusy(true); setMessage('')
    try {
      await postSecure('/api/v1/discovery/observations', [{
        siteId, sourceKey: source, targetKey: target,
        sourcePort: sourcePort.trim() || null, targetPort: targetPort.trim() || null,
        protocol: 'MANUAL', observedAtUtc: new Date().toISOString(), ttlSeconds: 3600,
      }])
      onChanged?.()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['topology', 'reported', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['evidence', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['overview', siteId] }),
      ])
      setTarget(''); setSourcePort(''); setTargetPort('')
      setMessage('ارتباط اپراتوری برای یک ساعت ثبت شد؛ تأیید فیزیکی انجام نشده است.')
    } catch { setMessage('ثبت نشد؛ مجوز سایت، نشست یا ارتباط API را بررسی کنید.') }
    finally { setBusy(false) }
  }

  return <form className="access-form access-form--topology" onSubmit={e => void onSubmit(e)} dir="rtl"
    aria-label="ثبت گزارش ارتباط دستی نودها">
    <strong>گزارش ارتباط بین نودهای موجود</strong>
    <p className="ig-dock-message">
      از منوی راست‌کلیک نود، «ثبت ارتباط از این نود» را بزنید؛ یا دو نود را از فهرست انتخاب کنید.
      این گزارش صرفاً ادعای اپراتور است، در نقشه با شواهد LLDP یکسان نمایش داده نمی‌شود و پس از یک ساعت منقضی می‌شود.
    </p>
    <label>نود مبدأ
      <select aria-label="نود مبدأ ارتباط" required value={exists(source) ? source : ''}
        disabled={busy || options.length < 2}
        onChange={event => setSource(event.target.value)}>
        <option value="">انتخاب نام یا IP نود مبدأ</option>
        {options.map(item => <option key={item.id} value={item.id}>
          {item.name}{item.address !== 'نامشخص' && item.name !== item.address ? ' · '+item.address : ''}
        </option>)}
      </select>
    </label>
    <label>پورت مبدأ (اختیاری)
      <input aria-label="پورت مبدأ ارتباط" maxLength={80} value={sourcePort}
        placeholder="مثلاً ether2" onChange={e => setSourcePort(e.target.value)}/>
    </label>
    <label>نود مقصد
      <select aria-label="نود مقصد ارتباط" required value={exists(target) ? target : ''}
        disabled={busy || options.length < 2}
        onChange={event => setTarget(event.target.value)}>
        <option value="">انتخاب نام یا IP نود مقصد</option>
        {options.filter(item => item.id !== source).map(item => <option key={item.id} value={item.id}>
          {item.name}{item.address !== 'نامشخص' && item.name !== item.address ? ' · '+item.address : ''}
        </option>)}
      </select>
    </label>
    <label>پورت مقصد (اختیاری)
      <input aria-label="پورت مقصد ارتباط" maxLength={80} value={targetPort}
        placeholder="مثلاً sfp-sfpplus1" onChange={e => setTargetPort(e.target.value)}/>
    </label>
    <button type="submit" disabled={!valid}>ثبت گزارش تأییدنشده (۱ ساعت)</button>
    {options.length < 2 && <p role="status">ابتدا حداقل دو نود با شواهد سایت لازم است.</p>}
    {message && <span role="status">{message}</span>}
  </form>
}
