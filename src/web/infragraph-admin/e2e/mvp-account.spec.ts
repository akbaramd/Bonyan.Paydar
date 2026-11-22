import { expect, test } from '@playwright/test'

const admin = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin@example.invalid',
  role: 'admin', siteId: null }
const viewer = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'viewer@example.invalid', role: 'viewer', siteId: 'alpha' }
const reply = (body: unknown, status = 200) => ({
  status, contentType: 'application/json', body: JSON.stringify(body),
})

test('admin creates a site-scoped account with CSRF', async ({ page }) => {
  const users = [admin]
  await page.route('**/api/v1/auth/me', r => r.fulfill(reply(admin)))
  await page.route('**/api/v1/auth/csrf', r => r.fulfill(reply({ token: 'test-csrf' })))
  await page.route('**/api/v1/sites', r => r.fulfill(reply({sites:['alpha']})))
  await page.route('**/api/v1/admin/users', async r => {
    if (r.request().method() === 'GET') return r.fulfill(reply(users.map(u => ({
      ...u, isActive: true, createdAtUtc: '2026-11-20T10:00:00Z',
    }))))
    expect(r.request().headers()['x-csrf-token']).toBe('test-csrf')
    const body = r.request().postDataJSON()
    expect(body).toMatchObject({ role: 'viewer', siteId: 'alpha' })
    users.push(viewer)
    return r.fulfill(reply(viewer, 201))
  })
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'کاربران و سطح دسترسی' })).toBeVisible()
  await page.getByRole('textbox', { name: 'ایمیل' }).fill(viewer.email)
  await page.getByLabel('رمز اولیه').fill('Strong-example-Password-2026!')
  await page.getByLabel('نقش').selectOption('viewer')
  await page.getByRole('combobox',{name:'انتخاب سایت کاربر'}).selectOption('alpha')
  await page.getByRole('button', { name: 'ایجاد کاربر' }).click()
  await expect(page.getByText(viewer.email)).toBeVisible()
})

test('password rotation sends CSRF, uses old password and confirmation', async ({ page }) => {
  let submitted = false
  await page.route('**/api/v1/auth/me', r => r.fulfill(reply(viewer)))
  await page.route('**/api/v1/auth/csrf', r => r.fulfill(reply({ token: 'test-csrf' })))
  await page.route('**/api/v1/auth/password', async r => {
    expect(r.request().headers()['x-csrf-token']).toBe('test-csrf')
    expect(r.request().postDataJSON()).toMatchObject({
      currentPassword: 'Old-example-Password-2026!',
      newPassword: 'New-example-Password-2026!',
    })
    submitted = true
    return r.fulfill({ status: 204 })
  })
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'حساب کاربری' })).toBeVisible()
  await page.getByLabel('رمز فعلی').fill('Old-example-Password-2026!')
  await page.getByLabel('رمز جدید').fill('New-example-Password-2026!')
  await page.getByLabel('تکرار رمز').fill('Mismatched-example-2026!')
  await page.getByRole('button', { name: 'تغییر رمز' }).click()
  await expect(page.getByRole('alert')).toContainText('یکسان نیست')
  expect(submitted).toBe(false)
  await page.getByLabel('تکرار رمز').fill('New-example-Password-2026!')
  await page.getByRole('button', { name: 'تغییر رمز' }).click()
  await expect.poll(() => submitted).toBe(true)
})

test('viewer is denied admin screens even if navigating directly', async ({ page }) => {
  await page.route('**/api/v1/auth/me', r => r.fulfill(reply(viewer)))
  await page.goto('/admin/users')
  await expect(page.getByRole('alert')).toContainText('دسترسی مدیر لازم است')
})