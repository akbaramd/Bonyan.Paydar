import { expect, test } from '@playwright/test'

test('audit history is admin-only and paginated from the API', async ({ page }) => {
  const admin = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'admin@example.invalid', role: 'admin', siteId: null }
  const audit = {
    page: 1, pageSize: 25, total: 1,
    items: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', actor: 'admin@example.invalid',
      action: 'access.create', target: 'operator@example.invalid', success: true,
      atUtc: '2026-11-20T10:00:00Z',
    }],
  }
  const reply = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/api/v1/auth/me', route => route.fulfill(reply(admin)))
  await page.route('**/api/v1/admin/audit?**', route => route.fulfill(reply(audit)))
  await page.goto('/admin/audit')
  await expect(page.getByRole('heading', { name: 'رویدادهای امنیتی' })).toBeVisible()
  await expect(page.getByText('access.create')).toBeVisible()
  await expect(page.getByText('operator@example.invalid')).toBeVisible()
  await expect(page.getByRole('button', { name: 'بعدی' })).toBeDisabled()
})

test('non-admin cannot open audit history', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'viewer@example.invalid', role: 'viewer', siteId: 'alpha' }),
  }))
  await page.goto('/admin/audit')
  await expect(page.getByRole('alert')).toContainText('دسترسی مدیر')
})
