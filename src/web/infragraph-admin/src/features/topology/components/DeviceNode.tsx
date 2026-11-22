import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Device } from '../model/topology'
import { kindNames } from '../model/device-labels'
import { stateLabels } from '../model/topology'
import { DeviceGlyph } from './DeviceGlyph'


/** An icon-first NOC symbol, not a card: kind, identity and state are always visible. */
export function DeviceNode({ data, selected }: NodeProps) {
  const device = data.device as Device
  const horizontal = data.orientation === 'LR'
  const affected = Number(data.affected ?? 0)
  const typeName = (device.controlPlane || device.role === 'collector') ? 'سرور مرکزی' : kindNames[device.kind]
  return <div dir="rtl"
    className={`network-node network-node--${device.state} network-node--${device.kind}${device.controlPlane || device.role === 'collector' ? ' network-node--control' : ''}${!horizontal ? ' network-node--vertical' : ''}${selected ? ' network-node--selected' : ''}${data.dimmed ? ' network-node--dimmed' : ''}${data.inRoute ? ' network-node--route' : ''}${data.probePhase ? ` network-node--probe-${data.probePhase}` : ''}`}
    title={`${typeName}: ${device.name} — ${stateLabels[device.state]}`}
    aria-label={`${typeName} ${device.name}؛ ${stateLabels[device.state]}${affected ? `؛ ${affected} کامپیوتر پایین‌دست نامشخص` : ''}`}
    data-testid={`node-${device.id}`}>
    <Handle type="target" position={horizontal ? Position.Left : Position.Top} isConnectable={false}/>
    <div className="ig-node-figure">
      <DeviceGlyph kind={device.kind} controlPlane={device.controlPlane || device.role === 'collector'}/>
      <span className={`ig-node-state ig-node-state--${device.state}`} aria-hidden="true"/>
      {affected > 0 && device.state === 'critical' && <span className="ig-node-impact" aria-label={`${affected} کامپیوتر با وضعیت نامشخص`}>{affected}↓</span>}
    </div>
    <span className="ig-node-kind">{typeName}</span>
    <strong className="ig-node-name" dir="ltr">{device.name}</strong>
    {device.state !== 'healthy' && <span className={`ig-node-state-label ig-node-state-label--${device.state}`}>{stateLabels[device.state]}</span>}
    <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} isConnectable={false}/>
  </div>
}