import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  trailing?: React.ReactNode
}

export function TextField({ label, hint, error, trailing, id: suppliedId, className, ...inputProps }: TextFieldProps) {
  const autoId = useId()
  const id = suppliedId || autoId
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return <div className={cn('ig-form-field', className)}>
    <label htmlFor={id} className="ig-form-label">{label}</label>
    <div className="ig-input-shell">
      <input {...inputProps} id={id} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : hint ? hintId : undefined} />
      {trailing && <span className="ig-input-trailing">{trailing}</span>}
    </div>
    {hint && !error && <p id={hintId} className="ig-form-hint">{hint}</p>}
    {error && <p id={errorId} className="ig-form-error" role="alert">{error}</p>}
  </div>
}
