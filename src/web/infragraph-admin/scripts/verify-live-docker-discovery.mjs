// Browser-to-SignalR-to-PostgreSQL-to-Worker end-to-end smoke.
// Probes ONLY the test project's own PostgreSQL container address (/32).
// Uses the local .env admin account without writing credentials to logs.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const root = resolve(import.meta.dirname, '../../../..')
const env = Object.fromEntries(
  readFileSync(resolve(root, 'infra/local/.env'), 'utf8')
    .split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const i = line.indexOf('=')
      const value = line.slice(i + 1).trim()
      return [line.slice(0, i), /^['"].*['"]$/.test(value) ? value.slice(1, -1) : value]
    }),
)
if (!env.INFRAGRAPH_ADMIN_EMAIL || !env.INFRAGRAPH_ADMIN_PASSWORD)
  throw new Error('Missing local pilot admin credentials')
const inspection = JSON.parse(execFileSync('docker',
  ['inspect', 'infragraph-pilot-postgres-1'], { encoding: 'utf8' }))[0]
const networks = inspection.NetworkSettings.Networks
const privateNetwork = Object.entries(networks)
  .find(([name]) => name === 'infragraph-pilot_private')
if (!privateNetwork) throw new Error('Isolated pilot Docker network not found')
const target = privateNetwork[1].IPAddress
if (!/^172\.(1[6-9]|2\d|3[01])\.|^10\.|^192\.168\./.test(target))
  throw new Error('Docker test address is not private IPv4')

const base = 'https://localhost:8443'
const siteId = 'docker-live-' + randomUUID().slice(0, 12)
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' })
const context = await browser.newContext({ ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
let jobId
let sawRealtimeFrame = false
page.on('websocket', websocket => {
  if (!websocket.url().includes('/hubs/status')) return
  websocket.on('framereceived', frame => {
    const content = String(frame.payload)
    if (content.includes('scanEvent') && content.includes(siteId))
      sawRealtimeFrame = true
  })
})
try {
  await page.goto(base + '/topology', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'ورود به مرکز مدیریت شبکه' }))
    .toBeVisible()
  await page.getByLabel('ایمیل').fill(env.INFRAGRAPH_ADMIN_EMAIL)
  await page.getByLabel('رمز عبور').fill(env.INFRAGRAPH_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'توپولوژی شبکه' })).toBeVisible()
  await expect(page.getByText('DEMO DATA · NOT LIVE')).toHaveCount(0)

  await page.getByLabel('شناسه سایت واقعی').fill(siteId)
  await page.getByLabel('CIDRهای مجاز برای اسکن').fill(target + '/32')
  await page.getByLabel('فاصله اسکن ثانیه').fill('30')
  await page.getByRole('checkbox', { name: /مجوز اسکن این CIDRها را دارم/ }).check()
  await expect(page.getByText('SignalR متصل')).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'شروع اسکن واقعی' }).click()
  await expect(page.getByText('میزبان کشف شد')).toBeVisible({ timeout: 40000 })
  await expect(page.getByTestId('node-' + target)).toBeAttached({ timeout: 20000 })
  await expect.poll(() => sawRealtimeFrame, { timeout: 20000 }).toBe(true)

  const jobsResponse = await context.request.get(base +
    '/api/v1/discovery/scans?siteId=' + encodeURIComponent(siteId))
  if (!jobsResponse.ok()) throw new Error('Cannot read persisted scan job')
  const jobs = await jobsResponse.json()
  jobId = jobs.items[0]?.id
  if (!jobId) throw new Error('Scan job was not persisted')
  const graphResponse = await context.request.get(base +
    '/api/v1/topology/graph?siteId=' + encodeURIComponent(siteId))
  const graph = await graphResponse.json()
  if (!graph.nodes.some(node => node.id === target && node.probeStatus === 'responsive'))
    throw new Error('Live packet response not in PostgreSQL-backed topology')
  if (graph.links.length !== 0)
    throw new Error('Physical links were inferred from an IP-only probe')
  console.log('PASS browser login + real Docker /32 packet probe + PostgreSQL topology + SignalR scanEvent; physical links not fabricated')
} finally {
  // Never leave test polling running, even when the browser assertion fails.
  try {
    const response = await context.request.get(base +
      '/api/v1/discovery/scans?siteId=' + encodeURIComponent(siteId))
    if (response.ok()) {
      const list = await response.json()
      const pending = list.items.find(item => ['pending','running','cancelling'].includes(item.status))
      if (pending && pending.status !== 'cancelling') {
        const csrf = await context.request.get(base + '/api/v1/auth/csrf')
        const token = (await csrf.json()).token
        await context.request.post(base + '/api/v1/discovery/scans/' + pending.id + '/cancel',
          { data: {}, headers: { 'X-CSRF-TOKEN': token } })
      }
    }
  } catch (error) {
    console.error('WARNING: cleanup could not be confirmed: ' +
      (error instanceof Error ? error.message : String(error)))
  }
  await browser.close()
}
