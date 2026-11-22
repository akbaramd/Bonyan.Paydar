import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description, action }: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return <div className="ig-empty-state" role="status">
    <div className="ig-empty-state-icon" aria-hidden="true">{icon}</div>
    <h2>{title}</h2>
    <p>{description}</p>
    {action && <div className="ig-empty-state-action">{action}</div>}
  </div>
}
