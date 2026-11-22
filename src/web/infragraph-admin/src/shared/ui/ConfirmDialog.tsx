import { AlertDialog } from 'radix-ui'
import { TriangleAlert } from 'lucide-react'
import { Button } from './Button'
import type { ReactNode } from 'react'

export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, destructive = false }: {
  trigger: ReactNode
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
}) {
  return <AlertDialog.Root>
    <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="ig-dialog-overlay"/>
      <AlertDialog.Content className="ig-confirm-dialog">
        <div className="ig-confirm-icon"><TriangleAlert size={20} aria-hidden="true"/></div>
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description>{description}</AlertDialog.Description>
        <div className="ig-confirm-actions">
          <AlertDialog.Cancel asChild><Button variant="secondary">انصراف</Button></AlertDialog.Cancel>
          <AlertDialog.Action asChild><Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button></AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
}
