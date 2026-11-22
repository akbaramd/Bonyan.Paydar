import { useState, type FormEvent } from 'react'
import { postSecure } from '../../../shared/auth/session'
import { walkPreviewSchema, type WalkPreview } from '../api/evidence'

/**
 * Bounded traversal of stored evidence only. No network interfaces or active
 * discovery credentials are exposed to this client.
 */
export function EvidenceWalkControls({ siteId, onPreview }: {
  siteId: string
  onPreview: (result: WalkPreview) => void
}) {
  const [scope, setScope] = useState('')
  const [seed, setSeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    const approvedAssets = [...new Set(scope.split(/[,\n]/).map(x => x.trim()).filter(Boolean))]
    const seeds = [...new Set(seed.split(/[,\n]/).map(x => x.trim()).filter(Boolean))]
    if (!siteId || approvedAssets.length < 1 || approvedAssets.length > 512 ||
        seeds.length < 1 || seeds.length > 32 ||
        [...approvedAssets, ...seeds].some(x => x.length > 160 || x.length < 1) ||
        seeds.some(x => !approvedAssets.includes(x))) {
      setError('شناسه آغاز باید در فهرست تجهیزات مجاز باشد؛ حداکثر ۵۱۲ تجهیز و ۳۲ مبدأ.')
      return
    }
    setBusy(true)
    try {
      const body = {
        siteId, approvedAssets, seeds, maxNodes: 256, maxDepth: 8,
        maxNeighborsPerNode: 64,
      }
      const response = walkPreviewSchema.parse(
        await postSecure('/api/v1/discovery/walk-preview', body))
      onPreview(response)
      setMessage(`پیمایش فقط از شواهد ثبت‌شده انجام شد: ${response.probedAssets} نود؛ ${response.skippedOutOfScope} همسایه خارج از محدوده کنار گذاشته شد.`)
    } catch { setError('پیش‌نمایش محدوده‌دار انجام نشد؛ داده، نشست و مجوز سایت را بررسی کنید.') }
    finally { setBusy(false) }
  }
  return <form className="access-form" dir="rtl" onSubmit={e => void submit(e)}>
    <strong>پیمایش محدوده‌دار شواهد (آفلاین)</strong>
    <p>این عملیات فقط لینک‌های قبلاً گزارش‌شده را دنبال می‌کند؛ هیچ بسته‌ای به شبکه نمی‌فرستد. واردکردن CIDR باعث اسکن نمی‌شود.</p>
    <label>شناسه تجهیزات مجاز (با ویرگول یا خط جدید)
      <textarea aria-label="تجهیزات مجاز برای پیمایش" maxLength={65536} required
        placeholder="Core, Access, Distribution" value={scope}
        onChange={e => setScope(e.target.value)}/>
    </label>
    <label>مبدأهای آغاز پیمایش
      <input aria-label="مبدأ پیمایش" maxLength={5120} required
        placeholder="Core" value={seed} onChange={e => setSeed(e.target.value)}/>
    </label>
    <button type="submit" disabled={busy || !siteId}>اجرای پیش‌نمایش شواهد</button>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </form>
}
