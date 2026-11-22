import { expect, test } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

test.beforeEach(async ({ page }) => {
  await mockAdminSession(page)
  await page.route('**/api/v1/sites', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sites: ['lan'] }),
  }))
  await page.route('**/api/v1/topology/graph?*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      siteId: 'lan', generatedAtUtc: '2026-11-21T09:00:00Z',
      provenance: 'active-ipv4-and-reported-evidence', staleObservations: 0, truncated: false,
      nodes: [{ id: 'ip-1', depth: 0, address: '192.168.88.47',
        probeStatus: 'responsive', icmpResponded: true },
      { id: 'ip-2', depth: 0, address: '192.168.88.55',
        probeStatus: 'responsive', icmpResponded: true }],
      links: [], logicalSegments: [{
        id: 'subnet:lan', cidr: '192.168.88.0/22', hostIds: ['ip-1', 'ip-2'],
      }],
    }),
  }))
  await page.route('**/api/v1/auth/csrf', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'browser-test-token' }),
  }))
})

test.describe('Node context actions and explicit diagnostics', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('right-click menu opens real diagnostic flow; no probe without consent', async ({ page }) => {
    let calls = 0
    await page.route('**/api/v1/diagnostics/run', async route => {
      calls++
      const payload = route.request().postDataJSON()
      expect(payload).toMatchObject({
        siteId: 'lan', address: '192.168.88.47', confirmed: true,
      })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        kind: payload.kind, address: payload.address, source: 'controlplane',
        observedAtUtc: '2026-11-21T10:00:00Z',
        reachedDestination: true, attempts: 1, responses: 1, averageRttMs: 1,
        steps: [{ ttl: 1, status: 'reply', from: payload.address, rttMs: 1 }],
        interpretation: 'Test only. Real response is produced by the BaseServer.',
      }) })
    })
    await page.goto('/topology')
    const node = page.getByTestId('node-ip-1')
    await expect(node).toBeVisible()
    await node.click({ button: 'right' })
    await expect(page.getByRole('menu', { name: 'عملیات نود' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Ping از BaseServer' }).click()
    const diagnostics = page.getByTestId('node-diagnostics')
    await expect(diagnostics).toBeVisible()
    await expect(diagnostics.getByText('192.168.88.47')).toBeVisible()
    await expect(diagnostics.getByRole('button', { name: 'اجرای Ping' })).toBeDisabled()
    expect(calls).toBe(0)
    await diagnostics.getByRole('checkbox').check()
    await diagnostics.getByRole('button', { name: 'اجرای Ping' }).click()
    await expect(diagnostics.getByText('نتیجهٔ واقعی ICMP')).toBeVisible()
    expect(calls).toBe(1)

    await node.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Traceroute از BaseServer' }).click()
    await expect(diagnostics.getByRole('button', { name: 'اجرای Traceroute' })).toBeDisabled()
    expect(calls).toBe(1)
    await diagnostics.getByRole('checkbox').check()
    await diagnostics.getByRole('button', { name: 'اجرای Traceroute' }).click()
    await expect(diagnostics.getByText('نتیجهٔ واقعی ICMP')).toBeVisible()
    expect(calls).toBe(2)
  })

  test('opens accessible node actions through Shift+F10 on a focused graph node', async ({ page }) => {
    await page.goto('/topology')
    const node = page.locator('.react-flow__node[data-id="ip-1"]')
    await expect(node).toBeVisible()
    await node.focus()
    await page.keyboard.press('Shift+F10')
    await expect(page.getByRole('menu', { name: 'عملیات نود' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'تمرکز روی نود' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'عملیات نود' })).toHaveCount(0)
  })

  test('starts a manual unverified link from the context node and selects the destination', async ({ page }) => {
    let writes = 0
    await page.route('**/api/v1/discovery/observations', async route => {
      writes++
      const body = route.request().postDataJSON()
      expect(body[0]).toMatchObject({
        siteId: 'lan', sourceKey: 'ip-1', targetKey: 'ip-2',
        sourcePort: 'ether2', targetPort: 'ether3',
        protocol: 'MANUAL', ttlSeconds: 3600,
      })
      await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
    })
    await page.goto('/topology')
    await page.getByTestId('node-ip-1').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'ثبت ارتباط از این نود' }).click()
    const form = page.getByRole('form', { name: 'ثبت گزارش ارتباط دستی نودها' })
    await expect(form).toBeVisible()
    await expect(form.getByRole('combobox', { name: 'نود مبدأ ارتباط' })).toHaveValue('ip-1')
    await expect(form.getByRole('button', { name: 'ثبت گزارش تأییدنشده (۱ ساعت)' })).toBeDisabled()
    expect(writes).toBe(0)
    await form.getByRole('combobox', { name: 'نود مقصد ارتباط' }).selectOption('ip-2')
    await form.getByRole('textbox', { name: 'پورت مبدأ ارتباط' }).fill('ether2')
    await form.getByRole('textbox', { name: 'پورت مقصد ارتباط' }).fill('ether3')
    await form.getByRole('button', { name: 'ثبت گزارش تأییدنشده (۱ ساعت)' }).click()
    await expect(form.getByText(/ارتباط اپراتوری برای یک ساعت ثبت شد/)).toBeVisible()
    expect(writes).toBe(1)
  })

  test('shows evidence-backed LLDP peer ports without claiming physical cable proof', async ({ page }) => {
    await page.route('**/api/v1/topology/graph?*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        siteId: 'lan', generatedAtUtc: new Date().toISOString(),
        provenance: 'snmpv3-and-active-ipv4-evidence', staleObservations: 0, truncated: false,
        nodes: [
          { id: '192.168.88.1', depth: 0, address: '192.168.88.1',
            systemName: 'Main-Gateway', deviceKind: 'router', identitySource: 'snmpv3-authpriv',
            snmpObservedAtUtc: new Date().toISOString() },
          { id: '192.168.88.2', depth: 0, address: '192.168.88.2',
            systemName: 'Managed-Switch', deviceKind: 'switch', identitySource: 'snmpv3-authpriv',
            snmpObservedAtUtc: new Date().toISOString() },
        ],
        logicalSegments: [], links: [{
          id: 'lldp:test', source: '192.168.88.1', target: '192.168.88.2',
          sourcePort: 'ether2', targetPort: 'sfp-sfpplus1', protocol: 'LLDP',
          evidenceIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
          possibleCycle: false, evidenceSource: 'snmpv3-authpriv', corroboration: 'reciprocal',
        }],
      }),
    }))
    await page.goto('/topology')
    await page.getByTestId('node-192.168.88.1').click()
    const inspector = page.getByTestId('node-inspector')
    await expect(inspector).toContainText('Managed-Switch')
    await expect(inspector).toContainText('LLDP دوطرفه')
    await expect(inspector).toContainText('ether2')
    await expect(inspector).toContainText('sfp-sfpplus1')
    await expect(inspector).toContainText('پورت‌های TCP پاسخ‌گو')
  })

  test('disables diagnostics for logical subnet and never offers arbitrary site IDs', async ({ page }) => {
    await page.goto('/topology')
    await expect(page.getByTestId('node-subnet:lan')).toBeVisible()
    await page.getByTestId('node-subnet:lan').click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Ping از BaseServer' })).toHaveAttribute('data-disabled')
    await page.keyboard.press('Escape')
    await page.getByTestId('topology-left-rail').getByRole('button', { name: 'بازکردن تب فیلترها' }).click()
    await expect(page.getByRole('combobox', { name: 'انتخاب سایت مدیریت‌شده' })).toHaveValue('lan')
    await expect(page.getByRole('textbox', { name: 'شناسه سایت واقعی' })).toHaveCount(0)
  })
})
