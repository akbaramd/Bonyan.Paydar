import { expect, test } from '@playwright/test'

test('anonymous operator logs in using same-origin CSRF and sees the admin shell', async ({ page }) => {
  const person = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'operator@example.invalid', role: 'operator', siteId: 'alpha',
  }
  const body = (value: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(value),
  })
  let loggedIn = false
  await page.route('**/api/v1/auth/me', async route => {
    if (!loggedIn) return route.fulfill({ status: 401 })
    return route.fulfill(body(person))
  })
  await page.route('**/api/v1/auth/csrf', route => route.fulfill(body({ token: 'mock-csrf' })))
  await page.route('**/api/v1/auth/login', async route => {
    expect(route.request().headers()['x-csrf-token']).toBe('mock-csrf')
    expect(route.request().postDataJSON()).toEqual({
      email: person.email, password: 'p'.repeat(20),
    })
    loggedIn = true
    await route.fulfill(body(person))
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'ورود به مرکز مدیریت شبکه' })).toBeVisible()
  await page.getByLabel('ایمیل').fill(person.email)
  await page.getByLabel('رمز عبور').fill('p'.repeat(20))
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'مرکز عملیات زیرساخت' })).toBeVisible()
})
