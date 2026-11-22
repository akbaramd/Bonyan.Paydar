import { Checkbox } from 'radix-ui'
import { Check } from 'lucide-react'
import { useId } from 'react'

export function CheckboxField({ label, checked, onCheckedChange, disabled }: {
  label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean
}) {
  const id = useId()
  return <div className="ig-checkbox-row">
    <Checkbox.Root id={id} className="ig-checkbox" checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} aria-label={label}>
      <Checkbox.Indicator><Check size={13} strokeWidth={2.8}/></Checkbox.Indicator>
    </Checkbox.Root>
    <label htmlFor={id}>{label}</label>
  </div>
}
