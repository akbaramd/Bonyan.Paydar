import { expect, test } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

const observed = {
  siteId: 'lan', generatedAtUtc: '2026-11-21T09:00:00Z',
  provenance: 'active-ipv4-and-reported-evidence',
  staleObservations: 0, truncated: false,
  nodes: [
    {id: 'net-only', depth: 0, address: null, systemName: 'Logical CIDR'},
    {id: 'manual-only', depth: 0, address: '192.168.88.98'},
    {id: 'node-a', depth: 0, address: '192.168.88.3', systemName: 'SERVER-03', probeStatus: 'responsive', icmpResponded: true, tcpPorts: [443], lastSeenAtUtc: '2026-11-21T09:00:00Z'},
    {id: 'node-b', depth: 0, address: '192.168.88.24', systemName: 'DEVICE-24', probeStatus: 'unresponsive', icmpResponded: false},
    {id: 'node-c', depth: 0, address: '192.168.88.45', systemName: 'SWITCH-45', identitySource: 'snmpv3-authpriv', deviceKind:'switch', probeStatus:'responsive', icmpResponded: true},
  ],
  logicalSegments: [{id: 'subnet:lan', cidr: '192.168.88.0/22', hostIds: ['node-a','node-b','node-c']}],
  links: [],
}

test.beforeEach(async ({page}) => {
  await mockAdminSession(page)
  await page.route('**/api/v1/sites',route => route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({sites:['lan']}),
  }))
  await page.route('**/api/v1/topology/graph?*',route => route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(observed),
  }))
})

test.describe('Monitoring navigation & discovered-node inventory', () => {
  test.use({viewport:{width:1440,height:900}})
  test('opens Discovery from expandable RTL Monitoring menu, filters observed nodes and opens Maps', async ({page}) => {
    await page.goto('/')
    const nav = page.getByRole('navigation',{name:'ناوبری اصلی'})
    const monitoring = nav.getByRole('button',{name:'مانیتورینگ'})
    await expect(monitoring).toHaveAttribute('aria-expanded','true')
    await monitoring.click()
    await expect(nav.getByRole('link',{name:/Discovery/})).toHaveCount(0)
    await monitoring.click()
    await nav.getByRole('link',{name:/Discovery/}).click()
    await expect(page.getByTestId('monitoring-discovery')).toBeVisible()
    const table = page.getByRole('table',{name:'نودهای کشف‌شده شبکه'})
    await expect(table).toBeVisible()
    await expect(page.getByText('۳ نتیجه')).toBeVisible()
    await expect(table.getByText('SERVER-03')).toBeVisible()
    await expect(table.getByText('DEVICE-24')).toBeVisible()
    await expect(table.getByText('SWITCH-45')).toBeVisible()
    await expect(table.getByText('192.168.88.98')).toHaveCount(0)
    await page.getByRole('combobox',{name:'فیلتر نتیجه پایش'}).selectOption('unresponsive')
    await expect(page.getByText('۱ نتیجه')).toBeVisible()
    await expect(table.getByText('DEVICE-24')).toBeVisible()
    await expect(table.getByText('SERVER-03')).toHaveCount(0)
    await page.getByRole('combobox',{name:'فیلتر نتیجه پایش'}).selectOption('all')
    await page.getByRole('searchbox',{name:'جست‌وجوی نودهای کشف‌شده'}).fill('192.168.88.45')
    await expect(page.getByText('۱ نتیجه')).toBeVisible()
    await expect(table.getByText('SWITCH-45')).toBeVisible()
    await page.getByRole('button',{name:'ستون‌ها'}).click()
    await expect(page.getByText('ستون‌های قابل نمایش')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('link',{name:/بازکردن استودیو نقشه/}).click()
    await expect(page.getByTestId('topology-studio')).toBeVisible()
    await page.getByRole('link',{name:'بازگشت به Discovery'}).click()
    await expect(page.getByTestId('monitoring-discovery')).toBeVisible()
    await page.getByRole('link',{name:'مشاهده نود SWITCH-45 در نقشه'}).click()
    expect(new URL(page.url()).searchParams.get('focus')).toBe('node-c')
    await expect(page.getByTestId('topology-right-dock').getByTestId('node-inspector')).toContainText('SWITCH-45')
  })
  test('keeps evidence, manual link and every inspector form within the right dock, beside always-visible rotated rails', async ({page}) => {
    await page.goto('/topology?sample=1')
    const right = page.getByTestId('topology-right-dock')
    const stage = page.getByTestId('topology-stage')
    const rail = page.getByTestId('topology-right-rail')
    await expect(right).toBeVisible()
    await expect(rail).toBeVisible()
    const orientation = await rail.getByRole('button',{name:'بازکردن تب شواهد'}).evaluate(node => getComputedStyle(node).writingMode)
    expect(orientation).toBe('vertical-rl')

    await rail.getByRole('button',{name:'بازکردن تب شواهد'}).click()
    await expect(right.locator('[role="tablist"]')).toHaveCount(0)
    const evidence = right.locator('.access-form--topology')
    await expect(evidence).toBeVisible()
    const [formBox, dockBox, stageBox] = await Promise.all([evidence.boundingBox(), right.boundingBox(), stage.boundingBox()])
    expect(formBox && dockBox && stageBox).toBeTruthy()
    if (!formBox || !dockBox || !stageBox) return
    expect(formBox.x).toBeGreaterThanOrEqual(dockBox.x - 1)
    expect(formBox.x + formBox.width).toBeLessThanOrEqual(dockBox.x + dockBox.width + 1)
    expect(formBox.x).toBeGreaterThanOrEqual(stageBox.x + stageBox.width)
    expect(await evidence.evaluate(element => getComputedStyle(element).position)).toBe('static')
    await rail.getByRole('button',{name:'بازکردن تب ثبت لینک'}).click()
    const observation = right.locator('form.access-form--topology')
    await expect(observation).toBeVisible()
    const reportBox = await observation.boundingBox()
    expect(reportBox && reportBox.x >= dockBox.x - 1 && reportBox.x + reportBox.width <= dockBox.x + dockBox.width + 1).toBe(true)

    await page.getByRole('button',{name:'جمع‌کردن پنل راست · بازرسی'}).click()
    await expect(right).toHaveCount(0)
    await expect(rail).toBeVisible()
    await rail.getByRole('button',{name:'بازکردن تب شواهد'}).click()
    await expect(rail.getByRole('button',{name:'بازکردن تب شواهد'})).toHaveAttribute('aria-pressed','true')
  })

  test('uses independent collapsed dock rails; tab selection restores its pane without losing SVG', async ({page}) => {
    await page.goto('/topology?sample=1')
    const stage=page.getByTestId('topology-stage')
    await expect(stage).toBeVisible()
    await page.getByRole('button',{name:'جمع‌کردن پنل چپ · کاوش'}).click()
    await page.getByRole('button',{name:'جمع‌کردن پنل راست · بازرسی'}).click()
    await page.getByRole('button',{name:'جمع‌کردن پنل پایین · عملیات'}).click()
    await expect(page.getByTestId('topology-left-rail')).toBeVisible()
    await expect(page.getByTestId('topology-right-rail')).toBeVisible()
    await expect(page.getByTestId('topology-bottom-rail')).toBeVisible()
    await expect(stage.locator('.ig-network-flow')).toBeVisible()
    const before=await stage.boundingBox()
    expect(before?.width).toBeGreaterThan(900)
    await page.getByRole('button',{name:'بازکردن تب اسکن'}).click()
    await expect(page.getByTestId('topology-left-dock')).toContainText('کشف فعال IP و پایش تغییرات')
    await expect(page.getByTestId('topology-left-rail')).toBeVisible()
    await expect(page.getByTestId('topology-left-rail').getByRole('button',{name:'بازکردن تب اسکن'})).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button',{name:'بازکردن تب لایه‌ها'}).click()
    await expect(page.getByTestId('topology-right-rail').getByRole('button',{name:'بازکردن تب لایه‌ها'})).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button',{name:'بازکردن تب تحلیل مسیر'}).click()
    await expect(page.getByTestId('topology-bottom-rail').getByRole('button',{name:'بازکردن تب تحلیل مسیر'})).toHaveAttribute('aria-pressed','true')
    // Only edge rails navigate tools: no duplicated in-pane tab bars.
    for (const region of ['left','right','bottom'] as const) {
      await expect(page.getByTestId(`topology-${region}-dock`).locator('[role="tablist"], .ig-dock-tabbar, .studio-dock-tablist')).toHaveCount(0)
    }
    const bottomRail = page.getByTestId('topology-bottom-rail')
    const [strip, first] = await Promise.all([
      bottomRail.boundingBox(),
      bottomRail.getByRole('button',{name:'بازکردن تب وضعیت و شواهد'}).boundingBox(),
    ])
    expect(strip && first).toBeTruthy()
    if (strip && first) {
      expect(strip.x + strip.width - (first.x + first.width)).toBeLessThan(36)
      expect(await bottomRail.evaluate(node => getComputedStyle(node).direction)).toBe('rtl')
    }
  })
})

test.describe('Single-tab dock toggles',()=>{
  test.use({viewport:{width:1440,height:900}})
  test('clicking each active rail tab collapses its pane and another tab opens directly',async({page})=>{
    await page.goto('/topology?sample=1')
    const regions=[
      {region:'left',primary:'تجهیزات',secondary:'فیلترها'},
      {region:'right',primary:'مشخصات',secondary:'شواهد'},
      {region:'bottom',primary:'وضعیت و شواهد',secondary:'Replay'},
    ] as const
    const stage=page.getByTestId('topology-stage')
    const sameGraph=stage.locator('.ig-network-flow')
    await expect(sameGraph).toBeVisible()
    for (const {region,primary,secondary} of regions) {
      const rail=page.getByTestId(`topology-${region}-rail`)
      const dock=page.getByTestId(`topology-${region}-dock`)
      const first=rail.getByRole('button',{name:`بازکردن تب ${primary}`})
      await expect(first).toHaveAttribute('aria-pressed','true')
      await first.click()
      await expect(dock).toHaveCount(0)
      await expect(first).toHaveAttribute('aria-pressed','false')
      await expect(rail).toBeVisible()
      await first.click()
      await expect(dock).toBeVisible()
      await expect(first).toHaveAttribute('aria-pressed','true')
      const next=rail.getByRole('button',{name:`بازکردن تب ${secondary}`})
      await next.click()
      await expect(dock).toBeVisible()
      await expect(next).toHaveAttribute('aria-pressed','true')
      await expect(first).toHaveAttribute('aria-pressed','false')
      await next.click()
      await expect(dock).toHaveCount(0)
      await expect(next).toHaveAttribute('aria-pressed','false')
    }
    await expect(sameGraph).toBeVisible()
    await expect(page.getByTestId('topology-stage')).toBeVisible()
  })
})

test.describe('Responsive Monitoring',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true})
  test('mobile sidebar navigates to Discovery and the table scrolls internally',async({page})=>{
    await page.goto('/')
    await page.getByRole('button',{name:'باز کردن منوی برنامه'}).click()
    const menu=page.getByRole('dialog',{name:'منوی برنامه'})
    await expect(menu).toBeVisible()
    await menu.getByRole('link',{name:/Discovery/}).click()
    await expect(page.getByTestId('monitoring-discovery')).toBeVisible()
    await expect(page.getByRole('table',{name:'نودهای کشف‌شده شبکه'})).toBeVisible()
    const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)
    expect(noOverflow).toBe(true)
  })
  test('mobile studio keeps vertical and bottom tab rails visible when collapsed',async({page})=>{
    await page.goto('/topology?sample=1')
    await expect(page.getByTestId('topology-left-rail')).toBeVisible()
    await expect(page.getByTestId('topology-right-rail')).toBeVisible()
    await expect(page.getByTestId('topology-bottom-rail')).toBeVisible()
    await page.getByRole('button',{name:'بازکردن تب تجهیزات'}).click()
    await expect(page.getByTestId('topology-left-dock')).toBeVisible()
    await page.getByTestId('topology-left-dock').getByRole('button',{name:'جمع‌کردن پنل چپ · کاوش'}).click()
    await expect(page.getByTestId('topology-left-rail')).toBeVisible()
    await expect(page.getByTestId('topology-stage')).toBeVisible()
  })
})
