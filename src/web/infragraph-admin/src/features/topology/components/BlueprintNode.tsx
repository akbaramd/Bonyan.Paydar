import type { NodeProps } from '@xyflow/react'

/** Render an operator-imported, sanitized SVG as a transformable visual underlay. */
export function BlueprintNode({ data }: NodeProps) {
  const url = data.url
  if (typeof url !== 'string') return null
  return <div className="blueprint-node" aria-hidden="true"><img alt="" draggable={false} src={url} /></div>
}
