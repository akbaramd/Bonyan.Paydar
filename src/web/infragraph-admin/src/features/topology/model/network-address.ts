/** Canonical private IPv4 host literals only; still requires server-side approved-site authorization. */
export function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some(value => !/^(0|[1-9]\d{0,2})$/.test(value) || Number(value) > 255))
    return false
  const [a,b] = parts.map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}
