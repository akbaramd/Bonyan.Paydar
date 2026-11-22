import { Switch } from 'radix-ui'
import { useId } from 'react'

export function SwitchField({ label, hint, checked, onCheckedChange, disabled }: {
  label: string; hint?: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean
}) {
  const id = useId()
  return <div className="ig-choice-row">
    <div><label htmlFor={id}>{label}</label>{hint && <p>{hint}</p>}</div>
    <Switch.Root id={id} className="ig-switch" checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label}>
      <Switch.Thumb className="ig-switch-thumb"/>
    </Switch.Root>
  </div>
}
