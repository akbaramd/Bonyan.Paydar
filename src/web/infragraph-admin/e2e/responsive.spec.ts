import { test, expect } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

test.beforeEach(async ({ page }) => mockAdminSession(page))

test.describe('IT operator — desktop 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('navigates a real SPA Proxy shell with clear no-data states', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'مرکز عملیات زیرساخت' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'ناوبری اصلی' })).toBeVisible()
    await expect(page.getByText('سامانه در مرحله راه‌اندازی')).toBeVisible()
    await expect(page.getByText('هنوز شواهدی از شبکه دریافت نشده است')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await page.screenshot({ path: '../../../resources/ux-review/dashboard-desktop.png', fullPage: true })
  })

  test('switches light theme and retains it on reload', async ({ page }) => {
    await page.goto('/design-system')
    await page.getByRole('button', { name: 'فعال‌سازی تم روشن' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('loads local Vazirmatn variable font, with no external font host', async ({ page }) => {
    await page.goto('/')
    const family = await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily)
    expect(family).toContain('Vazirmatn Variable')
    await expect.poll(async () => page.evaluate(async () => {
      await document.fonts.load('13px "Vazirmatn Variable"', 'تجهیزات شبکه')
      return document.fonts.check('13px "Vazirmatn Variable"', 'تجهیزات شبکه')
    })).toBe(true)
  })

  test('has keyboard skip link to main content', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'مرکز عملیات زیرساخت' })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'رفتن به محتوای اصلی' })).toBeFocused()
  })
})

test.describe('IT operator — touch tablet 820px', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false })

  test('shows accessible drawer, virtualizes table and filters without page overflow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'باز کردن منوی برنامه' })).toBeVisible()
    await page.getByRole('button', { name: 'باز کردن منوی برنامه' }).click()
    await expect(page.getByRole('dialog', { name: 'منوی برنامه' })).toBeVisible()
    await page.getByRole('dialog').getByRole('link', { name: 'آزمایشگاه جدول' }).click()
    await expect(page.getByRole('heading', { name: 'آزمایشگاه جدول‌های حجیم' })).toBeVisible()
    const table = page.getByRole('table', { name: 'داده‌های آزمایشی تجهیزات شبکه' })
    await expect(table).toHaveAttribute('aria-rowcount', '12000')
    const visibleDomRows = await table.locator('tbody tr').count()
    expect(visibleDomRows).toBeLessThan(65)
    await page.getByRole('searchbox', { name: 'جست‌وجوی تجهیز یا IP' }).fill('Server-00002')
    await expect(table).toHaveAttribute('aria-rowcount', '1')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: '../../../resources/ux-review/table-tablet.png', fullPage: true })
  })
})
test.describe('Narrow and zoomed viewport guardrails', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test('keeps the navigation and map controls reachable without document overflow', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await expect(page.getByRole('heading', { name: 'توپولوژی شبکه' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'بازگشت به مرکز عملیات' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'ناوبری اصلی' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
})