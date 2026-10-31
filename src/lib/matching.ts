/**
 * FoodBridge Smart Matching — a transparent, deterministic scoring model.
 *
 * 1. Hard eligibility filters (safety-critical, never traded off against score):
 *    listing open & before deadline, pickup window still open, receiver verified,
 *    storage capability, handling capacity, within donor's pickup radius,
 *    demo/real isolation.
 * 2. Weighted score (0–100) for eligible pairs only:
 *    distance, expiry urgency, quantity fit, storage fit, pickup feasibility.
 *
 * The same hard constraints are enforced server-side in request_listing().
 */
import { formatKm, haversineKm } from './geo'
import { STORAGE_LABELS } from './constants'
import { effectiveStatus, minutesUntil } from './time'
import type { FoodListing, Organization } from './types'

export interface MatchWeights {
  distance: number
  urgency: number
  quantity: number
  storage: number
  feasibility: number
}

export const DEFAULT_WEIGHTS: MatchWeights = {
  distance: 0.35,
  urgency: 0.2,
  quantity: 0.2,
  storage: 0.1,
  feasibility: 0.15,
}

/** Urgency reaches its maximum when the pickup window closes within this many hours. */
export const URGENCY_HORIZON_HOURS = 12

export type MatchListing = Pick<
  FoodListing,
  | 'status'
  | 'safe_until'
  | 'pickup_start'
  | 'pickup_end'
  | 'storage_requirement'
  | 'estimated_meals'
  | 'latitude'
  | 'longitude'
  | 'max_radius_km'
  | 'is_demo'
>

export type MatchReceiver = Pick<
  Organization,
  'verification_status' | 'has_refrigeration' | 'has_freezer' | 'capacity_meals' | 'latitude' | 'longitude' | 'is_demo'
>

export interface MatchResult {
  eligible: boolean
  /** 0–100, only meaningful when eligible */
  score: number
  distanceKm: number | null
  blockers: string[]
  reasons: string[]
  components: Record<keyof MatchWeights, number>
  summary: string
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function storageCompatible(required: MatchListing['storage_requirement'], r: MatchReceiver): boolean {
  if (required === 'frozen') return r.has_freezer
  if (required === 'refrigerated') return r.has_refrigeration || r.has_freezer
  return true
}

export function evaluateMatch(
  listing: MatchListing,
  receiver: MatchReceiver,
  now: number = Date.now(),
  weights: MatchWeights = DEFAULT_WEIGHTS,
): MatchResult {
  const blockers: string[] = []
  const reasons: string[] = []
  const distanceKm = haversineKm(receiver, listing)
  const radius = Number(listing.max_radius_km)
  const meals = listing.estimated_meals
  const minutesToPickupEnd = minutesUntil(listing.pickup_end, now)

  // ---- Hard constraints -------------------------------------------------
  const status = effectiveStatus(listing, now)
  if (status === 'expired') blockers.push('Past its safe-use deadline')
  else if (status !== 'available') blockers.push('No longer open for requests')
  if (status === 'available' && minutesToPickupEnd <= 0) blockers.push('Pickup window has closed')
  if (listing.is_demo !== receiver.is_demo) blockers.push('Demo and real records cannot be matched')
  if (receiver.verification_status !== 'verified') blockers.push('Receiver is not yet verified')
  if (!storageCompatible(listing.storage_requirement, receiver)) {
    blockers.push(listing.storage_requirement === 'frozen' ? 'Freezer storage required' : 'Refrigerated storage required')
  }
  if (receiver.capacity_meals < meals) {
    blockers.push(`Needs capacity for ${meals} meals (has ${receiver.capacity_meals})`)
  }
  if (distanceKm != null && distanceKm > radius) {
    blockers.push(`${formatKm(distanceKm)} away — outside the ${radius} km pickup radius`)
  }

  // ---- Score components (0–1) ------------------------------------------
  const distance = distanceKm == null ? 0.5 : clamp01(1 - distanceKm / radius)
  const feasibility =
    minutesToPickupEnd <= 0 ? 0 : clamp01(minutesToPickupEnd / 60) // full marks with ≥ 60 min of window left
  // Urgency only helps when pickup is still feasible.
  const urgency = feasibility > 0 ? clamp01(1 - minutesToPickupEnd / 60 / URGENCY_HORIZON_HOURS) * feasibility : 0
  const quantity = receiver.capacity_meals > 0 ? clamp01(meals / (0.5 * receiver.capacity_meals)) : 0
  const storage = storageCompatible(listing.storage_requirement, receiver) ? 1 : 0

  const components = { distance, urgency, quantity, storage, feasibility }
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  const raw =
    (distance * weights.distance +
      urgency * weights.urgency +
      quantity * weights.quantity +
      storage * weights.storage +
      feasibility * weights.feasibility) /
    totalWeight
  const eligible = blockers.length === 0
  const score = eligible ? Math.round(raw * 100) : 0

  // ---- Explanation -----------------------------------------------------
  reasons.push(distanceKm == null ? 'distance unknown (no coordinates)' : `${formatKm(distanceKm)} away (straight-line)`)
  if (listing.storage_requirement !== 'ambient' && storage) {
    reasons.push(`${STORAGE_LABELS[listing.storage_requirement].toLowerCase()} storage available`)
  } else if (listing.storage_requirement === 'ambient') {
    reasons.push('no special storage needed')
  }
  if (feasibility >= 1) reasons.push('pickup window compatible')
  else if (feasibility > 0) reasons.push(`only ${Math.max(1, Math.round(minutesToPickupEnd))} min of pickup window left`)
  if (urgency >= 0.6) reasons.push('urgent — prioritised')
  if (receiver.capacity_meals >= meals) reasons.push(`fits capacity (${meals}/${receiver.capacity_meals} meals)`)

  const summary = eligible ? `${score}% match — ${reasons.join(', ')}.` : `Not eligible — ${blockers.join('; ')}.`

  return { eligible, score, distanceKm, blockers, reasons, components, summary }
}

export interface Ranked<T> {
  item: T
  match: MatchResult
}

/** Eligible first (highest score first), then ineligible (nearest first). */
export function rankMatches<T>(items: T[], evaluate: (item: T) => MatchResult): Ranked<T>[] {
  return items
    .map((item) => ({ item, match: evaluate(item) }))
    .sort((a, b) => {
      if (a.match.eligible !== b.match.eligible) return a.match.eligible ? -1 : 1
      if (a.match.eligible) return b.match.score - a.match.score
      return (a.match.distanceKm ?? Infinity) - (b.match.distanceKm ?? Infinity)
    })
}
