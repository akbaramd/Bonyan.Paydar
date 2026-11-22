import { expect, test } from '@playwright/test'

// Synthetic API responses used only for contract-level browser checks.
// Backend roles/CSRF/session behavior is tested separately by MvpApiTests (.NET).
test.describe('Authenticated inventory UI integration', () => {
  const person = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'operator@example.invalid', role: 'operator', siteId: 'alpha',
  }
  test('renders scoped API inventory and submits manual registration with CSRF', async ({ page }) => {
    const rows = [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      displayName: 'SW-01', siteId: 'alpha', createdAtUtc: '2026-11-20T10:00:00+00:00',
    }]
    await page.route('**/api/v1/auth/me', async route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(person) }))
    await page.route('**/api/v1/sites', async route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sites: ['alpha'] }) }))
    await page.route('**/api/v1/assets?**', async route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        siteId: 'alpha', page: 1, pageSize: 25, total: rows.length,
        items: rows, provenance: 'operator-registered-unverified',
      }) }))
    await page.route('**/api/v1/auth/csrf', async route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ token: 'synthetic-csrf-token' }) }))
    await page.route('**/api/v1/assets', async route => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf-token')
      expect(request.postDataJSON()).toMatchObject({
        siteId: 'alpha', displayName: 'SW-02',
      })
      rows.push({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        displayName: 'SW-02', siteId: 'alpha', createdAtUtc: '2026-11-20T11:00:00+00:00',
      })
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        ...rows[1], provenance: 'operator-registered-unverified',
      }) })
    })
    await page.goto('/assets')
    await expect(page.getByRole('heading', { name: 'موجودی تجهیزات' })).toBeVisible()
    await expect(page.getByText('SW-01')).toBeVisible()
    await page.getByRole('textbox', { name: 'نام دستگاه جدید' }).fill('SW-02')
    await page.getByRole('button', { name: 'ثبت تجهیز' }).click()
    await expect(page.getByText('SW-02')).toBeVisible()
    await expect(page.getByText('مجموع ۲ دستگاه')).toBeVisible()
  })

  test('viewer cannot access mutation controls or edit site scope', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...person, role: 'viewer' }) }))
    await page.route('**/api/v1/sites', async route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sites: ['alpha'] }) }))
    await page.route('**/api/v1/assets?**', async route =>
      route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ siteId: 'alpha', page: 1, pageSize: 25, total: 0,
          items: [], provenance: 'operator-registered-unverified' }) }))
    await page.goto('/assets')
    await expect(page.getByRole('heading', { name: 'موجودی تجهیزات' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ثبت تجهیز' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'شناسه سایت موجودی' })).toHaveCount(0)
    await expect(page.getByText('صفحه 1')).toBeVisible()
  })
})
