import { expect, test } from '@playwright/test'
import { mockAdminSession } from './support/mock-admin'

const agentId = '77777777-7777-4777-8777-777777777777'
const graph = {
  siteId: 'lan',
  nodes: [{
    id: '192.168.88.47', depth: 0, address: '192.168.88.47',
    systemName: 'LAB-PC-01', deviceKind: 'workstation',
    identitySource: 'agent-self-reported-ip',
    agentId, agentStatus: 'recent', agentVersion: '0.2.0-preview',
    agentLastSeenAtUtc: '2026-11-23T13:35:46Z',
    tcpPorts: [], learnedMacCount: 0,
  }],
  links: [], staleObservations: 0, truncated: false,
  generatedAtUtc: '2026-11-23T13:35:46Z',
  provenance: 'agent-self-reported-evidence',
}
const inventory = {
  agentId, siteId: 'lan', evidenceStatus: 'recent',
  collectedAtUtc: '2026-11-23T13:35:40Z',
  receivedAtUtc: '2026-11-23T13:35:46Z',
  provenance: 'agent-self-reported',
  inventory: {
    agentId, installationEpoch: '88888888-8888-4888-8888-888888888888',
    hostName: 'LAB-PC-01', osVersion: 'Windows 11',
    agentVersion: '0.2.0-preview',
    cpuName: 'Example CPU', logicalProcessors: 8,
    ramTotalBytes: 17179869184,
    gpus: [{ name: 'NVIDIA GPU' }, { name: 'Virtual GPU' }],
    disks: [{ name: 'C:', totalBytes: 100000000000, freeBytes: 70000000000 }],
    networks: [{ name: 'Ethernet', ipAddresses: ['192.168.88.47'], status: 'Up' }],
    devices: [{ name: 'Printer' }],
    collectedAtUtc: '2026-11-23T13:35:40Z',
  },
}

test.beforeEach(async ({ page }) => {
  await mockAdminSession(page)
  await page.route('**/api/v1/sites', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sites: ['lan'] }),
  }))
  await page.route('**/api/v1/topology/graph?*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(graph),
  }))
  await page.route('**/api/v1/agents/*/inventory', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(inventory),
  }))
})

test('agent reports render as a computer node with an independent connection indicator and hardware details', async ({ page }) => {
  await page.goto('/topology')
  const node = page.getByTestId('node-192.168.88.47')
  await expect(node).toBeVisible()
  await expect(node).toContainText('LAB-PC-01')
  await expect(node.getByTestId('agent-node-indicator')).toContainText('گزارش اخیر')
  await expect(page.getByTestId('topology-agent-count')).toContainText('1')
  await node.click()
  const inspector = page.getByTestId('agent-inspector')
  await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('Example CPU')
  await expect(inspector).toContainText('Windows Agent')
  await expect(inspector.getByTestId('agent-connection-status')).toContainText('گزارش اخیر')
  await expect(inspector.locator('.ig-agent-spec').filter({ hasText: 'حافظه RAM' })).toContainText('۱۶')
  await expect(page.getByRole('alert', { name: /دریافت یا اعتبارسنجی/ })).toHaveCount(0)
})

test('stale Agent is not mislabelled as a healthy Windows workstation', async ({ page }) => {
  await page.route('**/api/v1/topology/graph?*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...graph,
      nodes: graph.nodes.map(node => ({ ...node, agentStatus: 'stale' })),
    }),
  }))
  await page.goto('/topology')
  const node = page.getByTestId('node-192.168.88.47')
  await expect(node).toBeVisible()
  await expect(node.getByTestId('agent-node-indicator')).toContainText('داده قدیمی')
  await expect(node.locator('.ig-node-state--unknown')).toBeVisible()
})