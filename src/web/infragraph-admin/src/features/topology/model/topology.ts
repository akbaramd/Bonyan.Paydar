import type { Edge, Node } from '@xyflow/react'

export type DeviceState = 'healthy' | 'warning' | 'critical' | 'unknown'
export type DeviceKind = 'internet' | 'firewall' | 'router' | 'switch' | 'server' | 'workstation' | 'wireless' | 'subnet' | 'unknown'

export type Device = {
  id: string
  name: string
  title: string
  kind: DeviceKind
  controlPlane?: boolean
  role?: 'collector'
  state: DeviceState
  address: string
  site: string
  vendor: string
  port: string
  description: string
  evidence: string
}

export type TopologyDataset = {
  origin: 'synthetic' | 'live' | 'reported'
  observedAt: string | null
  devices: readonly Device[]
  nodes: Node[]
  edges: Edge[]
}

export const stateLabels: Record<DeviceState, string> = {
  healthy: 'سالم',
  warning: 'نیازمند بررسی',
  critical: 'قطع ارتباط',
  unknown: 'نامشخص',
}

export function countStates(list: readonly Device[]) {
  return {
    total: list.length,
    critical: list.filter((device) => device.state === 'critical').length,
    warning: list.filter((device) => device.state === 'warning').length,
    unknown: list.filter((device) => device.state === 'unknown').length,
  }
}