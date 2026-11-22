import type { DeviceKind } from './topology'

export const kindNames: Record<DeviceKind, string> = {
  internet: 'اینترنت',
  firewall: 'فایروال',
  router: 'روتر',
  switch: 'سوئیچ شبکه',
  server: 'سرور',
  workstation: 'رایانه کاربر',
  wireless: 'اکسس‌پوینت',
  subnet: 'سگمنت منطقی IP',
  unknown: 'نوع نامشخص',
}