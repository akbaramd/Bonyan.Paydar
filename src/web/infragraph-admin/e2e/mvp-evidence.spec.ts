import { expect, test } from '@playwright/test'

const identity = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'operator@example.invalid', role: 'operator', siteId: 'alpha',
}
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const now = new Date(Date.now() - 4000).toISOString()
const reply = (body: unknown) => ({
  status: 200, contentType: 'application/json', body: JSON.stringify(body),
})

test('authorized operator imports offline neighbors, reviews and retracts evidence', async ({ page }) => {
  let reported = false
  let retracted = false
  await page.route('**/api/v1/auth/me', route => route.fulfill(reply(identity)))
  await page.route('**/api/v1/auth/csrf', route => route.fulfill(reply({ token: 'test-csrf' })))
  await page.route('**/api/v1/topology/graph?**', route => route.fulfill(reply({
    siteId: 'alpha', nodes: reported && !retracted ? [
      { id: 'Core', depth: 0 }, { id: 'Access', depth: 1 },
    ] : [],
    links: reported && !retracted ? [{
      id: 'link', source: 'Core', target: 'Access', sourcePort: 'Gi1', targetPort: 'Gi2',
      protocol: 'LLDP', evidenceIds: [id], possibleCycle: false,
    }] : [],
    staleObservations: 0, truncated: false, generatedAtUtc: now,
    provenance: 'operator-reported-unverified',
  })))
  await page.route('**/api/v1/discovery/observations?**', route => route.fulfill(reply({
    siteId: 'alpha', page: 1, pageSize: 25, total: reported ? 1 : 0,
    items: reported ? [{
      id, siteId: 'alpha', sourceKey: 'Core', targetKey: 'Access',
      sourcePort: 'Gi1', targetPort: 'Gi2', protocol: 'LLDP',
      observedAtUtc: now, receivedAtUtc: now, ttlSeconds: 3600,
      retractedAtUtc: retracted ? now : null, source: 'operator-reported',
      status: retracted ? 'retracted' : 'fresh',
    }] : [],
  })))
  await page.route('**/api/v1/discovery/observations', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf')
    expect(route.request().postDataJSON()).toMatchObject([{
      siteId: 'alpha', sourceKey: 'Core', targetKey: 'Access', protocol: 'LLDP',
    }])
    reported = true
    await route.fulfill({ status: 202, contentType: 'application/json',
      body: JSON.stringify({ accepted: 1, provenance: 'operator-reported-unverified' }) })
  })
  await page.route('**/api/v1/discovery/observations/*/retract', async route => {
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf')
    retracted = true
    await route.fulfill({ status: 204 })
  })
  await page.goto('/topology')
  await page.getByRole('button', { name: 'مرور شواهد' }).click()
  await expect(page.getByRole('heading', { name: /شواهد شبکه/ })).toBeVisible()
  await page.locator('input[aria-label="فایل JSON شواهد"]').setInputFiles({
    name: 'reported-links.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{
      sourceKey: 'Core', targetKey: 'Access', sourcePort: 'Gi1', targetPort: 'Gi2',
      protocol: 'LLDP', observedAtUtc: now, ttlSeconds: 3600,
    }])),
  })
  await expect(page.getByText('1 لینک آماده ثبت')).toBeVisible()
  await page.getByRole('button', { name: 'تأیید و ثبت 1 لینک' }).click()
  await expect(page.getByText('تازه · تأییدنشده')).toBeVisible()
  await page.getByRole('button', { name: 'ابطال گزارش Core به Access' }).click()
  await expect(page.getByText('ابطال‌شده')).toBeVisible()
})

test('viewer may review evidence without import or retraction controls', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill(reply({ ...identity, role: 'viewer' })))
  await page.route('**/api/v1/discovery/observations?**', route => route.fulfill(reply({
    siteId: 'alpha', page: 1, pageSize: 25, total: 0, items: [],
  })))
  await page.route('**/api/v1/topology/graph?**', route => route.fulfill(reply({
    siteId: 'alpha', nodes: [], links: [], staleObservations: 0, truncated: false,
    generatedAtUtc: now, provenance: 'operator-reported-unverified',
  })))
  await page.goto('/topology')
  await page.getByRole('button', { name: 'مرور شواهد' }).click()
  await expect(page.getByRole('heading', { name: /شواهد شبکه/ })).toBeVisible()
  await expect(page.locator('input[aria-label="فایل JSON شواهد"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ثبت شواهد' })).toHaveCount(0)
})
test('explicit offline discovery scope produces an evidence-only graph preview', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill(reply(identity)))
  await page.route('**/api/v1/auth/csrf', route => route.fulfill(reply({ token: 'test-csrf' })))
  await page.route('**/api/v1/topology/graph?**', route => route.fulfill(reply({
    siteId: 'alpha', nodes: [], links: [], staleObservations: 0,
    truncated: false, generatedAtUtc: now,
    provenance: 'operator-reported-unverified',
  })))
  await page.route('**/api/v1/discovery/observations?**', route => route.fulfill(reply({
    siteId: 'alpha', page: 1, pageSize: 25, total: 0, items: [],
  })))
  await page.route('**/api/v1/discovery/walk-preview', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf')
    expect(route.request().postDataJSON()).toMatchObject({
      siteId: 'alpha', approvedAssets: ['Core', 'Access'], seeds: ['Core'],
      maxNodes: 256, maxDepth: 8,
    })
    await route.fulfill(reply({
      mode: 'stored-evidence-only', probedAssets: 2,
      skippedOutOfScope: 1, failedAssets: [], timedOut: false,
      graph: {
        siteId: 'alpha', nodes: [{ id: 'Core', depth: 0 }, { id: 'Access', depth: 1 }],
        links: [{
          id: 'evidence-link', source: 'Core', target: 'Access',
          sourcePort: '1', targetPort: '2', protocol: 'LLDP',
          evidenceIds: [id], possibleCycle: false,
        }],
        staleObservations: 0, truncated: false, generatedAtUtc: now,
        provenance: 'operator-reported-unverified',
      },
    }))
  })
  await page.goto('/topology')
  await page.getByRole('button', { name: 'مرور شواهد' }).click()
  await page.getByRole('textbox', { name: 'تجهیزات مجاز برای پیمایش' }).fill('Core, Access')
  await page.getByRole('textbox', { name: 'مبدأ پیمایش' }).fill('Core')
  await page.getByRole('button', { name: 'اجرای پیش‌نمایش شواهد' }).click()
  await expect(page.getByText('پیمایش آفلاین محدوده‌دار')).toBeVisible()
  await expect(page.getByRole('button', { name: 'بازگشت به نقشه کامل' })).toBeVisible()
  await page.getByRole('button', { name: 'بازگشت به نقشه کامل' }).click()
  await expect(page.getByRole('button', { name: 'بازگشت به نقشه کامل' })).toHaveCount(0)
})
