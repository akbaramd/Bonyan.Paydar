import { isPrivateIpv4 } from './network-address'

export type SnmpEligibleJob = {
  cidrs: readonly string[]
  status: string
  intervalSeconds: number
  startedAtUtc: string | null
  lastSweepAtUtc: string | null
}

/** Display-only check. Actual Worker authorization stays server-side. */
export function isTargetCoveredByFreshJob(
  address: string, jobs: readonly SnmpEligibleJob[], nowMs: number,
): boolean {
  if (!isPrivateIpv4(address)) return false
  return jobs.some(job => {
    if (job.status !== 'running' || job.intervalSeconds < 30 ||
        job.intervalSeconds > 3600 || !job.startedAtUtc) return false
    const started = Date.parse(job.startedAtUtc)
    const latest = job.lastSweepAtUtc ? Date.parse(job.lastSweepAtUtc) : started
    if (!Number.isFinite(started) || !Number.isFinite(latest) ||
      started > nowMs || latest < started || latest > nowMs ||
      nowMs - latest > (job.intervalSeconds + 300) * 1000) return false
    return job.cidrs.some(cidr => addressInApprovedCidr(address, cidr))
  })
}

export function addressInApprovedCidr(address: string, cidr: string): boolean {
  if (!isPrivateIpv4(address)) return false
  const [network, prefixString, extra] = cidr.split('/')
  if (extra || !network || !prefixString || !/^\d{2}$/.test(prefixString) ||
    !isPrivateIpv4(network)) return false
  const prefix = Number(prefixString)
  if (prefix < 22 || prefix > 32) return false
  const ip = address.split('.').map(Number)
  const cidrIp = network.split('.').map(Number)
  const toUint = (x: number[]) =>
    (x[0] * 16777216 + x[1] * 65536 + x[2] * 256 + x[3]) >>> 0
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  const networkUint = toUint(cidrIp)
  const targetUint = toUint(ip)
  if ((networkUint & mask) !== (networkUint | 0)) return false
  if (prefix <= 30 && (targetUint === networkUint ||
    targetUint === ((networkUint | ~mask) >>> 0))) return false
  return (targetUint & mask) === (networkUint & mask)
}

export function buildMikrotikSnmpCommand(sourceAddress: string): string {
  const source = isPrivateIpv4(sourceAddress) ? sourceAddress : 'COLLECTOR_SOURCE_IP'
  return [
    '/snmp set enabled=yes',
    '/snmp community add name=infragraph-ro \\',
    '    addresses=' + source + '/32 security=private \\',
    '    authentication-protocol=SHA256 encryption-protocol=AES \\',
    '    authentication-password="<SET_AUTH_SECRET>" \\',
    '    encryption-password="<SET_PRIV_SECRET>" \\',
    '    read-access=yes write-access=no',
  ].join('\n')
}

export function buildSnmpTargetFile(siteId: string, address: string, approved: boolean): string {
  return JSON.stringify({
    targets: [{ siteId, address, approved }],
  }, null, 2)
}
