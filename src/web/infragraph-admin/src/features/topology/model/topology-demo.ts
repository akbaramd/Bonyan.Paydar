import type { Edge, Node } from '@xyflow/react'
import type { Device, TopologyDataset } from './topology'

const devices: readonly Device[] = [
  { id: 'internet', name: 'WAN-EDGE', title: 'ارتباط اینترنت', kind: 'internet', state: 'healthy', address: '198.51.100.1', site: 'ستاد مرکزی', vendor: 'Provider / Demo', port: 'WAN 1', description: 'درگاه ورودی شبکه سازمان', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'firewall', name: 'FW-01', title: 'فایروال مرزی', kind: 'firewall', state: 'healthy', address: '10.0.0.1', site: 'ستاد مرکزی', vendor: 'Virtual Appliance', port: 'port 1 / port 2', description: 'جداسازی شبکه داخلی از لبه اینترنت', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'core', name: 'CORE-SW-01', title: 'سوئیچ مرکزی', kind: 'switch', state: 'healthy', address: '10.10.0.2', site: 'اتاق سرور', vendor: 'Core Switch / Demo', port: 'Gi 1/0/48', description: 'تجمیع ارتباطات هسته شبکه', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'dist-a', name: 'DIST-SW-A', title: 'توزیع - ساختمان A', kind: 'switch', state: 'warning', address: '10.10.1.10', site: 'ساختمان A', vendor: 'Distribution Switch', port: 'Gi 1/0/24', description: 'ترافیک مسیر uplink نیازمند بررسی است', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'dist-b', name: 'DIST-SW-B', title: 'توزیع - ساختمان B', kind: 'switch', state: 'healthy', address: '10.10.2.10', site: 'ساختمان B', vendor: 'Distribution Switch', port: 'Gi 1/0/24', description: 'توزیع شبکه طبقات ساختمان B', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'collector', name: 'DISCOVERY-SRV', title: 'سرور شبیه‌ساز کشف', kind: 'server', role: 'collector', state: 'healthy', address: '10.20.0.9', site: 'اتاق سرور', vendor: 'InfraGraph Collector / Demo', port: 'eth0', description: 'منبع فرضی Replay برای نمایش مسیر درخواست و پاسخ؛ بدون Probe واقعی', evidence: 'داده ساختگی؛ نه مشاهده از شبکه واقعی' },
  { id: 'server', name: 'APP-SRV-01', title: 'سرور برنامه‌ها', kind: 'server', state: 'healthy', address: '10.20.0.15', site: 'اتاق سرور', vendor: 'Windows Server', port: 'eth0', description: 'سرور سرویس‌های داخلی سازمان', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'access-a', name: 'ACC-SW-01', title: 'سوئیچ دسترسی A', kind: 'switch', state: 'critical', address: '10.10.1.21', site: 'ساختمان A / طبقه ۲', vendor: 'Access Switch', port: 'Gi 0/1', description: 'افت ارتباط سوئیچ دسترسی در این سناریوی نمونه', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'access-b', name: 'ACC-SW-02', title: 'سوئیچ دسترسی B', kind: 'switch', state: 'healthy', address: '10.10.2.21', site: 'ساختمان B / طبقه ۱', vendor: 'Access Switch', port: 'Gi 0/1', description: 'شبکه دسترسی کاربران طبقه اول', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'client', name: 'PC-ACCT-07', title: 'ایستگاه امور مالی', kind: 'workstation', state: 'unknown', address: '10.30.1.17', site: 'ساختمان A / طبقه ۲', vendor: 'Windows Workstation', port: 'Ethernet', description: 'از دست رفتن دید مانیتورینگ ممکن است به علت سوئیچ بالادستی باشد', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'client-2', name: 'PC-ACCT-08', title: 'ایستگاه حسابداری', kind: 'workstation', state: 'unknown', address: '10.30.1.18', site: 'ساختمان A / طبقه ۲', vendor: 'Windows Workstation', port: 'Ethernet', description: 'در این نمونه، پس از قطع ارتباط سوئیچ بالادستی دیده نشده؛ علت تأیید نشده', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'client-3', name: 'PC-OPS-09', title: 'ایستگاه امور اداری', kind: 'workstation', state: 'unknown', address: '10.30.1.19', site: 'ساختمان A / طبقه ۲', vendor: 'Windows Workstation', port: 'Ethernet', description: 'در این نمونه، پس از قطع ارتباط سوئیچ بالادستی دیده نشده؛ علت تأیید نشده', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'client-4', name: 'PC-HR-02', title: 'ایستگاه منابع انسانی', kind: 'workstation', state: 'unknown', address: '10.30.1.20', site: 'ساختمان A / طبقه ۲', vendor: 'Windows Workstation', port: 'Ethernet', description: 'در این نمونه، پس از قطع ارتباط سوئیچ بالادستی دیده نشده؛ علت تأیید نشده', evidence: 'شواهد ساختگی برای آزمایش رابط' },
  { id: 'wifi', name: 'AP-LOBBY', title: 'اکسس‌پوینت سالن', kind: 'wireless', state: 'healthy', address: '10.30.2.22', site: 'ساختمان B / همکف', vendor: 'Wireless AP', port: 'eth0', description: 'پوشش شبکه بی‌سیم سالن ورودی', evidence: 'شواهد ساختگی برای آزمایش رابط' },
]

const positions: Record<string, { x: number; y: number }> = {
  internet: { x: 475, y: 25 }, firewall: { x: 475, y: 160 }, core: { x: 475, y: 297 },
  'dist-a': { x: 110, y: 460 }, 'dist-b': { x: 820, y: 460 }, server: { x: 500, y: 460 },
  collector: { x: 365, y: 460 },
  'access-a': { x: 110, y: 620 }, 'access-b': { x: 820, y: 620 },
  client: { x: 100, y: 785 }, 'client-2': { x: 200, y: 785 }, 'client-3': { x: 300, y: 785 }, 'client-4': { x: 400, y: 785 }, wifi: { x: 820, y: 785 },
}

const connections = [
  ['internet','firewall','WAN / 1G'],
  ['firewall','core','Port 2'],
  ['core','dist-a','Gi0/1'],
  ['core','dist-b','Gi0/2'],
  ['core','server','Gi0/10'],
  ['core','collector','Gi0/11'],
  ['dist-a','access-a','Uplink'],
  ['dist-b','access-b','Uplink'],
  ['access-a','client','Gi0/4'],
  ['access-a','client-2','Gi0/5'],
  ['access-a','client-3','Gi0/6'],
  ['access-a','client-4','Gi0/7'],
  ['access-b','wifi','Gi0/8'],
] as const

/** This dataset is deliberately synthetic and isolated from operational inventory. */
export function createSyntheticTopology(): TopologyDataset {
  const nodes: Node[] = devices.map((device) => ({
    id: device.id,
    type: 'device',
    position: positions[device.id],
    draggable: false,
    connectable: false,
    data: { device },
  }))

  const edges: Edge[] = connections.map(([source, target, label]) => ({
    id: `${source}--${target}`,
    source, target, label, type: 'smoothstep',
    animated: false,
    className: source === 'dist-a' && target === 'access-a' ? 'ig-edge--critical' : '',
    style: { strokeWidth: source === 'dist-a' && target === 'access-a' ? 2.5 : 1.65 },
  }))

  return { origin: 'synthetic', observedAt: null, devices, nodes, edges }
}