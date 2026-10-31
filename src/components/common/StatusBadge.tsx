import { Clock, FlaskConical, ShieldAlert, ShieldCheck } from 'lucide-react'
import { LISTING_STATUS_LABELS, PICKUP_STATUS_LABELS, REQUEST_STATUS_LABELS } from '@/lib/constants'
import { formatRemaining, urgencyFor } from '@/lib/time'
import type { ListingStatus, PickupStatus, RequestStatus, VerificationStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tone = 'green' | 'emerald' | 'amber' | 'red' | 'gray' | 'blue' | 'forest'

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  emerald: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  forest: 'bg-forest text-white ring-brand',
}

export function Pill({ tone = 'gray', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&>svg]:size-3.5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const LISTING_TONE: Record<ListingStatus, Tone> = {
  available: 'green',
  reserved: 'blue',
  collected: 'emerald',
  completed: 'forest',
  expired: 'gray',
  cancelled: 'gray',
  removed: 'red',
}
export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return <Pill tone={LISTING_TONE[status]}>{LISTING_STATUS_LABELS[status]}</Pill>
}

const REQUEST_TONE: Record<RequestStatus, Tone> = { pending: 'amber', accepted: 'green', rejected: 'red', cancelled: 'gray' }
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <Pill tone={REQUEST_TONE[status]}>{REQUEST_STATUS_LABELS[status]}</Pill>
}

const PICKUP_TONE: Record<PickupStatus, Tone> = {
  scheduled: 'amber',
  assigned: 'blue',
  en_route: 'blue',
  arrived: 'blue',
  collected: 'emerald',
  verified: 'forest',
  cancelled: 'gray',
  expired: 'gray',
}
export function PickupStatusBadge({ status }: { status: PickupStatus }) {
  return <Pill tone={PICKUP_TONE[status]}>{PICKUP_STATUS_LABELS[status]}</Pill>
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === 'verified')
    return (
      <Pill tone="green">
        <ShieldCheck /> Verified
      </Pill>
    )
  if (status === 'rejected')
    return (
      <Pill tone="red">
        <ShieldAlert /> Not verified
      </Pill>
    )
  return (
    <Pill tone="amber">
      <ShieldAlert /> Pending verification
    </Pill>
  )
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Pill tone="gray" className={cn('border border-dashed border-slate-300 ring-0', className)}>
      <FlaskConical /> Demo
    </Pill>
  )
}

const URGENCY_TONE = { safe: 'green', soon: 'amber', urgent: 'red', expired: 'gray' } as const

export function CountdownBadge({ deadline, now, className }: { deadline: string; now: number; className?: string }) {
  const u = urgencyFor(deadline, now)
  return (
    <Pill tone={URGENCY_TONE[u]} className={cn('tabular', u === 'urgent' && 'animate-pulse [animation-duration:2.5s]', className)}>
      <Clock />
      {formatRemaining(deadline, now)}
    </Pill>
  )
}
