// An opt-in, isolated end-to-end lifecycle test against the project's own
// ephemeral Docker bridge container. No LAN targets or unrelated containers.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const root = resolve(import.meta.dirname, '../../../..')
const env = Object.fromEntries(
  readFileSync(resolve(root, 'infra/local/.env'), 'utf8')
    .split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const index = line.indexOf('=')
      const value = line.slice(index + 1).trim()
      return [line.slice(0, index), /^['"].*['"]$/.test(value)
        ? value.slice(1, -1) : value]
    }),
)
if (!env.INFRAGRAPH_ADMIN_EMAIL || !env.INFRAGRAPH_ADMIN_PASSWORD)
  throw new Error('Missing local isolated pilot credentials.')

const siteId = 'docker-lifecycle-' + randomUUID().slice(0, 10)
const fixture = 'infragraph-pilot-lifecycle-' + randomUUID().slice(0, 10)
const network = 'infragraph-pilot_private'
const base = 'https://localhost:8443'
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()

const net = JSON.parse(docker('network', 'inspect', network))
if (net[0]?.Name !== network || net[0]?.Driver !== 'bridge')
  throw new Error('Refusing probe outside the project private Docker bridge network.')
// Do not create a shared or privileged container. This only sleeps and responds
// to normal Docker IPv4 ICMP, and never touches the Windows host networking.
function startFixture(ip) {
  const options = ['run', '--detach', '--rm', '--name', fixture,
    '--network', network]
  if (ip) options.push('--ip', ip)
  docker(...options, 'postgres:17-alpine', 'sleep', '600')
  const info = JSON.parse(docker('inspect', fixture))[0]
  const address = info?.NetworkSettings?.Networks?.[network]?.IPAddress
  if (!/^172\.(1[6-9]|2\d|3[01])\.|^10\.|^192\.168\./.test(address))
    throw new Error('Isolated fixture address is not private IPv4.')
  return address
}
function removeFixture() {
  try { docker('rm', '-f', fixture) } catch { /* already removed */ }
}
let address
let browser
let context
const realtimeKinds = []
try {
  address = startFixture()
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' })
  context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.on('websocket', socket => {
    if (!socket.url().includes('/hubs/status')) return
    socket.on('framereceived', frame => {
      const raw = String(frame.payload)
      for (const unit of raw.split('\x1e')) {
        if (!unit.includes('scanEvent')) continue
        try {
          const data = JSON.parse(unit)
          const event = data.arguments?.[0]
          if (event?.siteId === siteId) realtimeKinds.push(event.kind)
        } catch { /* SignalR may transmit other frame types. */ }
      }
    })
  })
  await page.goto(base + '/topology')
  await expect(page.getByRole('heading', { name: 'ورود به مرکز مدیریت شبکه' })).toBeVisible()
  await page.getByLabel('ایمیل').fill(env.INFRAGRAPH_ADMIN_EMAIL)
  await page.getByLabel('رمز عبور').fill(env.INFRAGRAPH_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'توپولوژی شبکه' })).toBeVisible()
  await page.getByLabel('شناسه سایت واقعی').fill(siteId)
  await page.getByLabel('CIDRهای مجاز برای اسکن').fill(address + '/32')
  await page.getByLabel('فاصله اسکن ثانیه').fill('30')
  await page.getByRole('checkbox', { name: /مجوز اسکن این CIDRها را دارم/ }).check()
  await expect(page.getByText('SignalR متصل')).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'شروع اسکن واقعی' }).click()

  const currentHost = async () => {
    const res = await context.request.get(base + '/api/v1/discovery/hosts?siteId=' + siteId)
    if (!res.ok()) return 'api-error'
    const data = await res.json()
    return data.items.find(x => x.address === address)?.status ?? 'not-seen'
  }
  await expect.poll(currentHost, { timeout: 30000 }).toBe('responsive')
  await expect.poll(() => realtimeKinds.includes('host-discovered'),
    { timeout: 30000 }).toBe(true)
  console.log('PASS new Docker node discovered; persisted responsive, SignalR discovered')

  removeFixture()
  await expect.poll(currentHost, { timeout: 105000, intervals: [1000, 3000] })
    .toBe('suspect')
  await expect.poll(() => realtimeKinds.includes('host-suspect'),
    { timeout: 25000 }).toBe(true)
  console.log('PASS missing node first sweep -> suspect, delivered via SignalR')

  await expect.poll(currentHost, { timeout: 105000, intervals: [1000, 3000] })
    .toBe('unresponsive')
  await expect.poll(() => realtimeKinds.includes('host-unresponsive'),
    { timeout: 25000 }).toBe(true)
  console.log('PASS missing node second sweep -> unresponsive, delivered via SignalR')

  const restarted = startFixture(address)
  if (restarted !== address) throw new Error('Restored fixture address changed')
  await expect.poll(currentHost, { timeout: 105000, intervals: [1000, 3000] })
    .toBe('responsive')
  await expect.poll(() => realtimeKinds.includes('host-recovered'),
    { timeout: 25000 }).toBe(true)
  console.log('PASS restored Docker node -> responsive, delivered via SignalR')
} finally {
  // Cancel test jobs and destroy ONLY the named ephemeral fixture. The scoped
  // application volume, postgres container, and all unrelated containers stay.
  try {
    if (context) {
      const res = await context.request.get(base + '/api/v1/discovery/scans?siteId=' + siteId)
      if (res.ok()) {
        const data = await res.json()
        const active = data.items.find(x => ['pending', 'running'].includes(x.status))
        if (active) {
          const csrf = (await (await context.request.get(base + '/api/v1/auth/csrf')).json()).token
          await context.request.post(base + '/api/v1/discovery/scans/' + active.id + '/cancel',
            { data: {}, headers: { 'X-CSRF-TOKEN': csrf } })
        }
      }
    }
  } catch (error) {
    console.error('WARNING: unable to confirm job cancellation: ' +
      (error instanceof Error ? error.message : String(error)))
  }
  removeFixture()
  if (browser) await browser.close()
}
