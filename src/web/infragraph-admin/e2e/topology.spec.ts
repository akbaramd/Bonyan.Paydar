import { test, expect } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

test.beforeEach(async ({ page }) => mockAdminSession(page))

test.describe('Topology — SVG network and inspection', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test('uses the right inspector dock and preserves synthetic provenance', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await expect(page.getByText('حالت نمایشی · داده ساختگی')).toBeVisible()
    const inspectorDock = page.getByTestId('topology-right-dock')
    await expect(page.getByTestId('node-inspector')).toHaveCount(0)
    await page.getByTestId('node-access-a').click()
    await expect(inspectorDock.getByText('ACC-SW-01')).toBeVisible()
    await expect(inspectorDock.getByText('10.10.1.21')).toBeVisible()
    await expect(inspectorDock.getByText('قطع ارتباط · نمونه آزمایشی')).toBeVisible()
    await inspectorDock.getByRole('button', { name: 'بستن جزئیات' }).click()
    await expect(inspectorDock.getByText('یک نود را انتخاب کنید')).toBeVisible()
  })
  test('supports SVG overlay and minimap as opt-in tools', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await expect(page.getByRole('heading', { name: 'توپولوژی شبکه' })).toBeVisible()
    await expect(page.getByLabel('نمای کوچک نقشه شبکه')).toHaveCount(0)
    await page.getByRole('button', { name: 'تنظیمات لایه‌ها' }).click()
    await page.getByRole('switch', { name: 'نقشه کوچک' }).click()
    await expect(page.getByLabel('نمای کوچک نقشه شبکه')).toBeVisible()
    await page.keyboard.press('Escape')
    const input = page.getByLabel('انتخاب فایل SVG')
    await input.setInputFiles({
      name: 'floorplan.svg', mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="260"><rect x="10" y="10" width="470" height="230" fill="#cbd5e1"/></svg>'),
    })
    await page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' }).click()
    await page.getByRole('menuitem', { name: 'پلان ساختمان SVG' }).click()
    await expect(page.locator('.blueprint-node img')).toHaveAttribute('src', /^blob:/)
    await expect(page.getByText(/پلان محلی:/)).toBeVisible()
    await page.screenshot({ path: '../../../resources/ux-review/topology-svg-desktop.png', fullPage: true })
  })
  test('rejects untrusted SVG active content and external resources', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await page.getByLabel('انتخاب فایل SVG').setInputFiles({
      name: 'malicious.svg', mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://evil.example/img.svg" /></svg>'),
    })
    await expect(page.getByRole('alert').filter({ hasText: 'منابع خارجی' })).toBeVisible()
    await expect(page.locator('.blueprint-node img')).toHaveCount(0)
  })
})

test.describe('Topology — touch tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true })
  test('closes device details without disabling graph navigation', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await page.getByTestId('node-core').click()
    const dialog = page.getByRole('dialog', { name: 'جزئیات نود انتخاب‌شده' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'بستن جزئیات' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'بزرگ‌نمایی' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: '../../../resources/ux-review/topology-tablet.png', fullPage: true })
  })
})