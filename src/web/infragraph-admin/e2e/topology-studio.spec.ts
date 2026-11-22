import { expect, test } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

test.beforeEach(async ({ page }) => mockAdminSession(page))

test.describe('Network operations studio — operator first', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('identifies equipment kinds and four affected PCs at a glance without an inspector', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await expect(page.getByRole('heading', { name: 'توپولوژی شبکه' })).toBeVisible()
    await expect(page.getByText('DEMO DATA · NOT LIVE')).toBeVisible()
    await expect(page.getByTestId('node-inspector')).toHaveCount(0)
    const kinds = [
      ['firewall', 'فایروال'], ['core', 'سوئیچ'], ['collector', 'سرور مرکزی'],
      ['client', 'رایانه کاربر'], ['wifi', 'اکسس‌پوینت'],
    ] as const
    for (const [id, label] of kinds) {
      const node = page.getByTestId(`node-${id}`)
      await expect(node).toBeAttached()
      await expect(node.locator('svg.ig-device-glyph')).toHaveCount(1)
      await expect(node.locator('.ig-node-kind')).toContainText(label)
    }
    const critical = page.getByTestId('node-access-a')
    await expect(critical.locator('.ig-node-impact')).toContainText('4')
    for (const id of ['client', 'client-2', 'client-3', 'client-4']) {
      await expect(page.getByTestId(`node-${id}`)).toHaveClass(/network-node--unknown/)
    }
    await expect(page.getByTestId('shared-fault-hypothesis')).toContainText('4')
    const stage = await page.getByTestId('topology-stage').boundingBox()
    const zoom = await page.locator('.ig-canvas-quicktools').boundingBox()
    expect(stage && zoom && zoom.y > stage.y + stage.height / 2 && zoom.x < stage.x + stage.width / 2 && zoom.width < 200).toBe(true)
    await expect.poll(async () => Number((await page.getByLabel('درصد بزرگ‌نمایی').innerText()).replace('%','')), { timeout: 7000 }).toBeLessThan(98)
    await page.screenshot({ path: '../../../resources/ux-review/topology-studio-desktop.png', fullPage: true })
  })

  test('opens device details in the persistent right dock without obscuring the SVG', async ({ page }) => {
    await page.goto('/topology?sample=1')
    const right = page.getByTestId('topology-right-dock')
    await expect(right).toBeVisible()
    await expect(page.getByTestId('node-inspector')).toHaveCount(0)
    await page.getByTestId('node-access-a').click()
    await expect(right.getByTestId('node-inspector')).toContainText('ACC-SW-01')
    await expect(right.getByTestId('inspector-impact-hypothesis')).toContainText('4')
    await expect(page.getByRole('dialog', { name: 'جزئیات نود انتخاب‌شده' })).toHaveCount(0)
    await right.getByRole('button', { name: 'بستن جزئیات' }).click()
    await expect(right.getByText('یک نود را انتخاب کنید')).toBeVisible()
  })

  test('keeps the SVG stage dominant; actions expand through a grouped overflow menu', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await expect(page.getByTestId('node-access-a')).toBeVisible()
    await expect(page.locator('.react-flow__edges svg, .react-flow__edges path').first()).toBeAttached()
    await expect(page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' })).toBeVisible()
    const viewport = page.locator('.react-flow__viewport')
    const original = await viewport.getAttribute('style')
    await page.getByRole('button', { name: 'بزرگ‌نمایی' }).click()
    await expect.poll(() => viewport.getAttribute('style')).not.toBe(original)

    await page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' }).click()
    await expect(page.getByRole('menuitem', { name: 'چیدمان عمودی' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'وضعیت: بحرانی' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'وضعیت: بحرانی' }).click()
    await expect(page.getByTestId('node-core')).toHaveClass(/network-node--dimmed/)
    await page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' }).click()
    await page.getByRole('menuitem', { name: 'وضعیت: همه' }).click()
    await expect(page.getByTestId('node-core')).not.toHaveClass(/network-node--dimmed/)
  })

  test('exposes diagnostic path and sample replay only when requested', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await expect(page.getByTestId('topology-dock')).toHaveCount(0)
    await page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' }).click()
    await page.getByRole('menuitem', { name: 'تحلیل مسیر منطقی' }).click()
    await expect(page.getByTestId('topology-dock')).toBeVisible()
    await page.locator('.studio-path-controls').getByRole('button', { name: 'تحلیل مسیر' }).click()
    await expect(page.locator('.ig-signal-edge--route')).not.toHaveCount(0)
    await page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' }).click()
    await page.getByRole('menuitem', { name: 'بازپخش کشف آزمایشی' }).click()
    await expect(page.getByTestId('topology-dock')).toBeVisible()
    await page.getByRole('button', { name: 'اجرای Replay' }).click()
    await expect(page.getByTestId('topology-dock').getByRole('progressbar', { name: 'پیشرفت Replay' })).toBeVisible()
  })

  test('provides resizable left/right/bottom docks with independent tabs and SVG-only center', async ({ page }) => {
    await page.goto('/topology?sample=1')
    const left = page.getByTestId('topology-left-dock')
    const right = page.getByTestId('topology-right-dock')
    const bottom = page.getByTestId('topology-bottom-dock')
    const stage = page.getByTestId('topology-stage')
    await expect(left).toBeVisible()
    await expect(right).toBeVisible()
    await expect(bottom).toBeVisible()
    const [l, c, r, b] = await Promise.all([left.boundingBox(), stage.boundingBox(), right.boundingBox(), bottom.boundingBox()])
    expect(l && c && r && b && l.x + l.width <= c.x + 8 && c.x + c.width <= r.x + 8 && b.y >= c.y + c.height - 8).toBe(true)
    await expect(stage.locator('input, select, .scan-panel, .access-form')).toHaveCount(0)

    await page.getByTestId('topology-left-rail').getByRole('button', { name: 'بازکردن تب اسکن' }).click()
    await expect(left.getByLabel('کشف فعال شبکه')).toBeVisible()
    await page.getByTestId('topology-right-rail').getByRole('button', { name: 'بازکردن تب لایه‌ها' }).click()
    await expect(right.getByText('شبکه زمینه')).toBeVisible()
    await page.getByTestId('topology-bottom-rail').getByRole('button', { name: 'بازکردن تب تحلیل مسیر' }).click()
    await expect(bottom.getByText('مبدأ مسیر')).toBeVisible()

    await page.getByTestId('topology-left-rail').getByRole('button',{name:'بازکردن تب اسکن'}).click()
    await expect(left).toHaveCount(0)
    await page.getByTestId('topology-left-rail').getByRole('button',{name:'بازکردن تب اسکن'}).click()
    await expect(page.getByTestId('topology-left-dock')).toBeVisible()
    await page.screenshot({ path: '../../../resources/ux-review/topology-studio-docks.png', fullPage: true })
  })

  test('supports fullscreen and accessible help', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await page.getByRole('button', { name: 'تمام‌صفحه' }).click()
    await expect(page.getByRole('button', { name: 'خروج از تمام‌صفحه' })).toBeVisible()
    await page.getByRole('button', { name: 'خروج از تمام‌صفحه' }).click()
    await page.getByRole('button', { name: 'راهنمای استودیو' }).click()
    await expect(page.getByRole('dialog', { name: 'راهنمای مرکز فرماندهی شبکه' })).toBeVisible()
    await page.getByRole('button', { name: 'بستن راهنما' }).click()
  })
})

test.describe('Network operations studio — tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true })
  test('offers compact overflow tools, distinct SVG symbols, and on-demand detail drawer', async ({ page }) => {
    await page.goto('/topology?sample=1')
    await expect(page.getByRole('navigation', { name: 'ناوبری اصلی' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ابزارهای بیشتر توپولوژی' })).toBeVisible()
    await expect(page.getByTestId('topology-dock')).toHaveCount(0)
    await expect(page.getByTestId('node-core').locator('svg.ig-device-glyph')).toHaveCount(1)
    await page.getByTestId('node-core').click()
    const drawer = page.getByRole('dialog', { name: 'جزئیات نود انتخاب‌شده' })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'بستن جزئیات' }).click()
    await expect(drawer).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: '../../../resources/ux-review/topology-studio-tablet.png', fullPage: true })
  })
})