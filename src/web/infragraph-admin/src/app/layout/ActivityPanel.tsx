import { Dialog, Tabs } from 'radix-ui'
import { Bell, BellOff, CircleHelp, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'

export function ActivityPanel() {
  return <Dialog.Root>
    <Dialog.Trigger asChild><Button size="icon" variant="ghost" aria-label="مرکز اعلان‌ها و رویدادها"><Bell size={18} aria-hidden="true" /></Button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="ig-dialog-overlay" />
      <Dialog.Content className="activity-drawer" aria-describedby="activity-description">
        <div className="activity-drawer-head"><div><Dialog.Title>مرکز اعلان‌ها</Dialog.Title><Dialog.Description id="activity-description">پیگیری وضعیت رویدادهای سامانه</Dialog.Description></div><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="بستن اعلان‌ها"><X size={18}/></Button></Dialog.Close></div>
        <Tabs.Root defaultValue="all" dir="rtl" className="activity-tabs">
          <Tabs.List className="activity-tabs-list" aria-label="نوع اعلان"><Tabs.Trigger value="all">همه رویدادها</Tabs.Trigger><Tabs.Trigger value="critical">بحرانی</Tabs.Trigger><Tabs.Trigger value="system">سیستمی</Tabs.Trigger></Tabs.List>
          <Tabs.Content value="all"><EmptyActivity/></Tabs.Content>
          <Tabs.Content value="critical"><EmptyActivity/></Tabs.Content>
          <Tabs.Content value="system"><EmptyActivity/></Tabs.Content>
        </Tabs.Root>
        <div className="activity-drawer-bottom"><CircleHelp size={15}/><Badge tone="unknown">بدون داده واقعی</Badge><span>منبع رویداد هنوز متصل نیست.</span></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

function EmptyActivity() {
  return <div className="activity-empty"><BellOff size={35} strokeWidth={1.4} aria-hidden="true"/><h3>اطلاعات اعلان‌ها هنوز موجود نیست</h3><p>تا زمان اتصال موتور رخدادها، خالی بودن این فهرست به معنی نبود هشدار در شبکه نیست.</p></div>
}
