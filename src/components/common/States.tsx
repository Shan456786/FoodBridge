import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-forest-50/70" aria-hidden="true" />
        <div className="relative flex size-12 items-center justify-center rounded-full bg-forest-50 text-brand ring-1 ring-forest-100">
          <Icon className="size-6" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/60 px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="size-5 text-red-600" />
      </div>
      <p className="text-sm font-semibold text-red-800">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm text-red-700/80">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  )
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-5 h-14 w-full" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-card">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.65rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: LucideIcon
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 shadow-card transition-shadow hover:shadow-md',
        accent ? 'border-transparent bg-forest text-white' : 'bg-card',
      )}
    >
      {accent && <div className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-emerald-brand/20 blur-2xl" aria-hidden="true" />}
      <div className="relative flex items-start justify-between gap-2">
        <p className={cn('text-xs font-medium tracking-wide uppercase', accent ? 'text-mint-100/80' : 'text-muted-foreground')}>
          {label}
        </p>
        <div
          className={cn(
            'flex size-8 items-center justify-center rounded-lg',
            accent ? 'bg-white/10 text-emerald-300' : 'bg-forest-50 text-brand',
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <p className="tabular relative mt-2 text-[1.65rem] leading-tight font-semibold tracking-tight">{value}</p>
      {hint && <p className={cn('relative mt-1 text-xs', accent ? 'text-mint-100/70' : 'text-muted-foreground')}>{hint}</p>}
    </div>
  )
}
