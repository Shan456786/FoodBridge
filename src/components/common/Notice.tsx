import { CheckCircle2, CloudOff, HardDrive, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONES = {
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-900 [&_svg]:text-sky-600' },
  warning: { icon: TriangleAlert, className: 'border-amber-200 bg-amber-50 text-amber-950 [&_svg]:text-amber-600' },
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-900 [&_svg]:text-emerald-600' },
  offline: { icon: CloudOff, className: 'border-amber-200 bg-amber-50 text-amber-950 [&_svg]:text-amber-600' },
  local: { icon: HardDrive, className: 'border-border bg-muted/60 text-muted-foreground [&_svg]:text-muted-foreground' },
} as const

/** Inline callout for explanations such as "stored on this device" or "needs Supabase". */
export function Notice({
  tone = 'info',
  title,
  icon,
  className,
  children,
}: {
  tone?: keyof typeof TONES
  title?: React.ReactNode
  icon?: LucideIcon
  className?: string
  children?: React.ReactNode
}) {
  const t = TONES[tone]
  const Icon = icon ?? t.icon
  return (
    <div role="note" className={cn('flex gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed', t.className, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}
