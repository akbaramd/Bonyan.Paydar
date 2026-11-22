import { test, expect } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => mockAdminSession(page))

test('desktop overview has no automated WCAG 2.2 A/AA violations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'مرکز عملیات زیرساخت' })).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})

test('tablet lab table remains accessible to automated checks', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/lab/data-grid')
  await expect(page.getByRole('table', { name: 'داده‌های آزمایشی تجهیزات شبکه' })).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})
test('network studio supports automated WCAG checks in active inspector state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/topology?sample=1')
  await expect(page.getByTestId('node-access-a')).toBeVisible()
  await page.getByTestId('node-access-a').click()
  await expect(page.getByTestId('node-inspector')).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})