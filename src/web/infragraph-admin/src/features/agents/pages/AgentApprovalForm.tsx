import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../shared/ui/Button'
import { approveAgent } from '../api/agents'

/** Manual admin approval: installation identity must be read from the trusted client. */
export default function AgentApprovalForm() {
  const queryClient = useQueryClient()
  const [siteId, setSiteId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [installationEpoch, setInstallationEpoch] = useState('')
  const [thumbprint, setThumbprint] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    if (!uuid.test(agentId) || !uuid.test(installationEpoch) ||
        !/^[0-9a-fA-F]{40}$/.test(thumbprint) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(siteId)) {
      setError('شناسه‌ها، سایت یا اثرانگشت گواهی معتبر نیستند.')
      return
    }
    setBusy(true)
    try {
      await approveAgent({
        agentId, installationEpoch, siteId,
        clientCertificateThumbprint: thumbprint.trim().toUpperCase(),
      })
      setSuccess('Agent تأیید شد. تا نخستین گزارش معتبر، وضعیت آن «در انتظار» است.')
      setAgentId('')
      setInstallationEpoch('')
      setThumbprint('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agents'] }),
        queryClient.invalidateQueries({ queryKey: ['sites'] }),
      ])
    } catch {
      setError('ثبت انجام نشد. تعارض هویت، خطای اتصال یا سطح دسترسی را بررسی کنید.')
    } finally { setBusy(false) }
  }

  return <section className="surface-card data-section">
    <div className="section-heading"><div>
      <h2>تأیید گواهی Agent</h2>
      <p>فقط مدیر می‌تواند یک Agent و گواهی صادرشده توسط CA سازمان را مجاز کند.</p>
    </div></div>
    <form className="access-form" onSubmit={event => { void submit(event) }}>
      <label>سایت
        <input required autoComplete="off" value={siteId}
          onChange={e => setSiteId(e.target.value)} placeholder="site-a" maxLength={120} />
      </label>
      <label>شناسه Agent
        <input required autoComplete="off" dir="ltr" value={agentId}
          onChange={e => setAgentId(e.target.value)} placeholder="Agent ID (GUID)" />
      </label>
      <label>Installation Epoch
        <input required autoComplete="off" dir="ltr" value={installationEpoch}
          onChange={e => setInstallationEpoch(e.target.value)} placeholder="Installation Epoch (GUID)" />
      </label>
      <label>اثر انگشت SHA-1 گواهی دستگاه
        <input required autoComplete="off" dir="ltr" value={thumbprint} maxLength={40}
          onChange={e => setThumbprint(e.target.value)} placeholder="40 hexadecimal characters" />
      </label>
      <Button variant="primary" type="submit" disabled={busy}>
        {busy ? 'در حال ثبت…' : 'تأیید Agent'}
      </Button>
    </form>
    {error && <p role="alert">{error}</p>}
    {success && <p role="status">{success}</p>}
  </section>
}
