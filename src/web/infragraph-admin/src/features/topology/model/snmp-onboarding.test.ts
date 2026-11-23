import { describe, expect, it } from 'vitest'
import {
  addressInApprovedCidr, buildMikrotikSnmpCommand, buildSnmpTargetFile,
  isTargetCoveredByFreshJob,
} from './snmp-onboarding'

describe('read-only MikroTik onboarding preview', () => {
  const nowMs = Date.parse('2026-11-21T10:00:00Z')
  const running = [{
    cidrs: ['192.168.88.0/22'], status: 'running', intervalSeconds: 60,
    startedAtUtc: '2026-11-21T09:50:00Z', lastSweepAtUtc: '2026-11-21T09:59:00Z',
  }]
  it('only considers a host within an approved canonical private CIDR', () => {
    for (const address of ['192.168.88.1','192.168.89.22','192.168.90.34'])
      expect(addressInApprovedCidr(address,'192.168.88.0/22')).toBe(true)
    for (const address of ['192.168.204.1','10.0.0.1','1.1.1.1','192.168.203.255'])
      expect(addressInApprovedCidr(address,'192.168.88.0/22')).toBe(false)
    for (const cidr of ['192.168.88.0/20','192.168.201.0/24','8.8.8.0/24',
      '192.168.88.0/033','192.168.88.0/abc'])
      expect(addressInApprovedCidr('192.168.88.34',cidr)).toBe(false)
    expect(addressInApprovedCidr('192.168.88.0','192.168.88.0/24')).toBe(false)
    expect(addressInApprovedCidr('192.168.88.255','192.168.88.0/24')).toBe(false)
    expect(addressInApprovedCidr('192.168.88.34','192.168.88.34/32')).toBe(true)
  })
  it('requires a fresh running job and site approval, not a historical scan', () => {
    expect(isTargetCoveredByFreshJob('192.168.88.34',running,nowMs)).toBe(true)
    expect(isTargetCoveredByFreshJob('192.168.204.1',running,nowMs)).toBe(false)
    expect(isTargetCoveredByFreshJob('192.168.88.34',running,nowMs + 600_000)).toBe(false)
    expect(isTargetCoveredByFreshJob('192.168.88.34',
      [{...running[0],status:'cancelled'}],nowMs)).toBe(false)
    expect(isTargetCoveredByFreshJob('192.168.88.34',
      [{...running[0],startedAtUtc:null}],nowMs)).toBe(false)
    expect(isTargetCoveredByFreshJob('192.168.88.34',
      [{...running[0],intervalSeconds:20}],nowMs)).toBe(false)
  })
  it('never embeds credentials, write access or arbitrary source IPs in CLI templates', () => {
    const command = buildMikrotikSnmpCommand('192.168.88.47')
    expect(command).toContain('addresses=192.168.88.47/32')
    expect(command).toContain('security=private')
    expect(command).toContain('authentication-protocol=SHA256')
    expect(command).toContain('write-access=no')
    expect(command).not.toContain('write-access=yes')
    expect(buildMikrotikSnmpCommand('8.8.8.8')).toContain('COLLECTOR_SOURCE_IP')
    const target = JSON.parse(buildSnmpTargetFile('lan','192.168.88.34',false))
    expect(target).toEqual({targets:[{siteId:'lan',address:'192.168.88.34',approved:false}]})
  })
})