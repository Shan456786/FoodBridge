import { beforeEach, describe, expect, it } from 'vitest'
import * as api from './api.offline'

const as = (email: string) => api.offlineSignIn(email)
const DONOR = 'demo.donor@foodbridge.test'
const RECEIVER = 'demo.receiver@foodbridge.test'
const VOLUNTEER = 'demo.volunteer@foodbridge.test'

describe('offline demo backend', () => {
  beforeEach(() => {
    localStorage.clear()
    api.resetOfflineDemo()
  })

  it('runs the full simulated rescue and updates demo impact', async () => {
    as(RECEIVER)
    const before = await api.getImpactStats('platform')
    const listing = (await api.fetchAvailableListings()).find((l) => l.title === 'Veg Biryani & Raita')!
    const requestId = await api.requestListing(listing.id, 'On our way')

    as(DONOR)
    const res = await api.respondToRequest(requestId, true)
    expect(res.status).toBe('accepted')

    as(RECEIVER)
    await api.assignVolunteer(res.pickup_id!, 'user-volunteer')

    as(DONOR)
    const { code } = await api.generateHandoverCode(res.pickup_id!)

    as(VOLUNTEER)
    const wrong = await api.verifyHandoverCode(res.pickup_id!, code === '000000' ? '111111' : '000000')
    expect(wrong).toMatchObject({ ok: false, attempts_remaining: 4 })
    expect((await api.verifyHandoverCode(res.pickup_id!, code)).ok).toBe(true)
    expect((await api.verifyHandoverCode(res.pickup_id!, code)).reason).toBe('already_completed')

    as(RECEIVER)
    await api.confirmReceipt(res.pickup_id!)
    const after = await api.getImpactStats('platform')
    expect(after.verified_meals - before.verified_meals).toBe(listing.estimated_meals)
    expect(after.demo_listings).toBe(after.total_listings)
  })

  it('enforces matching hard constraints and role permissions', async () => {
    as(RECEIVER) // Community Food Collective: fridge, no freezer, capacity 250
    const open = await api.fetchAvailableListings()
    const frozen = open.find((l) => l.title === 'Frozen Parathas')!
    await expect(api.requestListing(frozen.id, '')).rejects.toThrow(/Freezer storage required/)
    const buffet = open.find((l) => l.title === 'Wedding Buffet Surplus')!
    await expect(api.requestListing(buffet.id, '')).rejects.toThrow(/capacity/)
    expect(open.some((l) => l.title === 'Mixed Veg Curry')).toBe(false) // expired: not listed
    const idliReq = (await api.fetchRequests()).find((r) => r.status === 'pending')!
    await expect(api.respondToRequest(idliReq.id, true)).rejects.toThrow(/Only the donor/)
  })
})
