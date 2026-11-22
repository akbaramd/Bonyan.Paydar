import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { postSecure, useSession } from '../../../shared/auth/session'

export default function AccountPage() {
  const user = useSession()
  const cache = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmation) { setMessage('تکرار رمز یکسان نیست.'); return }
    if (newPassword === currentPassword) { setMessage('رمز جدید باید متفاوت باشد.'); return }
    setBusy(true); setMessage('')
    try {
      await postSecure('/api/v1/auth/password', { currentPassword, newPassword })
      cache.clear()
      window.location.assign('/')
    } catch {
      setMessage('تغییر رمز انجام نشد. رمز فعلی یا اتصال به سرور را بررسی کنید.')
    } finally {
      setCurrentPassword(''); setNewPassword(''); setConfirmation('')
      setBusy(false)
    }
  }

  return <section className="access-admin" dir="rtl">
    <h1>حساب کاربری</h1>
    <p dir="ltr">{user.data?.email}</p>
    <p>تغییر رمز، نشست‌های قبلی را باطل می‌کند.</p>
    <form className="access-form" onSubmit={e => void submit(e)}>
      <label>رمز فعلی<input type="password" required autoComplete="current-password"
        value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label>
      <label>رمز جدید<input type="password" required autoComplete="new-password"
        minLength={14} maxLength={256} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
      <label>تکرار رمز<input type="password" required autoComplete="new-password"
        minLength={14} maxLength={256} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <button type="submit" disabled={busy}>تغییر رمز</button>
    </form>
    {message && <p role="alert">{message}</p>}
  </section>
}
