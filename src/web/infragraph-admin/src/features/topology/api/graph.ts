import { z } from 'zod'
import type { Edge, Node } from '@xyflow/react'
import { getJson } from '../../../shared/api/http'
import type { Device, TopologyDataset } from '../model/topology'

export const graphSchema = z.object({
  siteId: z.string(),
  nodes: z.array(z.object({
    id: z.string(), depth: z.number().int().nonnegative(),
    address: z.string().nullable().optional(),
    systemName: z.string().nullable().optional(),
    systemDescription: z.string().nullable().optional(),
    systemObjectId: z.string().nullable().optional(),
    deviceKind: z.enum(['unknown', 'router', 'switch']).optional(),
    snmpObservedAtUtc: z.string().nullable().optional(),
    learnedMacCount: z.number().int().nonnegative().optional(),
    identitySource: z.enum(['snmpv3-authpriv', 'lldp-remote']).nullable().optional(),
    probeStatus: z.enum(['responsive', 'suspect', 'unresponsive', 'stale']).nullable().optional(),
    consecutiveMisses: z.number().int().nonnegative().nullable().optional(),
    icmpResponded: z.boolean().nullable().optional(),
    tcpPorts: z.array(z.number().int()).optional(),
    lastSeenAtUtc: z.string().nullable().optional(),
    lastProbedAtUtc: z.string().nullable().optional(),
  })).max(4096),
  logicalSegments: z.array(z.object({
    id: z.string().startsWith('subnet:'), cidr: z.string(),
    hostIds: z.array(z.string()).max(1024),
  })).max(64).optional(),
  links: z.array(z.object({
    id: z.string(), source: z.string(), target: z.string(),
    sourcePort: z.string().nullable(), targetPort: z.string().nullable(),
    protocol: z.string(), evidenceIds: z.array(z.string().uuid()), possibleCycle: z.boolean(),
    evidenceSource: z.enum(['operator-reported-unverified', 'snmpv3-authpriv']).optional(),
    corroboration: z.enum(['reciprocal', 'single-sided', 'unresolved', 'ambiguous-port']).nullable().optional(),
  })).max(10000),
  staleObservations: z.number().int(), truncated: z.boolean(),
  generatedAtUtc: z.string(), provenance: z.enum(['operator-reported-unverified', 'active-ipv4-and-reported-evidence', 'snmpv3-and-active-ipv4-evidence']),
})
export type GraphResponse = z.infer<typeof graphSchema>
export async function getGraph(siteId: string, signal?: AbortSignal) {
  return getJson(`/api/v1/topology/graph?siteId=${encodeURIComponent(siteId)}`, graphSchema, signal)
}
export function toTopologyDataset(graph: GraphResponse): TopologyDataset {
  const discoveredDevices: Device[] = graph.nodes.map((item) => {
    const probed = Boolean(item.probeStatus)
    const latest = item.lastSeenAtUtc ? new Date(item.lastSeenAtUtc).toLocaleString('fa-IR') : 'نامشخص'
    return {
      id: item.id, name: item.systemName ?? item.id,
      title: item.identitySource === 'snmpv3-authpriv'
        ? 'تجهیز شناسایی‌شده با SNMPv3 خواندنی؛ نوع بر اساس شواهد پروتکلی'
        : item.identitySource === 'lldp-remote'
          ? 'همسایهٔ گزارش‌شده با LLDP؛ آدرس IP و نوع هنوز تأیید نشده'
          : probed ? 'میزبان IP کشف‌شده؛ نوع دستگاه نامشخص' : 'تجهیز با نوع نامشخص',
      kind: item.deviceKind === 'switch' ? 'switch' :
        item.deviceKind === 'router' ? 'router' : 'unknown',
      state: item.probeStatus === 'unresponsive' || item.probeStatus === 'suspect'
        ? 'warning' : 'unknown',
      address: item.address ?? 'نامشخص', site: graph.siteId,
      vendor: item.systemObjectId ?? 'نامشخص',
      port: item.tcpPorts?.join(', ') || 'نامشخص',
      description: item.identitySource
        ? `${item.systemDescription ?? 'اطلاعات مدل در دسترس نیست'}. آخرین مشاهده SNMP: ${item.snmpObservedAtUtc
          ? new Date(item.snmpObservedAtUtc).toLocaleString('fa-IR') : 'نامشخص'}.
          MACهای یادگرفته‌شده در FDB: ${item.learnedMacCount ?? 0} (نه لزوماً متصل مستقیم).`
        : probed
        ? `آخرین پاسخ مثبت: ${latest}. وضعیت فعلی: ${item.probeStatus === 'responsive' ? 'پاسخ مثبت ICMP/TCP'
          : item.probeStatus === 'suspect' ? 'یک پیمایش بدون پاسخ؛ نیازمند تأیید'
          : item.probeStatus === 'stale' ? 'پایش این میزبان فعال نیست یا داده قدیمی است'
          : 'دو پیمایش متوالی بدون پاسخ؛ قطعی دستگاه اثبات نشده است'}.`
        : 'وجود این همسایه فقط بر اساس گزارش واردشده است؛ هنوز از شبکه تأیید نشده است.',
      evidence: item.identitySource === 'snmpv3-authpriv'
        ? 'SNMPv3 authPriv (SHA-256/AES) و LLDP؛ جدول MAC صرفاً شاهد یادگیری پورت است'
        : item.identitySource === 'lldp-remote'
          ? 'LLDP همسایه از تجهیز مدیریت‌شده؛ هنوز SNMPv3 مستقیم از این نود خوانده نشده'
          : probed
        ? `اسکن فعال IP · ICMP: ${item.icmpResponded ? 'پاسخ مثبت' : 'بدون پاسخ'} · پورت‌های TCP: ${item.tcpPorts?.join(', ') || 'هیچ'} · لینک فیزیکی اثبات نشده`
        : 'گزارش اپراتور؛ تأیید مستقل شبکه انجام نشده است',
    }
  })
  const segmentDevices: Device[] = (graph.logicalSegments ?? []).map(segment => ({
    id: segment.id, name: segment.cidr,
    title: 'عضویت منطقی IP؛ لینک فیزیکی یا سوئیچ واقعی شناسایی نشده است',
    kind: 'subnet', state: 'unknown', address: segment.cidr, site: graph.siteId,
    vendor: 'تجهیز فیزیکی نیست', port: 'نامشخص',
    description: `${segment.hostIds.length} آدرس کشف‌شده در CIDR مجاز. این خطوط فقط عضویت در شبکه را نمایش می‌دهند؛ اتصال مستقیم، پورت و مسیر بسته اثبات نشده است.`,
    evidence: 'CIDR تأییدشده در Scan Job + آدرس IP کشف‌شده؛ بدون LLDP/SNMP',
  }))
  const devices: Device[] = [...segmentDevices, ...discoveredDevices]
  const nodes: Node[] = devices.map((device) => ({
    id: device.id, type: 'device', position: { x: 0, y: 0 }, draggable: false, data: { device },
  }))
  const edges: Edge[] = graph.links.map(link => {
    const lldp = link.protocol === 'LLDP' && link.evidenceSource === 'snmpv3-authpriv'
    const corroboration = lldp ? (link.corroboration ?? 'single-sided') : undefined
    const lldpLabel = corroboration === 'reciprocal' ? 'LLDP دوطرفه'
      : corroboration === 'ambiguous-port' ? 'LLDP چند همسایه'
      : corroboration === 'unresolved' ? 'LLDP حل‌نشده'
      : 'LLDP یک‌طرفه'
    return {
      id: link.id, source: link.source, target: link.target,
      type: 'signal', label: lldp ? lldpLabel : link.protocol,
      data: { possibleCycle: link.possibleCycle, evidenceIds: link.evidenceIds,
        sourcePort: link.sourcePort, targetPort: link.targetPort,
        verifiedLldp: lldp,
        corroboration, evidenceSource: link.evidenceSource },
    }
  })
  for (const segment of graph.logicalSegments ?? []) {
    for (const hostId of segment.hostIds) {
      if (!discoveredDevices.some(device => device.id === hostId)) continue
      edges.push({
        id: `membership:${segment.cidr}:${hostId}`,
        source: segment.id, target: hostId, type: 'signal',
        label: 'هم‌شبکه؛ نه لینک فیزیکی',
        data: { logicalMembership: true, provenance: 'approved-scan-cidr' },
      })
    }
  }
  return { origin: graph.provenance !== 'operator-reported-unverified' ? 'live' : 'reported',
    observedAt: graph.generatedAtUtc, devices, nodes, edges }
}