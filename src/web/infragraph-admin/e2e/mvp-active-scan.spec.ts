import { expect, test } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

const jobId = 'd1111111-1111-4111-8111-111111111111'
const ok = (value: unknown, status = 200) => ({
  status, contentType: 'application/json', body: JSON.stringify(value),
})

test('admin approves bounded real IPv4 scope, creates job, reads progress and stops it', async ({ page }) => {
  await mockAdminSession(page)
  let running = false
  let cancelling = false
  let received: unknown = null
  await page.route('**/api/v1/sites', route => route.fulfill(ok({ sites: ['alpha'] })))
  await page.route('**/api/v1/auth/csrf', route => route.fulfill(ok({ token: 'test-csrf' })))
  await page.route('**/api/v1/topology/graph?siteId=alpha', route => route.fulfill(ok({
    siteId: 'alpha', nodes: [], links: [], staleObservations: 0, truncated: false,
    generatedAtUtc: '2026-11-20T10:00:00Z',
    provenance: 'operator-reported-unverified',
  })))
  await page.route('**/api/v1/discovery/scans?siteId=alpha', route => route.fulfill(ok({
    siteId: 'alpha', items: running ? [{
      id: jobId, status: cancelling ? 'cancelling' : 'running',
      cidrs: ['192.168.20.0/24'], targetCount: 254,
      probedCount: 12, responsiveCount: 3, cycle: 0,
      intervalSeconds: 60, requestedAtUtc: '2026-11-20T10:00:00Z',
      startedAtUtc: '2026-11-20T10:00:01Z', lastSweepAtUtc: null,
      completedAtUtc: null, error: null,
    }] : [],
  })))
  await page.route('**/api/v1/discovery/scans/**/events?afterId=0', route => route.fulfill(ok({
    items: [{ id: 1, siteId: 'alpha', jobId, kind: 'host-discovered',
      address: '192.168.20.15', status: 'responsive',
      probedCount: 12, targetCount: 254, atUtc: '2026-11-20T10:00:02Z' }],
    truncated: false,
  })))
  await page.route('**/api/v1/discovery/scans', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf')
    received = route.request().postDataJSON()
    running = true
    await route.fulfill(ok({ id: jobId, siteId: 'alpha', status: 'pending', targetCount: 254 }, 201))
  })
  await page.route('**/api/v1/discovery/scans/*/cancel', async route => {
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf')
    cancelling = true
    await route.fulfill({ status: 202 })
  })
  await page.goto('/topology')
  await page.getByRole('button', { name: 'بازکردن تب اسکن' }).click()
  const panel = page.getByRole('region', { name: 'کشف فعال شبکه' })
  await expect(panel).toBeVisible()
  await panel.getByLabel('CIDRهای مجاز برای اسکن').fill('192.168.20.0/24')
  await expect(panel.getByRole('button', { name: 'شروع اسکن واقعی' })).toBeDisabled()
  await panel.getByRole('checkbox').check()
  await panel.getByRole('button', { name: 'شروع اسکن واقعی' }).click()
  await expect.poll(() => received).toEqual({
    siteId: 'alpha', cidrs: ['192.168.20.0/24'], intervalSeconds: 60, approved: true,
  })
  await expect(panel.getByText('اسکن فعال', { exact: true })).toBeVisible()
  await expect(panel.getByText(/۳ میزبان پاسخ‌گو|3 میزبان پاسخ‌گو/)).toBeVisible()
  await expect(panel.getByText('192.168.20.15')).toBeVisible()
  await panel.getByRole('button', { name: 'توقف اسکن' }).click()
  await expect(panel.getByText('در حال توقف')).toBeVisible()
})

test('non-admin user cannot launch network scans', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill(ok({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'viewer@example.invalid', role: 'viewer', siteId: 'alpha',
  })))
  await page.route('**/api/v1/topology/graph?siteId=alpha', route => route.fulfill(ok({
    siteId: 'alpha', nodes: [], links: [], staleObservations: 0, truncated: false,
    generatedAtUtc: '2026-11-20T10:00:00Z',
    provenance: 'operator-reported-unverified',
  })))
  await page.route('**/api/v1/discovery/scans?siteId=alpha', route => route.fulfill(ok({
    siteId: 'alpha', items: [],
  })))
  await page.goto('/topology')
  await page.getByRole('button', { name: 'بازکردن تب اسکن' }).click()
  const panel = page.getByRole('region', { name: 'کشف فعال شبکه' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'شروع اسکن واقعی' })).toHaveCount(0)
  await expect(panel.getByText('هنوز هیچ اسکن واقعی برای این سایت ثبت نشده است.')).toBeVisible()
})