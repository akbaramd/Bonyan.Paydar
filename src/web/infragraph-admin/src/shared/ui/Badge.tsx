import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'unknown' | 'info'

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('ig-badge', `ig-badge--${tone}`, className)} {...props} />
}
