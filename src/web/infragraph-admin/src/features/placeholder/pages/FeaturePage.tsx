import { CircleDotDashed } from 'lucide-react'
import { Badge } from '../../../shared/ui/Badge'

export default function FeaturePage({ title, description }: { title: string; description: string }) {
  return <div className="page"><div className="page-eyebrow">MODULE / UPCOMING</div><div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div><Badge tone="unknown">هنوز فعال نیست</Badge></div>
    <div className="surface-card placeholder-card"><CircleDotDashed size={38} aria-hidden="true" /><h2>اطلاعات عملیاتی هنوز موجود نیست</h2><p>این بخش طبق معماری مصوب و پس از تکمیل دسترسی امن و ذخیره‌سازی واقعی فعال می‌شود.</p></div>
  </div>
}
