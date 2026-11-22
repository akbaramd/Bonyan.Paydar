import type { Page } from '@playwright/test'

// UI-only fixtures must explicitly mock an authenticated session.
// The application itself never bypasses its login gate in development.
export async function mockAdminSession(page: Page) {
  await page.route('**/api/v1/auth/me', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'admin@example.invalid', role: 'admin', siteId: null,
    }),
  }))
}
