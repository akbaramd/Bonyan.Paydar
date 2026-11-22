import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import type { ProbePhase } from '../model/topology-playback'

/** Single active probe marker per step; this illustrates fixture traversal, not packet capture. */
export function SignalEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, data, markerEnd }: EdgeProps) {
  const [path, centerX, centerY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12, offset: 24,
  })
  const phase = data?.phase as ProbePhase | undefined
  const animated = Boolean(data?.running) && (phase === 'request' || phase === 'reply') && Boolean(data?.motion)
  const reverse = Boolean(data?.reverse)
  const speed = Number(data?.speed ?? 1)
  const showLabel = Boolean(data?.showLabel)
  const dimmed = Boolean(data?.dimmed)
  const route = Boolean(data?.route)
  const unknown = Boolean(data?.unknown)
  const suspected = Boolean(data?.suspected)
  const logicalMembership = Boolean(data?.logicalMembership)
  const reported = data?.evidenceSource === 'operator-reported-unverified'
  const observedLldp = data?.verifiedLldp === true
  const corroboration = data?.corroboration
  const evidenceStyle = logicalMembership
    ? { strokeDasharray: '5 7', opacity: 0.52 }
    : reported ? { strokeDasharray: '3 6', opacity: 0.62 }
    : observedLldp && corroboration === 'ambiguous-port'
      ? { strokeDasharray: '2 6', opacity: 0.55 }
    : observedLldp && corroboration !== 'reciprocal'
      ? { strokeDasharray: '9 5', opacity: 0.72 }
    : undefined
  const evidenceTitle = logicalMembership ? 'عضویت منطقی در زیرشبکه؛ نه کابل فیزیکی'
    : reported ? 'ارتباط ثبت‌شده توسط اپراتور؛ هنوز از شبکه تأیید نشده'
    : observedLldp && corroboration === 'reciprocal'
      ? 'همسایگی LLDP از هر دو تجهیز مدیریت‌شده و پورت‌های متناظر؛ کابل فیزیکی مستقل تأیید نشده'
    : observedLldp && corroboration === 'ambiguous-port'
      ? 'چند همسایه LLDP برای یک پورت گزارش شده‌اند؛ اتصال مستقیم یکتا تأیید نشده'
    : observedLldp && corroboration === 'unresolved'
      ? 'همسایه LLDP دریافت شده ولی شناسه مقصد به تجهیز مدیریت‌شده یکتا متصل نشده'
    : observedLldp
      ? 'همسایگی LLDP فقط از یک سمت دریافت شده؛ پورت مقابل مستقل تأیید نشده'
      : undefined
  return <g className={`ig-signal-edge${phase ? ` ig-signal-edge--${phase}` : ''}${dimmed ? ' ig-signal-edge--muted' : ''}${route ? ' ig-signal-edge--route' : ''}${suspected ? ' ig-signal-edge--suspected' : ''}${unknown ? ' ig-signal-edge--unobserved' : ''}${unknown ? ' ig-signal-edge--unknown' : ''}`}>
    {evidenceTitle && <title>{evidenceTitle}</title>}
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={evidenceStyle}/>
    {showLabel && label != null && <text x={centerX} y={centerY - 9} className="ig-signal-label" textAnchor="middle" direction="ltr">{String(label)}</text>}
    {animated && <circle key={String(data?.stepId)} r="5" className={`ig-signal-packet ig-signal-packet--${phase}`}>
      <animateMotion
        path={path}
        dur={`${(0.82 / Math.max(0.5, speed)).toFixed(2)}s`}
        calcMode="linear"
        keyPoints={reverse ? '1;0' : '0;1'}
        keyTimes="0;1"
        fill="freeze"
      />
    </circle>}
    {phase === 'timeout' && <circle cx={reverse ? sourceX : targetX} cy={reverse ? sourceY : targetY} r="7" className="ig-signal-timeout"/>}
  </g>
}