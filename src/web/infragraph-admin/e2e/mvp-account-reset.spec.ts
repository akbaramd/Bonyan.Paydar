import { expect, test } from '@playwright/test'

test('admin password reset uses CSRF and clears the form', async ({ page }) => {
  const admin = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'admin@example.invalid', role: 'admin', siteId: null }
  const target = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'viewer@example.invalid', role: 'viewer', siteId: 'alpha' }
  const response = (value: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(value),
  })
  await page.route('**/api/v1/auth/me', route => route.fulfill(response(admin)))
  await page.route('**/api/v1/auth/csrf', route => route.fulfill(response({ token: 'mock-csrf' })))
  await page.route('**/api/v1/admin/users', route => route.fulfill(response(
    [admin, target].map(user => ({
      ...user, isActive: true, createdAtUtc: '2026-11-20T10:00:00Z',
    })),
  )))
  let called = false
  await page.route('**/api/v1/admin/users/*/reset-password', async route => {
    expect(route.request().headers()['x-csrf-token']).toBe('mock-csrf')
    expect(route.request().postDataJSON()).toEqual({ newPassword: 'n'.repeat(20) })
    called = true
    await route.fulfill({ status: 204 })
  })
  await page.goto('/admin/users')
  await expect(page.getByText(target.email)).toBeVisible()
  await page.getByRole('button', { name: 'بازنشانی رمز' }).click()
  await page.getByLabel('رمز جدید کاربر').fill('n'.repeat(20))
  await page.getByRole('button', { name: 'ثبت رمز جدید' }).click()
  await expect.poll(() => called).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: 'رمز کاربر تغییر کرد' })).toContainText('باطل شدند')
  await expect(page.getByLabel('رمز جدید کاربر')).toHaveCount(0)
})
