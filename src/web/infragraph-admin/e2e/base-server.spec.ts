import { expect, test } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

test.beforeEach(async ({page}) => {
  await mockAdminSession(page)
  await page.route('**/health/live',route => route.fulfill({status:200,body:''}))
  await page.route('**/health/ready',route => route.fulfill({
    status:503,contentType:'application/json',
    body:JSON.stringify({title:'Not ready',status:503}),
  }))
  await page.route('**/api/v1/sites',route => route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({sites:['lan']}),
  }))
  await page.route('**/api/v1/topology/graph?*',route => route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({
      siteId:'lan',generatedAtUtc:'2026-11-21T08:00:00Z',
      provenance:'active-ipv4-and-reported-evidence',staleObservations:0,truncated:false,
      nodes:[{id:'ip-1',depth:0,address:'192.168.88.47',probeStatus:'responsive',icmpResponded:true}],
      links:[],logicalSegments:[],
    }),
  }))
})

test.describe('BaseServer configuration surface', () => {
  test.use({viewport:{width:1440,height:900}})
  test('navigates from Infrastructure, shows real health and a gated scan form without launching one',async({page})=>{
    let writes=0
    page.on('request',request => { if(request.method()==='POST' && request.url().includes('/api/v1/discovery/scans')) writes++ })
    await page.goto('/')
    await page.getByRole('navigation',{name:'ناوبری اصلی'})
      .getByRole('link',{name:/BaseServer/}).click()
    await expect(page.getByTestId('monitoring-base-server')).toBeVisible()
    await expect(page.getByText('پاسخ‌گو',{exact:true})).toBeVisible()
    await expect(page.getByText('هنوز تأیید نشده',{exact:true})).toBeVisible()
    await expect(page.getByText('۱',{exact:true})).toBeVisible()
    await expect(page.getByRole('region',{name:'پیکربندی کشف شبکه'})).toBeVisible()
    await expect(page.getByRole('button',{name:'شروع اسکن واقعی'})).toBeDisabled()
    expect(writes).toBe(0)
  })
  test('site picker and Maps link work as navigation, never use scan as a side effect',async({page})=>{
    await page.goto('/monitoring/server')
    await expect(page.getByRole('combobox',{name:'انتخاب سایت مدیریت‌شده'})).toHaveValue('lan')
    await expect(page.getByRole('link',{name:/استودیو نقشه/})).toBeVisible()
    await page.getByRole('link',{name:/استودیو نقشه/}).click()
    await expect(page.getByTestId('topology-studio')).toBeVisible()
  })
})
test.describe('Read-only MikroTik onboarding', () => {
  test('guides an approved device without sending SNMP or collecting secrets', async ({ page }) => {
    let writes = 0
    page.on('request', request => {
      if (request.url().includes('/api/v1/diagnostics/run') ||
        request.url().includes('/api/v1/discovery/scans') && request.method() === 'POST')
        writes++
    })
    await page.route('**/api/v1/discovery/host-scope-candidates', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        available: true, capturedAtUtc: new Date().toISOString(),
        candidates: [{ cidr: '192.168.88.0/22', adapterAddress: '192.168.88.47',
          interfaceAlias: 'Ethernet', prefixLength: 22 }],
      }),
    }))
    await page.route('**/api/v1/discovery/scans?*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        siteId: 'lan', items: [{
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'running',
          cidrs: ['192.168.88.0/22'], intervalSeconds: 60, targetCount: 1022,
          probedCount: 50, responsiveCount: 30, cycle: 1, error: null,
          requestedAtUtc: new Date(Date.now()-100_000).toISOString(),
          startedAtUtc: new Date(Date.now()-90_000).toISOString(),
          lastSweepAtUtc: new Date(Date.now()-20_000).toISOString(),
          completedAtUtc: null,
        }],
      }),
    }))
    await page.goto('/monitoring/server')
    const panel = page.getByTestId('mikrotik-onboarding')
    await expect(panel.getByText('اتصال MikroTik و سوئیچ‌های مدیریت‌شده')).toBeVisible()
    await panel.locator('summary').click()
    await panel.getByRole('textbox', { name: 'IP مدیریتی MikroTik' }).fill('192.168.88.1')
    await panel.getByRole('combobox', { name: 'آدرس مبدأ SNMP' }).selectOption('192.168.88.47')
    await expect(panel.getByText(/IP در محدودهٔ یک Scan Job فعال و تازه/)).toBeVisible()
    await expect(panel.getByText(/addresses=192.168.88.47\/32/)).toBeVisible()
    await expect(panel.getByRole('checkbox')).toBeEnabled()
    const json = panel.locator('.mikrotik-snippet').filter({ hasText: 'snmp-targets.json' })
    await expect(json).toContainText('"approved": false')
    await panel.getByRole('checkbox').check()
    await expect(json).toContainText('"approved": true')
    await expect(panel).toContainText('write-access=no')
    expect(writes).toBe(0)
  })
})

test.describe('BaseServer responsive',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true})
  test('renders server controls without horizontal document overflow',async({page})=>{
    await page.goto('/monitoring/server')
    await expect(page.getByTestId('monitoring-base-server')).toBeVisible()
    const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)
    expect(noOverflow).toBe(true)
  })
})
