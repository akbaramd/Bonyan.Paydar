import type { GraphResponse } from '../api/graph'

export type DiscoveryRow = {
  id: string
  address: string
  name: string
  deviceKind: 'router' | 'switch' | 'unknown'
  source: 'snmpv3-authpriv' | 'lldp-remote' | 'active-ipv4'
  probeStatus: 'responsive' | 'suspect' | 'unresponsive' | 'stale' | 'not-monitored'
  icmpResponded: boolean | null
  ports: readonly number[]
  lastSeenAtUtc: string | null
  snmpObservedAtUtc: string | null
  learnedMacCount: number
}

export const discoveryStatusLabels: Record<DiscoveryRow['probeStatus'], string> = {
  responsive: 'پاسخ‌گو در آخرین پایش',
  suspect: 'یک دور بدون پاسخ',
  unresponsive: 'دو دور بدون پاسخ',
  stale: 'اطلاعات قدیمی',
  'not-monitored': 'پایش نشده',
}

/** Discovery rows are observed assets only: never show CIDR group placeholders or operator-only nodes as discovered hosts. */
export function discoveryRows(graph: GraphResponse): DiscoveryRow[] {
  return graph.nodes.filter(node => node.probeStatus || node.identitySource).map((node): DiscoveryRow => ({
    id: node.id,
    address: node.address ?? '',
    name: node.systemName ?? node.address ?? node.id,
    deviceKind: node.deviceKind ?? 'unknown',
    source: node.identitySource ?? 'active-ipv4',
    probeStatus: node.probeStatus ?? 'not-monitored',
    icmpResponded: node.icmpResponded ?? null,
    ports: node.tcpPorts ?? [],
    lastSeenAtUtc: node.lastSeenAtUtc ?? null,
    snmpObservedAtUtc: node.snmpObservedAtUtc ?? null,
    learnedMacCount: node.learnedMacCount ?? 0,
  })).sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }))
}

export function discoveryTotals(rows: readonly DiscoveryRow[]) {
  return {
    total: rows.length,
    responsive: rows.filter(row => row.probeStatus === 'responsive').length,
    suspect: rows.filter(row => row.probeStatus === 'suspect').length,
    unresponsive: rows.filter(row => row.probeStatus === 'unresponsive').length,
    stale: rows.filter(row => row.probeStatus === 'stale').length,
    identified: rows.filter(row => row.source === 'snmpv3-authpriv').length,
  }
}