import type { FoodListing, ListingStatus } from './types'

export type Urgency = 'safe' | 'soon' | 'urgent' | 'expired'

/** Thresholds (minutes remaining until the safe-use deadline). */
export const URGENCY_THRESHOLDS = { urgent: 60, soon: 180 }

export function minutesUntil(iso: string, now: number = Date.now()): number {
  return (new Date(iso).getTime() - now) / 60000
}

export function urgencyFor(deadlineIso: string, now: number = Date.now()): Urgency {
  const m = minutesUntil(deadlineIso, now)
  if (m <= 0) return 'expired'
  if (m <= URGENCY_THRESHOLDS.urgent) return 'urgent'
  if (m <= URGENCY_THRESHOLDS.soon) return 'soon'
  return 'safe'
}

/** "2h 35m remaining", "45m remaining", "3d 4h remaining", "Expired". */
export function formatRemaining(deadlineIso: string, now: number = Date.now()): string {
  const totalMin = Math.floor(minutesUntil(deadlineIso, now))
  if (totalMin <= 0) return 'Expired'
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h remaining`
  if (h > 0) return `${h}h ${m}m remaining`
  return `${Math.max(m, 1)}m remaining`
}

/**
 * Status as users should see it. A listing past its deadline is treated as
 * expired even if the database row has not been synchronised yet.
 */
export function effectiveStatus(l: Pick<FoodListing, 'status' | 'safe_until'>, now: number = Date.now()): ListingStatus {
  if ((l.status === 'available' || l.status === 'reserved') && new Date(l.safe_until).getTime() <= now) return 'expired'
  return l.status
}

export function isRequestable(l: Pick<FoodListing, 'status' | 'safe_until' | 'pickup_end'>, now: number = Date.now()) {
  return effectiveStatus(l, now) === 'available' && new Date(l.pickup_end).getTime() > now
}

/** For <input type="datetime-local"> — local wall-clock time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse a datetime-local value (local time) into a UTC ISO string. */
export function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}
