import { expect, test } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => mockAdminSession(page))

test('keyboard command palette navigates without pointer and notification drawer is truthful', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'مرکز عملیات زیرساخت' })).toBeVisible()
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'جست‌وجو و جابه‌جایی سریع' })
  await expect(dialog).toBeVisible()
  await page.getByRole('textbox', { name: 'جست‌وجوی سریع' }).fill('توپولوژی')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/topology$/)
  await expect(page.getByRole('button', { name: 'مرکز اعلان‌ها و رویدادها' })).toHaveCount(0)
  await page.getByRole('link', { name: 'بازگشت به مرکز عملیات' }).click()
  await page.getByRole('button', { name: 'مرکز اعلان‌ها و رویدادها' }).click()
  const activity = page.getByRole('dialog', { name: 'مرکز اعلان‌ها' })
  await expect(activity).toBeVisible()
  await expect(activity.getByText('اطلاعات اعلان‌ها هنوز موجود نیست')).toBeVisible()
  await activity.getByRole('tab', { name: 'بحرانی' }).click()
  await expect(activity.getByText('اطلاعات اعلان‌ها هنوز موجود نیست')).toBeVisible()
  await activity.getByRole('button', { name: 'بستن اعلان‌ها' }).click()
  await expect(activity).toHaveCount(0)
})

test('self-hosted Persian Vazirmatn loads and visual density can change', async ({ page }) => {
  await page.goto('/')
  const font = await page.evaluate(async () => {
    const faceList = await document.fonts.load('400 16px "Vazirmatn Variable"', 'مانیتورینگ شبکه')
    return { faceCount: faceList.length, family: getComputedStyle(document.body).fontFamily }
  })
  expect(font.faceCount).toBeGreaterThan(0)
  expect(font.family).toContain('Vazirmatn Variable')
  await page.getByRole('button', { name: 'نمای راحت‌تر' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable')
})

test('design system complex controls support keyboard and confirmations', async ({ page }) => {
  await page.goto('/design-system')
  await page.getByRole('textbox', { name: 'شناسه تجهیز (آزمایشی)' }).fill('A')
  await expect(page.getByRole('alert')).toContainText('حداقل سه کاراکتر')
  await page.getByRole('textbox', { name: 'شناسه تجهیز (آزمایشی)' }).fill('CORE-SW')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('switch', { name: 'نمایش نمونه اعلان‌ها' }).click()
  await expect(page.getByText('اعلان نمونه خاموش است')).toBeVisible()
  await page.getByRole('button', { name: 'بازنشانی تنظیمات ظاهری' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'بازنشانی تنظیمات ظاهر' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'بازنشانی' }).click()
  await expect(page.getByText('تنظیمات ظاهری به حالت پیش‌فرض برگشتند.')).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})