import type { DeviceKind } from '../model/topology'

/** Distinct local SVG silhouettes; not decorative status-dependent icons. */
export function DeviceGlyph({ kind, controlPlane = false }: { kind: DeviceKind; controlPlane?: boolean }) {
  const shape = controlPlane ? 'control' : kind
  return <svg viewBox="0 0 64 64" className={`ig-device-glyph ig-device-glyph--${shape}`} aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {shape === 'control' && <g><rect x="12" y="9" width="40" height="46" rx="5"/><rect x="18" y="16" width="28" height="9" rx="2"/><rect x="18" y="28" width="28" height="9" rx="2"/><rect x="18" y="40" width="28" height="9" rx="2"/><path d="M23 20h1m-1 12h1m-1 12h1"/></g>}
    {shape === 'subnet' && <g><circle cx="32" cy="32" r="8"/><circle cx="12" cy="12" r="6"/><circle cx="52" cy="12" r="6"/><circle cx="12" cy="52" r="6"/><circle cx="52" cy="52" r="6"/><path d="M26 26 16 16M38 26 48 16M26 38 16 48M38 38 48 48" strokeDasharray="4 3"/></g>}
    {shape === 'unknown' && <g><circle cx="32" cy="32" r="23" strokeDasharray="5 4"/><path d="M25 25c0-12 17-12 17-2 0 8-10 7-10 15M32 46h0"/></g>}
    {shape === 'switch' && <g><rect x="5" y="20" width="54" height="24" rx="5"/>{[0,1,2,3,4].map(i => <rect key={i} x={11+i*9} y="27" width="6" height="7" rx="1" strokeWidth="1.5"/>)}<path d="M14 39h20 M45 39h8"/></g>}
    {shape === 'router' && <g><circle cx="32" cy="32" r="24"/><path d="M18 24h29m-6-6 6 6-6 6M46 40H17m6-6-6 6 6 6"/></g>}
    {shape === 'firewall' && <g><path d="M32 5 52 13v18c0 14-10 23-20 28C22 54 12 45 12 31V13Z"/><path d="M17 22h30M17 32h30M23 42h18M28 22v10m10-10v10M32 32v10"/></g>}
    {shape === 'workstation' && <g><rect x="5" y="10" width="43" height="33" rx="4"/><path d="M18 51h17m-8-8v8M8 36h37"/><rect x="51" y="23" width="9" height="29" rx="2"/><path d="M55 46h1"/></g>}
    {shape === 'server' && <g><rect x="10" y="7" width="44" height="50" rx="5"/>{[14,28,42].map(y => <rect key={y} x="16" y={y} width="32" height="10" rx="2"/>)}<path d="M22 19h3m-3 14h3m-3 14h3"/></g>}
    {shape === 'wireless' && <g><rect x="13" y="42" width="38" height="13" rx="6"/><path d="M30 48h4M19 32c7-7 19-7 26 0M12 25c11-12 29-12 40 0M27 38c3-3 7-3 10 0"/></g>}
    {shape === 'internet' && <g><circle cx="32" cy="32" r="25"/><path d="M7 32h50M32 7c-17 13-17 37 0 50M32 7c17 13 17 37 0 50M12 20h40M12 44h40"/></g>}
  </svg>
}