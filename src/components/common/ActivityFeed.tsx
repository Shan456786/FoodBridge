import { Link } from 'react-router-dom'
import { format, formatDistanceToNowStrict } from 'date-fns'
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock,
  KeyRound,
  PencilLine,
  ShieldCheck,
  Truck,
  UserPlus,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { AuditEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

export const AUDIT_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  listing_created: { label: 'Listing created', icon: ClipboardList, tone: 'text-emerald-600 bg-emerald-50' },
  listing_updated: { label: 'Listing updated', icon: PencilLine, tone: 'text-slate-600 bg-slate-100' },
  listing_cancelled: { label: 'Listing cancelled', icon: Ban, tone: 'text-slate-600 bg-slate-100' },
  listing_expired: { label: 'Listing expired', icon: Clock, tone: 'text-slate-500 bg-slate-100' },
  listing_removed: { label: 'Listing removed by moderator', icon: XCircle, tone: 'text-red-600 bg-red-50' },
  request_submitted: { label: 'Request submitted', icon: CircleDot, tone: 'text-amber-600 bg-amber-50' },
  request_accepted: { label: 'Request accepted', icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
  request_rejected: { label: 'Request declined', icon: XCircle, tone: 'text-red-600 bg-red-50' },
  request_cancelled: { label: 'Request withdrawn', icon: Ban, tone: 'text-slate-600 bg-slate-100' },
  pickup_assigned: { label: 'Volunteer assignment changed', icon: UserPlus, tone: 'text-sky-600 bg-sky-50' },
  pickup_status_updated: { label: 'Pickup progress updated', icon: Truck, tone: 'text-sky-600 bg-sky-50' },
  handover_code_generated: { label: 'Handover code generated', icon: KeyRound, tone: 'text-brand bg-forest-50' },
  handover_verification_failed: { label: 'Incorrect handover code entered', icon: XCircle, tone: 'text-amber-700 bg-amber-50' },
  collection_recorded: { label: 'Collection verified by code', icon: BadgeCheck, tone: 'text-emerald-600 bg-emerald-50' },
  verification_completed: { label: 'Receipt confirmed — rescue verified', icon: ShieldCheck, tone: 'text-white bg-forest' },
  organization_verified: { label: 'Organization verified', icon: ShieldCheck, tone: 'text-emerald-600 bg-emerald-50' },
  organization_rejected: { label: 'Organization verification declined', icon: XCircle, tone: 'text-red-600 bg-red-50' },
  organization_pending: { label: 'Organization verification reset', icon: CircleDot, tone: 'text-amber-600 bg-amber-50' },
}

export function describeEvent(e: AuditEvent) {
  const meta = AUDIT_META[e.action] ?? { label: e.action.replace(/_/g, ' '), icon: CircleDot, tone: 'text-slate-600 bg-slate-100' }
  const m = e.metadata ?? {}
  const detail =
    (typeof m.title === 'string' && m.title) ||
    (typeof m.receiver_org === 'string' && m.receiver_org) ||
    (typeof m.name === 'string' && m.name) ||
    (typeof m.status === 'string' && m.status.replace('_', ' ')) ||
    (typeof m.reason === 'string' && m.reason) ||
    ''
  return { ...meta, detail }
}

export function ActivityFeed({ events, compact = false, linkListings = true }: { events: AuditEvent[]; compact?: boolean; linkListings?: boolean }) {
  return (
    <ol className="space-y-0">
      {events.map((e, i) => {
        const d = describeEvent(e)
        const body = (
          <>
            <span className="block text-sm font-medium text-ink">{d.label}</span>
            {d.detail && <span className="block truncate text-xs text-muted-foreground">{d.detail}</span>}
          </>
        )
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 && <span className="absolute top-8 left-[15px] h-[calc(100%-1.5rem)] w-px bg-border" />}
            <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full', d.tone)}>
              <d.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              {linkListings && e.listing_id ? (
                <Link to={`/listings/${e.listing_id}`} className="block hover:underline">
                  {body}
                </Link>
              ) : (
                body
              )}
              <span className="text-[0.7rem] text-slate-400" title={format(new Date(e.created_at), 'PPpp')}>
                {compact
                  ? formatDistanceToNowStrict(new Date(e.created_at), { addSuffix: true })
                  : format(new Date(e.created_at), 'd MMM yyyy, HH:mm')}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
