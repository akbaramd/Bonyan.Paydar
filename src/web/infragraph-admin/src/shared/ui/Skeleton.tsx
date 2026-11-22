import { cn } from '../lib/cn'

export function Skeleton({ className, width = '100%', height = 16 }: {
  className?: string; width?: string | number; height?: string | number
}) {
  return <span aria-hidden="true" className={cn('ig-skeleton', className)} style={{ width, height }}/>
}

export function PageSkeleton() {
  return <div className="ig-page-skeleton" role="status" aria-live="polite" aria-label="در حال بارگذاری صفحه">
    <span className="visually-hidden">در حال بارگذاری صفحه</span>
    <Skeleton width={240} height={26}/><Skeleton width="56%" height={14}/>
    <div className="ig-skeleton-metrics">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={110}/>)}</div>
    <Skeleton height={360}/>
  </div>
}
