import { describe, expect, it } from 'vitest'
import { haversineKm } from './geo'
import { evaluateMatch, rankMatches, storageCompatible, type MatchListing, type MatchReceiver } from './matching'
import { effectiveStatus, formatRemaining, isRequestable, urgencyFor } from './time'

const NOW = Date.parse('2026-10-27T10:00:00Z')
const at = (mins: number) => new Date(NOW + mins * 60000).toISOString()

const listing = (o: Partial<MatchListing> = {}): MatchListing => ({
  status: 'available',
  safe_until: at(240),
  pickup_start: at(0),
  pickup_end: at(180),
  storage_requirement: 'ambient',
  estimated_meals: 40,
  latitude: 16.4963, // VIT-AP
  longitude: 80.4994,
  max_radius_km: 15,
  is_demo: false,
  ...o,
})

const receiver = (o: Partial<MatchReceiver> = {}): MatchReceiver => ({
  verification_status: 'verified',
  has_refrigeration: true,
  has_freezer: false,
  capacity_meals: 250,
  latitude: 16.485, // Undavalli
  longitude: 80.59,
  is_demo: false,
  ...o,
})

describe('haversine distance', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ latitude: 16.5, longitude: 80.6 }, { latitude: 16.5, longitude: 80.6 })).toBe(0)
  })
  it('matches a known reference distance (London–Paris ≈ 343.5 km)', () => {
    const d = haversineKm({ latitude: 51.5074, longitude: -0.1278 }, { latitude: 48.8566, longitude: 2.3522 })!
    expect(d).toBeGreaterThan(342)
    expect(d).toBeLessThan(345)
  })
  it('computes VIT-AP to Undavalli at roughly 9.8 km', () => {
    const d = haversineKm({ latitude: 16.4963, longitude: 80.4994 }, { latitude: 16.485, longitude: 80.59 })!
    expect(d).toBeGreaterThan(9)
    expect(d).toBeLessThan(10.5)
  })
  it('returns null when coordinates are missing', () => {
    expect(haversineKm({ latitude: null, longitude: 80 }, { latitude: 16, longitude: 80 })).toBeNull()
  })
})

describe('hard eligibility constraints', () => {
  it('accepts a compatible pair and explains the score', () => {
    const m = evaluateMatch(listing(), receiver(), NOW)
    expect(m.eligible).toBe(true)
    expect(m.score).toBeGreaterThan(0)
    expect(m.score).toBeLessThanOrEqual(100)
    expect(m.summary).toMatch(/^\d+% match — .*km away \(straight-line\).*pickup window compatible/)
  })

  it('storage compatibility is a hard filter', () => {
    expect(storageCompatible('frozen', receiver())).toBe(false)
    expect(storageCompatible('refrigerated', receiver({ has_refrigeration: false, has_freezer: true }))).toBe(true)
    const m = evaluateMatch(listing({ storage_requirement: 'frozen' }), receiver(), NOW)
    expect(m.eligible).toBe(false)
    expect(m.score).toBe(0)
    expect(m.blockers).toContain('Freezer storage required')
    const fridge = evaluateMatch(listing({ storage_requirement: 'refrigerated' }), receiver({ has_refrigeration: false }), NOW)
    expect(fridge.blockers).toContain('Refrigerated storage required')
  })

  it('quantity must fit declared capacity', () => {
    const m = evaluateMatch(listing({ estimated_meals: 300 }), receiver({ capacity_meals: 250 }), NOW)
    expect(m.eligible).toBe(false)
    expect(m.blockers[0]).toMatch(/capacity for 300 meals/)
  })

  it('excludes expired listings and closed pickup windows', () => {
    const expired = evaluateMatch(listing({ safe_until: at(-1), pickup_end: at(-2), pickup_start: at(-60) }), receiver(), NOW)
    expect(expired.eligible).toBe(false)
    expect(expired.blockers).toContain('Past its safe-use deadline')
    const closed = evaluateMatch(listing({ pickup_end: at(-5), pickup_start: at(-60) }), receiver(), NOW)
    expect(closed.blockers).toContain('Pickup window has closed')
  })

  it('excludes receivers outside the pickup radius and unverified receivers', () => {
    const far = evaluateMatch(listing({ max_radius_km: 5 }), receiver(), NOW)
    expect(far.eligible).toBe(false)
    expect(far.blockers[0]).toMatch(/outside the 5 km pickup radius/)
    expect(evaluateMatch(listing(), receiver({ verification_status: 'pending' }), NOW).eligible).toBe(false)
  })

  it('keeps demo and real records apart', () => {
    expect(evaluateMatch(listing({ is_demo: true }), receiver(), NOW).eligible).toBe(false)
  })
})

describe('ranking', () => {
  it('closer receivers score higher, all else equal', () => {
    const near = evaluateMatch(listing(), receiver({ latitude: 16.4963, longitude: 80.51 }), NOW)
    const far = evaluateMatch(listing(), receiver(), NOW)
    expect(near.score).toBeGreaterThan(far.score)
  })

  it('urgency raises priority only while pickup is feasible', () => {
    const relaxed = evaluateMatch(listing({ pickup_end: at(600), safe_until: at(700) }), receiver(), NOW)
    const urgent = evaluateMatch(listing({ pickup_end: at(90), safe_until: at(100) }), receiver(), NOW)
    expect(urgent.components.urgency).toBeGreaterThan(relaxed.components.urgency)
    const closed = evaluateMatch(listing({ pickup_end: at(-1), pickup_start: at(-30) }), receiver(), NOW)
    expect(closed.components.urgency).toBe(0)
  })

  it('sorts eligible matches first by score', () => {
    const ranked = rankMatches(
      [receiver({ capacity_meals: 10 }), receiver(), receiver({ latitude: 16.4963, longitude: 80.51 })],
      (r) => evaluateMatch(listing(), r, NOW),
    )
    expect(ranked.map((r) => r.match.eligible)).toEqual([true, true, false])
    expect(ranked[0].match.score).toBeGreaterThanOrEqual(ranked[1].match.score)
  })
})

describe('countdowns', () => {
  it('formats remaining time', () => {
    expect(formatRemaining(at(155), NOW)).toBe('2h 35m remaining')
    expect(formatRemaining(at(45), NOW)).toBe('45m remaining')
    expect(formatRemaining(at(-1), NOW)).toBe('Expired')
    expect(formatRemaining(at(60 * 26), NOW)).toBe('1d 2h remaining')
  })
  it('derives urgency bands from the persisted deadline', () => {
    expect(urgencyFor(at(400), NOW)).toBe('safe')
    expect(urgencyFor(at(120), NOW)).toBe('soon')
    expect(urgencyFor(at(30), NOW)).toBe('urgent')
    expect(urgencyFor(at(0), NOW)).toBe('expired')
  })
  it('treats unsynchronised overdue listings as expired and unrequestable', () => {
    const l = { status: 'available' as const, safe_until: at(-1), pickup_end: at(-2) }
    expect(effectiveStatus(l, NOW)).toBe('expired')
    expect(isRequestable(l, NOW)).toBe(false)
    expect(isRequestable({ status: 'available', safe_until: at(100), pickup_end: at(60) }, NOW)).toBe(true)
  })
})
