import { expect, test } from '@playwright/test'

// Browser contract test with fixture responses; real role enforcement is exercised by .NET HTTP tests.
test('admin can edit operator site scope and react to a server-confirmed update', async ({ page }) => {
  const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const operatorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const operators = [
    { id: adminId, email: 'admin@example.invalid', role: 'admin', siteId: null,
      isActive: true, createdAtUtc: '2026-11-20T10:00:00Z' },
    { id: operatorId, email: 'operator@example.invalid', role: 'operator', siteId: 'alpha',
      isActive: true, createdAtUtc: '2026-11-20T10:00:00Z' },
  ]
  await page.route('**/api/v1/auth/me', async route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: adminId, email: 'admin@example.invalid',
        role: 'admin', siteId: null }) }))
  await page.route('**/api/v1/sites', async route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({sites:['alpha','beta']}) }))
  await page.route('**/api/v1/admin/users', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(operators) }))
  await page.route('**/api/v1/auth/csrf', async route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ token: 'test-only-csrf' }) }))
  await page.route(`**/api/v1/admin/users/${operatorId}/access`, async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['x-csrf-token']).toBe('test-only-csrf')
    expect(route.request().postDataJSON()).toMatchObject({
      role: 'viewer', siteId: 'beta',
    })
    operators[1] = { ...operators[1], role: 'viewer', siteId: 'beta' }
    await route.fulfill({ status: 204 })
  })
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'کاربران و سطح دسترسی' })).toBeVisible()
  await page.getByRole('button', { name: 'ویرایش دسترسی' }).click()
  await page.getByRole('combobox', { name: 'نقش جدید' }).selectOption('viewer')
  await page.getByRole('combobox', { name: 'انتخاب سایت جدید کاربر' }).selectOption('beta')
  await page.getByRole('button', { name: 'ذخیره دسترسی' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'operator@example.invalid' })).toContainText('viewer')
  await expect(page.getByRole('row').filter({ hasText: 'operator@example.invalid' })).toContainText('beta')
})