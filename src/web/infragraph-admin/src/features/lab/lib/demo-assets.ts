/** Synthetic UX stress-test data only. Never merge into operational inventory. */
export type DemoAssetStatus = 'healthy' | 'degraded' | 'unknown' | 'down'
export type DemoAsset = {
  id: string
  name: string
  ip: string
  site: string
  type: string
  status: DemoAssetStatus
  seenAt: string
}

const sites = ['ساختمان مرکزی', 'دیتاسنتر شمال', 'شعبه غرب', 'شعبه جنوب', 'مرکز پشتیبان'] as const
const types = ['Switch', 'Server', 'Workstation', 'Router', 'Access Point'] as const
const statuses: DemoAssetStatus[] = ['healthy', 'healthy', 'healthy', 'degraded', 'unknown', 'down']

export function generateDemoAssets(count: number): DemoAsset[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `demo-asset-${index + 1}`,
    name: `${types[index % types.length]}-${String(index + 1).padStart(5, '0')}`,
    ip: `10.${Math.floor(index / 65025) % 256}.${Math.floor(index / 255) % 255}.${index % 254 + 1}`,
    site: sites[index % sites.length],
    type: types[index % types.length],
    status: statuses[index % statuses.length],
    seenAt: new Date(Date.UTC(2026, 10, 18, 20, index % 60)).toISOString(),
  }))
}

export function filterDemoAssets(assets: DemoAsset[], search: string, site: string, status: string): DemoAsset[] {
  const q = search.trim().toLowerCase()
  return assets.filter((item) =>
    (site === 'all' || item.site === site) &&
    (status === 'all' || item.status === status) &&
    (!q || item.name.toLowerCase().includes(q) || item.ip.includes(q) || item.type.toLowerCase().includes(q)),
  )
}

export const demoSites = [...sites]
export const demoStatuses = ['all', 'healthy', 'degraded', 'unknown', 'down'] as const
