import { useState, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { postSecure } from '../../../shared/auth/session'
import { getEvidence, type WalkPreview } from '../api/evidence'
import { EvidenceWalkControls } from './EvidenceWalkControls'
import { evidenceBatches, parseEvidenceExport, type ImportedLink } from '../lib/import-evidence'

/** Read-only evidence review and explicit, manually authorized import/retraction. */
export function EvidenceManager({ siteId, canWrite, onPreview, onEvidenceChanged }: {
  siteId: string
  canWrite: boolean
  onPreview: (result: WalkPreview) => void
  onEvidenceChanged: () => void
}) {
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<ImportedLink[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const history = useQuery({
    queryKey: ['evidence', siteId, page],
    queryFn: ({ signal }) => getEvidence(siteId, page, signal),
    enabled: Boolean(siteId), retry: false,
  })

  async function selectFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setPreview([])
    setError('')
    setNotice('')
    if (!file) return
    if (file.size > 262_144) {
      setError('فایل نباید بیش از ۲۵۶ کیلوبایت باشد.')
      return
    }
    try {
      const rows = parseEvidenceExport(await file.text(), siteId)
      setPreview(rows)
      setNotice(`${rows.length} لینک برای بررسی و ثبت آماده است؛ هنوز داده‌ای ارسال نشده است.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'واردکردن فایل ناموفق بود.')
    }
  }

  async function importRows() {
    if (busy || !canWrite || preview.length === 0) return
    setBusy(true)
    setError('')
    let accepted = 0
    try {
      for (const batch of evidenceBatches(preview)) {
        await postSecure('/api/v1/discovery/observations', batch)
        accepted += batch.length
      }
      setPreview([])
      setNotice(`${accepted} گزارش لینک ثبت شد؛ هویت تجهیزات و صحت ارتباط‌ها تأیید نشده است.`)
    } catch {
      setPreview(preview.slice(accepted))
      setError(`واردکردن کامل نشد؛ ${accepted} گزارش ثبت شده و باقی‌مانده ارسال نشده است.`)
    } finally {
      if (accepted > 0) {
        onEvidenceChanged()
        await Promise.all([
        client.invalidateQueries({ queryKey: ['topology', 'reported', siteId] }),
        client.invalidateQueries({ queryKey: ['evidence', siteId] }),
        client.invalidateQueries({ queryKey: ['overview', siteId] }),
        ])
      }
      setBusy(false)
    }
  }

  async function retract(id: string) {
    if (busy || !canWrite) return
    setBusy(true)
    setError('')
    try {
      await postSecure(`/api/v1/discovery/observations/${id}/retract`, {})
      onEvidenceChanged()
      await Promise.all([
        client.invalidateQueries({ queryKey: ['topology', 'reported', siteId] }),
        client.invalidateQueries({ queryKey: ['evidence', siteId] }),
        client.invalidateQueries({ queryKey: ['overview', siteId] }),
      ])
      setNotice('گزارش از گراف کنار گذاشته شد؛ سابقه آن برای ممیزی باقی ماند.')
    } catch { setError('ابطال گزارش انجام نشد؛ دسترسی یا ارتباط سرور را بررسی کنید.') }
    finally { setBusy(false) }
  }

  return <section className="access-form access-form--topology" aria-label="مرور شواهد توپولوژی" dir="rtl">
    <div className="section-heading">
      <div><h2>شواهد شبکه · {siteId || 'سایت انتخاب نشده'}</h2>
        <p>اطلاعات گزارش‌شده توسط اپراتور، نه کشف یا تأیید مستقل شبکه.</p></div>
    </div>
    <EvidenceWalkControls siteId={siteId} onPreview={onPreview}/>
    {canWrite && <div>
      <label>ورود دسته‌ای JSON (حداکثر ۱۰۰۰ لینک)
        <input type="file" aria-label="فایل JSON شواهد" accept=".json,application/json"
          disabled={busy || !siteId} onChange={e => { void selectFile(e) }}/>
      </label>
      <p>هر رکورد: sourceKey، targetKey، sourcePort، targetPort، protocol
        (LLDP / CDP / MANUAL)، observedAtUtc و ttlSeconds. ورود داده صرفاً گزارش دستی است.</p>
      {preview.length > 0 && <div>
        <span role="status">{preview.length} لینک آماده ثبت</span>
        <button type="button" disabled={busy || !siteId} onClick={() => void importRows()}>
          تأیید و ثبت {preview.length} لینک
        </button>
        <button type="button" disabled={busy} onClick={() => setPreview([])}>لغو ورود</button>
      </div>}
    </div>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {history.isError && <p role="alert">دریافت سوابق شواهد از API ناموفق بود.</p>}
    {history.isPending && siteId && <p>در حال بارگذاری سوابق…</p>}
    {history.data && <>
      <div className="access-table-wrapper"><table className="access-table">
        <thead><tr><th>مبدأ / پورت</th><th>مقصد / پورت</th><th>پروتکل</th>
          <th>وضعیت شاهد</th><th>دریافت</th><th>عملیات</th></tr></thead>
        <tbody>{history.data.items.map(row => <tr key={row.id}>
          <td dir="ltr">{row.sourceKey} · {row.sourcePort || '?'}</td>
          <td dir="ltr">{row.targetKey} · {row.targetPort || '?'}</td>
          <td dir="ltr">{row.protocol}</td>
          <td>{row.status === 'retracted' ? 'ابطال‌شده' : row.status === 'expired'
            ? 'منقضی' : 'تازه · تأییدنشده'}</td>
          <td>{new Date(row.receivedAtUtc).toLocaleString('fa-IR')}</td>
          <td>{canWrite && row.status !== 'retracted' &&
            <button type="button" disabled={busy} onClick={() => void retract(row.id)}
              aria-label={`ابطال گزارش ${row.sourceKey} به ${row.targetKey}`}>ابطال گزارش</button>}
          </td>
        </tr>)}</tbody>
      </table></div>
      {history.data.total === 0 && <p>هیچ گزارشی برای این سایت ثبت نشده است.</p>}
      <div className="access-pagination">
        <span>صفحه {history.data.page} · مجموع {history.data.total.toLocaleString('fa-IR')}</span>
        <button type="button" disabled={page <= 1 || busy} onClick={() => setPage(x => x - 1)}>قبلی</button>
        <button type="button" disabled={page * 25 >= history.data.total || busy} onClick={() => setPage(x => x + 1)}>بعدی</button>
      </div>
    </>}
  </section>
}