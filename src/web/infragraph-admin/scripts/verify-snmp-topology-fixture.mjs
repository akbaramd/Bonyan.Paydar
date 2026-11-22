// Database-backed Production browser contract check for SNMPv3/LLDP projection.
// Fixtures are synthetic, site-isolated, and removed. NO LAN PACKETS sent.
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const root = resolve(import.meta.dirname, '../../../..')
const env = Object.fromEntries(readFileSync(resolve(root, 'infra/local/.env'), 'utf8')
  .split(/\r?\n/).filter(x => x && !x.startsWith('#') && x.includes('='))
  .map(x => {
    const i = x.indexOf('=')
    const value = x.slice(i + 1).trim()
    return [x.slice(0, i), /^['"].*['"]$/.test(value) ? value.slice(1, -1) : value]
  }))
const site = 'snmp-fixture-' + randomUUID().slice(0, 12)
const a = '10.253.254.10', b = '10.253.254.11'
function sql(statement) {
  execFileSync('docker', ['exec', 'infragraph-pilot-postgres-1',
    'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'infragraph_owner', '-d', 'infragraph', '-c', statement],
  { encoding: 'utf8', stdio: 'pipe' })
}
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge' })
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
try {
  sql(`INSERT INTO discovery.managed_devices
    (site_id,address,system_name,system_description,system_object_id,kind,chassis_id,last_seen_at_utc)
    VALUES
    ('${site}','${a}','fixture-access-switch','synthetic managed switch','1.3.6.1.4.1.9','switch','AABBCCDD0001',now()),
    ('${site}','${b}','fixture-core-router','synthetic managed router','1.3.6.1.4.1.9','router','AABBCCDD0002',now())`)
  sql(`INSERT INTO discovery.lldp_neighbors
    (id,site_id,local_address,local_port,remote_port,remote_chassis_id,remote_system_name,observed_at_utc)
    VALUES ('${randomUUID()}','${site}','${a}','Gi1/0/1','Gi0/0','AABBCCDD0002','fixture-core-router',now())`)
  sql(`INSERT INTO discovery.fdb_learned_macs
    (id,site_id,bridge_address,mac_address,learned_port,observed_at_utc)
    VALUES ('${randomUUID()}','${site}','${a}','00:11:22:33:44:55','Gi1/0/1',now())`)

  const base = 'https://localhost:8443'
  await page.goto(base + '/topology', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('ایمیل').fill(env.INFRAGRAPH_ADMIN_EMAIL)
  await page.getByLabel('رمز عبور').fill(env.INFRAGRAPH_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await page.getByLabel('شناسه سایت واقعی').fill(site)
  const response = await context.request.get(base + '/api/v1/topology/graph?siteId=' + site)
  if (!response.ok()) throw new Error('SNMP topology API returned ' + response.status())
  const graph = await response.json()
  const devices = Object.fromEntries(graph.nodes.map(x => [x.id, x]))
  if (devices[a]?.deviceKind !== 'switch' || devices[b]?.deviceKind !== 'router')
    throw new Error('Authenticated device identity is not projected')
  if (devices[a]?.learnedMacCount !== 1)
    throw new Error('FDB learning metadata was not projected')
  if (graph.links.length !== 1 || graph.links[0].protocol !== 'LLDP' ||
      graph.links[0].source !== a || graph.links[0].target !== b ||
      graph.links[0].evidenceSource !== 'snmpv3-authpriv')
    throw new Error('Authenticated LLDP chassis correlation/provenance failed')
  await expect(page.getByTestId('node-' + a)).toBeAttached({ timeout: 20000 })
  await expect(page.getByTestId('node-' + b)).toBeAttached()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 20000 })
  await expect(page.getByText('شواهد اتصال LLDP: 1 لینک', { exact: false })).toBeVisible()
  console.log('PASS real PostgreSQL + HTTPS + React browser: 2 synthetic identities, 1 LLDP edge, 1 learned FDB MAC; no packets')
} finally {
  await browser.close()
  try {
    sql(`BEGIN;
      DELETE FROM discovery.fdb_learned_macs WHERE site_id='${site}';
      DELETE FROM discovery.lldp_neighbors WHERE site_id='${site}';
      DELETE FROM discovery.managed_devices WHERE site_id='${site}';
      COMMIT;`)
  } catch {
    console.error('WARNING: fixture cleanup failed for ' + site)
  }
}