import { Fragment, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { getJson } from '../../../shared/api/http'
import { postSecure, useSession } from '../../../shared/auth/session'

const schema = z.array(z.object({
  id: z.string().uuid(), email: z.string(), role: z.enum(['admin', 'operator', 'viewer']),
  siteId: z.string().nullable(), isActive: z.boolean(), createdAtUtc: z.string(),
}))
export default function AdminUsersPage() {
  const session = useSession()
  const qc = useQueryClient()
  const users = useQuery({
    queryKey: ['admin', 'users'], queryFn: ({ signal }) => getJson('/api/v1/admin/users', schema, signal),
    enabled: session.data?.role === 'admin',
  })
  const sites = useQuery({
    queryKey: ['sites'],
    queryFn: ({signal}) => getJson('/api/v1/sites',
      z.object({sites:z.array(z.string())}),signal),
    enabled: session.data?.role === 'admin', retry:false,
  })
  const siteOptions = sites.data?.sites ?? []
  const available = (id:string) => siteOptions.includes(id)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'operator' | 'viewer'>('viewer')
  const [siteId, setSiteId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<'admin' | 'operator' | 'viewer'>('viewer')
  const [editingSite, setEditingSite] = useState('')
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetValue, setResetValue] = useState('')
  const [notice, setNotice] = useState('')
  async function addUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (role !== 'admin' && !available(siteId)) {
      setError('سایت باید از فهرست محدوده‌های موجود انتخاب شود.');return
    }
    setBusy(true); setError('')
    try {
      await postSecure('/api/v1/admin/users', { email, password, role, siteId: role === 'admin' ? null : siteId.trim() })
      setEmail(''); setPassword('')
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    } catch { setError('ساخت کاربر ناموفق بود؛ ایمیل، رمز حداقل ۱۴ کاراکتری و سایت را بررسی کنید.') }
    finally { setBusy(false) }
  }
  async function disable(id: string) {
    setBusy(true); setError('')
    try {
      await postSecure(`/api/v1/admin/users/${id}/disable`, {})
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    } catch { setError('غیرفعال‌سازی کاربر انجام نشد.') }
    finally { setBusy(false) }
  }
  async function enable(id: string) {
    setBusy(true); setError('')
    try {
      await postSecure(`/api/v1/admin/users/${id}/enable`, {})
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    } catch { setError('فعال‌سازی کاربر انجام نشد.') }
    finally { setBusy(false) }
  }
  async function saveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId) return
    if (editingRole !== 'admin' && !available(editingSite)) {
      setError('سایت کاربر فقط از محدوده‌های موجود قابل انتخاب است.');return
    }
    setBusy(true); setError('')
    try {
      await postSecure(`/api/v1/admin/users/${editingId}/access`, {
        role: editingRole, siteId: editingRole === 'admin' ? null : editingSite.trim(),
      })
      setEditingId(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    } catch { setError('ویرایش سطح دسترسی انجام نشد.') }
    finally { setBusy(false) }
  }
  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!resetId || resetValue.length < 14) return
    setBusy(true); setError(''); setNotice('')
    try {
      await postSecure(`/api/v1/admin/users/${resetId}/reset-password`, { newPassword: resetValue })
      setNotice('رمز کاربر تغییر کرد؛ نشست‌های قبلی او باطل شدند.')
      setResetId(null)
    } catch { setError('بازنشانی رمز انجام نشد.') }
    finally { setResetValue(''); setBusy(false) }
  }
  if (session.data?.role !== 'admin')
    return <main className="access-admin" role="alert">دسترسی مدیر لازم است.</main>
  return <section className="access-admin" dir="rtl">
    <h1>کاربران و سطح دسترسی</h1>
    <p>کاربران سطح اپراتور و مشاهده‌گر فقط به سایت اختصاص‌یافته دسترسی دارند.</p>
    <form className="access-form" onSubmit={(e) => void addUser(e)}>
      <label>ایمیل<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>رمز اولیه<input type="password" minLength={14} maxLength={256} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>نقش<select value={role} onChange={e => setRole(e.target.value as typeof role)}>
        <option value="viewer">مشاهده‌گر</option><option value="operator">اپراتور</option><option value="admin">مدیر</option>
      </select></label>
      {role !== 'admin' && <label>سایت مجاز
        <select aria-label="انتخاب سایت کاربر" required value={siteId} onChange={e => setSiteId(e.target.value)}>
          <option value="">انتخاب سایت موجود</option>
          {siteOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>}
      <button type="submit" disabled={busy || (role !== 'admin' && !available(siteId))}>ایجاد کاربر</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {users.isError && <p role="alert">دریافت کاربران از سرور انجام نشد.</p>}
    {sites.isError && <p role="alert">سایت‌های موجود دریافت نشدند؛ تخصیص سایت تا بازیابی فهرست امکان‌پذیر نیست.</p>}
    {users.isPending && <p>در حال بارگذاری…</p>}
    {users.data && <div className="access-table-wrapper"><table className="access-table">
      <thead><tr><th>ایمیل</th><th>نقش</th><th>سایت</th><th>وضعیت</th><th>عملیات</th></tr></thead>
      <tbody>{users.data.map(user => <Fragment key={user.id}><tr>
        <td dir="ltr">{user.email}</td><td>{user.role}</td><td>{user.siteId ?? 'همه'}</td>
        <td>{user.isActive ? 'فعال' : 'غیرفعال'}</td>
        <td>{user.isActive && user.id !== session.data?.id &&
          <button type="button" disabled={busy} onClick={() => void disable(user.id)}>غیرفعال‌سازی</button>}
          {!user.isActive && <button type="button" disabled={busy} onClick={() => void enable(user.id)}>فعال‌سازی مجدد</button>}
          {user.id !== session.data?.id && <button type="button" disabled={busy}
            onClick={() => { setEditingId(user.id); setEditingRole(user.role); setEditingSite(user.siteId ?? '') }}>
            ویرایش دسترسی</button>}
          {user.id !== session.data?.id && <button type="button" disabled={busy} onClick={() => { setResetValue(''); setResetId(user.id) }}>بازنشانی رمز</button>}</td>
      </tr>
      {resetId === user.id && <tr><td colSpan={5}>
        <form className="access-form" onSubmit={event => void resetPassword(event)}>
          <label>رمز جدید کاربر<input type="password" aria-label="رمز جدید کاربر"
            autoComplete="new-password" required minLength={14} maxLength={256}
            value={resetValue} onChange={event => setResetValue(event.target.value)}/></label>
          <button type="submit" disabled={busy}>ثبت رمز جدید</button>
          <button type="button" onClick={() => { setResetId(null); setResetValue('') }}>انصراف</button>
        </form>
      </td></tr>}
      {editingId === user.id && <tr><td colSpan={5}>
        <form className="access-form" onSubmit={event => void saveAccess(event)}>
          <label>نقش جدید<select aria-label="نقش جدید" value={editingRole}
            onChange={event => setEditingRole(event.target.value as typeof editingRole)}>
            <option value="viewer">مشاهده‌گر</option><option value="operator">اپراتور</option><option value="admin">مدیر</option>
          </select></label>
          {editingRole !== 'admin' && <label>سایت مجاز جدید
            <select aria-label="انتخاب سایت جدید کاربر" required value={editingSite}
              onChange={event => setEditingSite(event.target.value)}>
              <option value="">انتخاب سایت موجود</option>
              {siteOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>}
          <button type="submit" disabled={busy || (editingRole !== 'admin' && !available(editingSite))}>ذخیره دسترسی</button>
          <button type="button" onClick={() => setEditingId(null)}>انصراف</button>
        </form>
      </td></tr>}
      </Fragment>)}</tbody>
    </table></div>}
  </section>
}