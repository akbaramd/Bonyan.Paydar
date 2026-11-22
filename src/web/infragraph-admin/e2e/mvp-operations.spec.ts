import { expect, test } from '@playwright/test'

const operator = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'operator@example.invalid', role: 'operator', siteId: 'alpha',
}
const incidentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const agentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const reply = (body: unknown) => ({
  status: 200, contentType: 'application/json', body: JSON.stringify(body),
})

test('operator incident is registered and resolved through CSRF APIs', async ({ page }) => {
  let status: 'open' | 'acknowledged' | 'resolved' = 'open'
  let present = false
  await page.route('**/api/v1/auth/me', route => route.fulfill(reply(operator)))
  await page.route('**/api/v1/auth/csrf', route => route.fulfill(reply({ token: 'test-csrf' })))
  await page.route('**/api/v1/incidents?**', route => route.fulfill(reply({
    siteId: 'alpha', page: 1, pageSize: 25, total: present ? 1 : 0,
    provenance: 'operator-reported-unverified', automatedDetection: false,
    items: present ? [{
      id: incidentId, siteId: 'alpha', title: 'Core down', description: null,
      severity: 'high', status, origin: 'operator-reported',
      createdBy: operator.email, acknowledgedBy: null, resolvedBy: status === 'resolved' ? operator.email : null,
      createdAtUtc: '2026-11-20T09:00:00Z', updatedAtUtc: '2026-11-20T09:00:00Z',
    }] : [],
  })))
  await page.route('**/api/v1/incidents', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf')
    expect(route.request().postDataJSON()).toMatchObject({
      siteId: 'alpha', title: 'Core down', severity: 'high',
    })
    present = true
    await route.fulfill({ status: 201, contentType: 'application/json',
      body: JSON.stringify({ id: incidentId }) })
  })
  await page.route('**/api/v1/incidents/*/status', async route => {
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf')
    status = route.request().postDataJSON().status as typeof status
    await route.fulfill({ status: 204 })
  })
  await page.goto('/incidents')
  await expect(page.getByRole('heading', { name: 'رویدادها و گزارش‌های دستی' })).toBeVisible()
  await page.getByRole('textbox', { name: 'عنوان گزارش اختلال' }).fill('Core down')
  await page.getByRole('combobox', { name: 'شدت گزارش' }).selectOption('high')
  await page.getByRole('button', { name: 'ثبت گزارش دستی' }).click()
  await expect(page.getByText('Core down')).toBeVisible()
  await page.getByRole('button', { name: 'ثبت بررسی' }).click()
  await expect(page.getByText('بررسی‌شده · دستی')).toBeVisible()
  await page.getByRole('button', { name: 'بستن گزارش' }).click()
  await expect(page.getByText('بسته‌شده · دستی')).toBeVisible()
})

test('viewer sees site-restricted incident history without mutation controls', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill(reply({
    ...operator, role: 'viewer',
  })))
  await page.route('**/api/v1/incidents?**', route => route.fulfill(reply({
    siteId: 'alpha', page: 1, pageSize: 25, total: 0,
    items: [], provenance: 'operator-reported-unverified', automatedDetection: false,
  })))
  await page.goto('/incidents')
  await expect(page.getByRole('heading', { name: 'رویدادها و گزارش‌های دستی' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ثبت گزارش دستی' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'شناسه سایت رویدادها' })).toHaveCount(0)
})

test('agent screen only claims unverified registrations, never online health', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill(reply(operator)))
  await page.route('**/api/v1/agents/capabilities', route => route.fulfill(reply({
    enrollmentEnabled: false, heartbeatVerified: false,
    signedUpdatesEnabled: false, status: 'gateway-not-ready',
  })))
  await page.route('**/api/v1/agents?**', route => route.fulfill(reply({
    siteId: 'alpha', page: 1, pageSize: 25, total: 1,
    provenance: 'registration-only-not-verified', monitoring: 'disabled',
    items: [{ agentId, siteId: 'alpha', agentVersion: '0.1.0', lastReceivedAtUtc: null }],
  })))
  await page.goto('/agents')
  await expect(page.getByRole('heading', { name: 'Agentها' })).toBeVisible()
  await expect(page.getByText(agentId)).toBeVisible()
  await expect(page.getByText('هیچ داده‌ای ثبت نشده')).toBeVisible()
  await expect(page.getByText('نامشخص · heartbeat تأیید نشده')).toBeVisible()
})
