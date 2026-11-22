import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from 'radix-ui'
import { cn } from '../lib/cn'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', asChild = false, className, ...props }, ref
) {
  const classNames = cn('ig-button', `ig-button--${variant}`, `ig-button--${size}`, className)
  if (asChild) return <Slot.Root className={classNames} {...props} />
  return <button ref={ref} className={classNames} {...props} />
})
