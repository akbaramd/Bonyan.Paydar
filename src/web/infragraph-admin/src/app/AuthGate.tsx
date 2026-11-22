import { useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HttpError } from '../shared/api/http'
import { meSchema, postSecure, useSession } from '../shared/auth/session'

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const session = meSchema.parse(await postSecure('/api/v1/auth/login', { email, password }))
      setPassword('')
      qc.removeQueries({ predicate: query => query.queryKey[0] !== 'auth' }) // Retain the active auth observer.
      qc.setQueryData(['auth', 'me'], session)
    } catch (err) {
      setError(err instanceof HttpError && err.status === 429
        ? 'تعداد تلاش بیش از حد است. پس از یک دقیقه دوباره تلاش کنید.'
        : 'ورود ناموفق بود. مشخصات حساب یا وضعیت سرور را بررسی کنید.')
    } finally { setBusy(false) }
  }
  return <main className="access-screen" dir="rtl">
    <form className="access-card" onSubmit={(e) => void onSubmit(e)}>
      <p className="access-eyebrow" dir="ltr">INFRAGRAPH / SECURE ACCESS</p>
      <h1>ورود به مرکز مدیریت شبکه</h1>
      <p>اطلاعات عملیاتی فقط برای کاربران مجاز نمایش داده می‌شود.</p>
      <label>ایمیل<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>رمز عبور<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'در حال بررسی…' : 'ورود'}</button>
    </form>
  </main>
}

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession()
  if (session.isPending) return <main className="access-screen" role="status">در حال بررسی نشست کاربری…</main>
  if (session.isSuccess) return children
  if (session.error instanceof HttpError && session.error.status === 401) return <LoginScreen />
  return <main className="access-screen" role="alert">سرویس احراز هویت در دسترس نیست. تا زمان اتصال امن، داده‌های شبکه نمایش داده نمی‌شوند.</main>
}