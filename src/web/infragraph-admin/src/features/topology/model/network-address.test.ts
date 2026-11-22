import { describe, expect, it } from 'vitest'
import { isPrivateIpv4 } from './network-address'

describe('private IPv4 literal gate for diagnostic UI', () => {
  it('allows RFC1918 addresses, never DNS names or arbitrary IP strings', () => {
    for (const ip of ['10.0.0.1','172.16.5.2','172.31.255.6','192.168.88.47'])
      expect(isPrivateIpv4(ip)).toBe(true)
    for (const ip of ['8.8.8.8','192.0.2.1','172.32.0.1','127.0.0.1','169.254.1.1',
      '192.168.002.4','192.168.88.256','192.168.88.0/22','localhost','','::1'])
      expect(isPrivateIpv4(ip)).toBe(false)
  })
})

