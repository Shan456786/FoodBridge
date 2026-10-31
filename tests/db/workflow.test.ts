// @vitest-environment node
// End-to-end database tests: RLS, privileges and the rescue state machine,
// executed against real Postgres (PGlite) with the actual migrations.
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, expectDbError, type Db } from './harness'

let db: Db
let donorA: string, donorB: string, receiver: string, receiver2: string, unverified: string
let farReceiver: string, volunteer: string, stranger: string, adminUser: string
let donorAOrg: string, receiverOrg: string

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

async function createListing(as: string, orgId: string, overrides: Record<string, unknown> = {}) {
  await db.asUser(as)
  const v = {
    title: 'Veg Biryani',
    category: 'cooked_meals',
    diet: 'veg',
    quantity: 40,
    quantity_unit: 'portions',
    estimated_meals: 40,
    safe_until: hours(4),
    pickup_start: hours(0),
    pickup_end: hours(3),
    storage_requirement: 'ambient',
    pickup_address: 'Campus canteen',
    latitude: 16.4963,
    longitude: 80.4994,
    max_radius_km: 15,
    handling_confirmed: true,
    ...overrides,
  }
  const r = await db.one<{ id: string }>(
    `insert into food_listings (donor_org_id, title, category, diet, quantity, quantity_unit, estimated_meals,
       safe_until, pickup_start, pickup_end, storage_requirement, pickup_address, latitude, longitude,
       max_radius_km, handling_confirmed)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
    [orgId, v.title, v.category, v.diet, v.quantity, v.quantity_unit, v.estimated_meals, v.safe_until,
      v.pickup_start, v.pickup_end, v.storage_requirement, v.pickup_address, v.latitude, v.longitude,
      v.max_radius_km, v.handling_confirmed],
  )
  return r.id
}

async function rpc<T = unknown>(as: string | null, fn: string, args: unknown[] = []) {
  await db.asUser(as)
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ')
  const r = await db.one<{ result: T }>(`select ${fn}(${placeholders}) as result`, args)
  return r.result
}

beforeAll(async () => {
  db = await createDb()
  const recv = (name: string, extra: Record<string, unknown> = {}) => ({
    role: 'receiver', full_name: name, org_name: `${name} Org`, org_type: 'ngo',
    latitude: 16.485, longitude: 80.59, has_refrigeration: 'true', has_freezer: 'false', capacity_meals: 250, ...extra,
  })
  donorA = await db.createUser('a@x.test', { role: 'donor', full_name: 'Donor A', org_name: 'Canteen A', org_type: 'canteen', latitude: 16.4963, longitude: 80.4994 })
  donorB = await db.createUser('b@x.test', { role: 'donor', full_name: 'Donor B', org_name: 'Kitchen B', org_type: 'restaurant', latitude: 16.4996, longitude: 80.656 })
  receiver = await db.createUser('r@x.test', recv('Receiver'))
  receiver2 = await db.createUser('r2@x.test', recv('Receiver Two', { has_freezer: 'true', capacity_meals: 500 }))
  unverified = await db.createUser('u@x.test', recv('Unverified'))
  farReceiver = await db.createUser('far@x.test', recv('Far', { latitude: 16.3067, longitude: 80.4365 }))
  volunteer = await db.createUser('v@x.test', { role: 'volunteer', full_name: 'Vol' })
  stranger = await db.createUser('s@x.test', recv('Stranger'))
  adminUser = await db.createUser('admin@x.test', { role: 'volunteer', full_name: 'Admin' })
  // Admins are promoted out-of-band (SQL editor as postgres), never via the API.
  await db.admin(`update profiles set role = 'admin' where id = $1`, [adminUser])

  donorAOrg = (await db.admin<{ organization_id: string }>(`select organization_id from profiles where id=$1`, [donorA]))[0].organization_id
  receiverOrg = (await db.admin<{ organization_id: string }>(`select organization_id from profiles where id=$1`, [receiver]))[0].organization_id

  for (const u of [receiver, receiver2, farReceiver, stranger]) {
    const org = (await db.admin<{ organization_id: string }>(`select organization_id from profiles where id=$1`, [u]))[0].organization_id
    await rpc(adminUser, 'admin_set_org_verification', [org, 'verified', null])
  }
})

describe('authentication & roles', () => {
  it('signup creates a profile and an owned organization', async () => {
    const p = await db.admin<{ role: string; organization_id: string }>(`select role, organization_id from profiles where id=$1`, [donorA])
    expect(p[0].role).toBe('donor')
    expect(p[0].organization_id).toBeTruthy()
    const m = await db.admin(`select member_role from organization_members where user_id=$1`, [donorA])
    expect(m[0].member_role).toBe('owner')
  })

  it('signing up with role=admin is coerced to volunteer', async () => {
    const id = await db.createUser('sneaky@x.test', { role: 'admin', full_name: 'Sneaky' })
    const p = await db.admin<{ role: string }>(`select role from profiles where id=$1`, [id])
    expect(p[0].role).toBe('volunteer')
  })

  it('an ordinary user cannot make themselves admin', async () => {
    await db.asUser(donorA)
    await expectDbError(db.q(`update profiles set role='admin' where id=$1`, [donorA]), /permission denied/)
    await expectDbError(db.q(`update organizations set verification_status='verified' where id=$1`, [donorAOrg]), /permission denied/)
    // allowed column
    await db.q(`update profiles set full_name='Donor A Updated' where id=$1`, [donorA])
    const p = await db.admin<{ role: string; full_name: string }>(`select role, full_name from profiles where id=$1`, [donorA])
    expect(p[0]).toEqual({ role: 'donor', full_name: 'Donor A Updated' })
  })

  it('non-admins cannot call admin RPCs', async () => {
    await expectDbError(rpc(donorA, 'admin_set_org_verification', [donorAOrg, 'verified', null]), /Administrator access required/)
  })

  it('anonymous users cannot call workflow RPCs', async () => {
    await expectDbError(rpc(null, 'get_impact_stats', ['platform']), /permission denied/)
  })
})

describe('listings', () => {
  it('donor can create and edit an eligible listing', async () => {
    const id = await createListing(donorA, donorAOrg)
    await db.asUser(donorA)
    await db.q(`update food_listings set title='Veg Biryani (updated)' where id=$1`, [id])
    const l = await db.admin<{ title: string; status: string; created_by: string }>(`select title, status, created_by from food_listings where id=$1`, [id])
    expect(l[0]).toMatchObject({ title: 'Veg Biryani (updated)', status: 'available', created_by: donorA })
    const audit = await db.admin(`select action from audit_events where listing_id=$1 order by id`, [id])
    expect(audit.map((a) => a.action)).toEqual(['listing_created', 'listing_updated'])
  })

  it('rejects pickup windows beyond the safe-use deadline, past deadlines and negative quantities', async () => {
    await expectDbError(createListing(donorA, donorAOrg, { pickup_end: hours(5), safe_until: hours(4) }), /pickup_within_safe_deadline|cannot extend beyond/)
    await expectDbError(createListing(donorA, donorAOrg, { safe_until: hours(-1), pickup_start: hours(-3), pickup_end: hours(-2) }), /future/)
    await expectDbError(createListing(donorA, donorAOrg, { quantity: -5 }), /check constraint/)
    await expectDbError(createListing(donorA, donorAOrg, { handling_confirmed: false }), /check constraint/)
  })

  it('a donor cannot create listings for, or edit, another donor organization', async () => {
    const id = await createListing(donorA, donorAOrg)
    await expectDbError(createListing(donorB, donorAOrg), /row-level security/)
    await db.asUser(donorB)
    await db.q(`update food_listings set title='hijacked' where id=$1`, [id])
    const l = await db.admin<{ title: string }>(`select title from food_listings where id=$1`, [id])
    expect(l[0].title).toBe('Veg Biryani')
  })

  it('receivers cannot create listings, and clients cannot set status directly', async () => {
    await expectDbError(createListing(receiver, receiverOrg), /row-level security/)
    const id = await createListing(donorA, donorAOrg)
    await db.asUser(donorA)
    await expectDbError(db.q(`update food_listings set status='completed' where id=$1`, [id]), /permission denied/)
  })

  it('donor can cancel their listing; others cannot', async () => {
    const id = await createListing(donorA, donorAOrg)
    await expectDbError(rpc(donorB, 'cancel_listing', [id, null]), /Only the donor/)
    await rpc(donorA, 'cancel_listing', [id, 'Food spoiled'])
    const l = await db.admin(`select status from food_listings where id=$1`, [id])
    expect(l[0].status).toBe('cancelled')
  })
})

describe('requests & matching constraints', () => {
  it('unverified receivers cannot request', async () => {
    const id = await createListing(donorA, donorAOrg)
    await expectDbError(rpc(unverified, 'request_listing', [id, null]), /must be verified/)
  })

  it('enforces storage compatibility, capacity and pickup radius', async () => {
    const fridge = await createListing(donorA, donorAOrg, { storage_requirement: 'frozen' })
    await expectDbError(rpc(receiver, 'request_listing', [fridge, null]), /frozen storage/)
    const big = await createListing(donorA, donorAOrg, { estimated_meals: 400, quantity: 400 })
    await expectDbError(rpc(receiver, 'request_listing', [big, null]), /exceeds your declared handling capacity/)
    // receiver2 has a freezer and capacity 500
    expect(await rpc(receiver2, 'request_listing', [fridge, null])).toBeTruthy()
    const near = await createListing(donorA, donorAOrg, { max_radius_km: 15 })
    await expectDbError(rpc(farReceiver, 'request_listing', [near, null]), /outside the donor's 15(\.00)? km pickup radius/)
  })

  it('expired listings cannot be requested or accepted', async () => {
    const id = await createListing(donorA, donorAOrg)
    await db.admin(`update food_listings set safe_until=now()-interval '1 minute', pickup_end=now()-interval '2 minutes', pickup_start=now()-interval '3 hours' where id=$1`, [id])
    await expectDbError(rpc(receiver, 'request_listing', [id, null]), /passed its safe-use deadline/)
    // not visible publicly either
    await db.asUser(null)
    expect(await db.q(`select id from food_listings where id=$1`, [id])).toHaveLength(0)
  })

  it('a receiver cannot accept their own request; duplicate open requests are rejected', async () => {
    const id = await createListing(donorA, donorAOrg)
    const req = await rpc<string>(receiver, 'request_listing', [id, 'We can come now'])
    await expectDbError(rpc(receiver, 'request_listing', [id, null]), /already has an open request/)
    await expectDbError(rpc(receiver, 'respond_to_request', [req, true, null]), /Only the donor/)
    await expectDbError(rpc(donorB, 'respond_to_request', [req, true, null]), /Only the donor/)
  })

  it('rejection does not reserve the listing', async () => {
    const id = await createListing(donorA, donorAOrg)
    const req = await rpc<string>(receiver, 'request_listing', [id, null])
    await rpc(donorA, 'respond_to_request', [req, false, 'Already promised'])
    const l = await db.admin(`select status from food_listings where id=$1`, [id])
    expect(l[0].status).toBe('available')
    const r = await db.admin(`select status from food_requests where id=$1`, [req])
    expect(r[0].status).toBe('rejected')
  })

  it('acceptance is exclusive: competing requests are closed and a second acceptance fails', async () => {
    const id = await createListing(donorA, donorAOrg)
    const r1 = await rpc<string>(receiver, 'request_listing', [id, null])
    const r2 = await rpc<string>(receiver2, 'request_listing', [id, null])
    const res = await rpc<{ status: string; pickup_id: string }>(donorA, 'respond_to_request', [r1, true, null])
    expect(res.status).toBe('accepted')
    expect(res.pickup_id).toBeTruthy()
    await expectDbError(rpc(donorA, 'respond_to_request', [r2, true, null]), /already been rejected/)
    const rows = await db.admin(`select status from food_requests where listing_id=$1 order by created_at`, [id])
    expect(rows.map((r) => r.status).sort()).toEqual(['accepted', 'rejected'])
    // Database-level guard even if a bug bypassed the RPC:
    await expectDbError(db.admin(`update food_requests set status='accepted' where id=$1`, [r2]), /food_requests_one_accepted/)
    const l = await db.admin(`select status from food_listings where id=$1`, [id])
    expect(l[0].status).toBe('reserved')
  })
})

describe('pickup handover verification', () => {
  let listingId: string, pickupId: string

  beforeAll(async () => {
    listingId = await createListing(donorA, donorAOrg, { title: 'Handover test', estimated_meals: 30, quantity: 12, quantity_unit: 'kg' })
    const req = await rpc<string>(receiver, 'request_listing', [listingId, null])
    const res = await rpc<{ pickup_id: string }>(donorA, 'respond_to_request', [req, true, null])
    pickupId = res.pickup_id
  })

  it('unrelated users cannot see the pickup or generate/verify codes', async () => {
    await db.asUser(stranger)
    expect(await db.q(`select id from pickups where id=$1`, [pickupId])).toHaveLength(0)
    await expectDbError(rpc(stranger, 'generate_handover_code', [pickupId]), /Only the donor/)
    await expectDbError(rpc(receiver, 'generate_handover_code', [pickupId]), /Only the donor/)
    await expectDbError(rpc(stranger, 'verify_handover_code', [pickupId, '123456']), /Only the assigned volunteer or the receiving organization/)
    await expectDbError(rpc(donorA, 'verify_handover_code', [pickupId, '123456']), /Only the assigned volunteer or the receiving organization/)
    // Regression: with no volunteer assigned, NULL logic must not grant access.
    await expectDbError(rpc(stranger, 'update_pickup_progress', [pickupId, 'en_route']), /Only the assigned collector/)
  })

  it('volunteer assignment by receiver; volunteer sees only assigned pickups', async () => {
    await expectDbError(rpc(donorA, 'assign_volunteer', [pickupId, volunteer]), /Only the receiving organization/)
    await db.asUser(volunteer)
    expect(await db.q(`select id from pickups where id=$1`, [pickupId])).toHaveLength(0)
    await rpc(receiver, 'assign_volunteer', [pickupId, volunteer])
    await db.asUser(volunteer)
    expect(await db.q(`select id from pickups where id=$1`, [pickupId])).toHaveLength(1)
    await expectDbError(rpc(receiver, 'update_pickup_progress', [pickupId, 'en_route']), /Only the assigned collector/)
    await rpc(volunteer, 'update_pickup_progress', [pickupId, 'en_route'])
    await rpc(volunteer, 'update_pickup_progress', [pickupId, 'arrived'])
    await expectDbError(rpc(volunteer, 'update_pickup_progress', [pickupId, 'en_route']), /Cannot move a arrived pickup/)
  })

  it('codes are stored hashed and are not readable through the API', async () => {
    const res = await rpc<{ code: string }>(donorA, 'generate_handover_code', [pickupId])
    expect(res.code).toMatch(/^\d{6}$/)
    const stored = await db.admin<{ code_hash: string }>(`select code_hash from pickup_verifications where pickup_id=$1`, [pickupId])
    expect(stored[0].code_hash).not.toContain(res.code)
    expect(stored[0].code_hash.startsWith('$2')).toBe(true)
    for (const u of [donorA, receiver, volunteer]) {
      await db.asUser(u)
      await expectDbError(db.q(`select * from pickup_verifications`), /permission denied/)
    }
  })

  it('wrong codes count attempts and lock after the maximum', async () => {
    const { code } = await rpc<{ code: string }>(donorA, 'generate_handover_code', [pickupId])
    const wrong = code === '000000' ? '111111' : '000000'
    const first = await rpc<{ ok: boolean; attempts_remaining: number }>(volunteer, 'verify_handover_code', [pickupId, wrong])
    expect(first).toMatchObject({ ok: false, attempts_remaining: 4 })
    for (let i = 0; i < 4; i++) await rpc(volunteer, 'verify_handover_code', [pickupId, wrong])
    const locked = await rpc<{ ok: boolean; reason: string }>(volunteer, 'verify_handover_code', [pickupId, code])
    expect(locked).toMatchObject({ ok: false, reason: 'locked' })
  })

  it('expired codes are rejected', async () => {
    const { code } = await rpc<{ code: string }>(donorA, 'generate_handover_code', [pickupId])
    await db.admin(`update pickup_verifications set expires_at = now() - interval '1 second' where pickup_id=$1 and used_at is null and invalidated_at is null`, [pickupId])
    const res = await rpc<{ ok: boolean; reason: string }>(volunteer, 'verify_handover_code', [pickupId, code])
    expect(res).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('regenerating invalidates the previous code', async () => {
    const { code: old } = await rpc<{ code: string }>(donorA, 'generate_handover_code', [pickupId])
    const { code: fresh } = await rpc<{ code: string }>(donorA, 'generate_handover_code', [pickupId])
    if (old !== fresh) {
      const res = await rpc<{ ok: boolean; reason: string }>(volunteer, 'verify_handover_code', [pickupId, old])
      expect(res).toMatchObject({ ok: false, reason: 'mismatch' })
    }
    const ok = await rpc<{ ok: boolean; status: string }>(volunteer, 'verify_handover_code', [pickupId, fresh])
    expect(ok).toMatchObject({ ok: true, status: 'collected' })
    // replay
    const replay = await rpc<{ ok: boolean; reason: string }>(volunteer, 'verify_handover_code', [pickupId, fresh])
    expect(replay).toMatchObject({ ok: false, reason: 'already_completed' })
    await expectDbError(rpc(donorA, 'generate_handover_code', [pickupId]), /cannot be generated for a collected pickup/)
  })

  it('only the receiver can confirm receipt, which completes the rescue', async () => {
    await expectDbError(rpc(volunteer, 'confirm_receipt', [pickupId]), /Only the receiving organization/)
    await expectDbError(rpc(donorA, 'confirm_receipt', [pickupId]), /Only the receiving organization/)
    await rpc(receiver, 'confirm_receipt', [pickupId])
    const p = await db.admin(`select status, verified_by from pickups where id=$1`, [pickupId])
    expect(p[0]).toMatchObject({ status: 'verified', verified_by: receiver })
    const l = await db.admin(`select status from food_listings where id=$1`, [listingId])
    expect(l[0].status).toBe('completed')
    const actions = (await db.admin(`select action from audit_events where listing_id=$1 order by id`, [listingId])).map((a) => a.action)
    expect(actions).toEqual(expect.arrayContaining(['listing_created', 'request_submitted', 'request_accepted', 'pickup_assigned',
      'handover_code_generated', 'handover_verification_failed', 'collection_recorded', 'verification_completed']))
    const notes = await db.admin(`select type from notifications where user_id=$1`, [donorA])
    expect(notes.map((n) => n.type)).toEqual(expect.arrayContaining(['request_new', 'pickup_updated', 'pickup_verified']))
  })
})

describe('impact analytics', () => {
  it('counts only verified handovers as rescued, without mixing units', async () => {
    // fresh donor so totals are isolated
    const d = await db.createUser('impact@x.test', { role: 'donor', full_name: 'Impact', org_name: 'Impact Kitchen', latitude: 16.4963, longitude: 80.4994 })
    const org = (await db.admin<{ organization_id: string }>(`select organization_id from profiles where id=$1`, [d]))[0].organization_id
    const listed = await createListing(d, org, { estimated_meals: 10, quantity: 5, quantity_unit: 'kg' })
    const accepted = await createListing(d, org, { estimated_meals: 20, quantity: 8, quantity_unit: 'kg' })
    const verified = await createListing(d, org, { estimated_meals: 30, quantity: 12, quantity_unit: 'kg' })
    const litres = await createListing(d, org, { estimated_meals: 15, quantity: 9, quantity_unit: 'litres' })
    void listed
    const ra = await rpc<string>(receiver, 'request_listing', [accepted, null])
    await rpc(d, 'respond_to_request', [ra, true, null])
    for (const id of [verified, litres]) {
      const r = await rpc<string>(receiver, 'request_listing', [id, null])
      const { pickup_id } = await rpc<{ pickup_id: string }>(d, 'respond_to_request', [r, true, null])
      const { code } = await rpc<{ code: string }>(d, 'generate_handover_code', [pickup_id])
      expect((await rpc<{ ok: boolean }>(receiver, 'verify_handover_code', [pickup_id, code])).ok).toBe(true)
      await rpc(receiver, 'confirm_receipt', [pickup_id])
    }
    const s = await rpc<Record<string, number>>(d, 'get_impact_stats', ['mine'])
    expect(s.total_listings).toBe(4)
    expect(s.listed_meals).toBe(75)
    expect(s.verified_meals).toBe(45)
    expect(s.collected_meals).toBe(45)
    expect(Number(s.verified_kg)).toBe(12)
    expect(Number(s.verified_litres)).toBe(9)
    expect(s.successful_pickups).toBe(2)
    expect(Number(s.co2e_kg_estimate)).toBe(30)
  })
})

describe('expiry sync & audit immutability', () => {
  it('sync_expiry expires overdue listings, closes pickups and notifies the donor', async () => {
    const id = await createListing(donorA, donorAOrg, { title: 'Will expire' })
    const r = await rpc<string>(receiver, 'request_listing', [id, null])
    const { pickup_id } = await rpc<{ pickup_id: string }>(donorA, 'respond_to_request', [r, true, null])
    await db.admin(`update food_listings set safe_until=now()-interval '1 minute', pickup_end=now()-interval '2 minutes', pickup_start=now()-interval '2 hours' where id=$1`, [id])
    const n = await rpc<number>(receiver, 'sync_expiry')
    expect(n).toBeGreaterThanOrEqual(1)
    expect((await db.admin(`select status from food_listings where id=$1`, [id]))[0].status).toBe('expired')
    expect((await db.admin(`select status from pickups where id=$1`, [pickup_id]))[0].status).toBe('expired')
    const notes = await db.admin(`select title from notifications where user_id=$1 and type='listing_expired'`, [donorA])
    expect(notes.length).toBeGreaterThan(0)
  })

  it('audit events cannot be modified or deleted', async () => {
    await db.asUser(donorA)
    await expectDbError(db.q(`delete from audit_events`), /permission denied/)
    await expectDbError(db.q(`insert into audit_events (action, entity_type) values ('fake','x')`), /permission denied/)
    await expectDbError(db.admin(`update audit_events set action='tampered'`), /append-only/)
    await expectDbError(db.admin(`delete from audit_events`), /append-only/)
  })

  it('users only see their own notifications and cannot read other profiles', async () => {
    await db.asUser(stranger)
    const n = await db.q(`select user_id from notifications`)
    expect(n.every((r) => r.user_id === stranger)).toBe(true)
    expect(await db.q(`select id from profiles where id=$1`, [donorA])).toHaveLength(0)
  })
})

describe('demo seed', () => {
  it('seeds isolated demo data with a read-scoped demo admin', async () => {
    const ids = []
    for (const r of ['donor', 'receiver', 'volunteer', 'admin']) {
      ids.push(await db.createUser(`demo.${r}@foodbridge.test`, { role: 'volunteer', full_name: r, skip_org: 'true' }))
    }
    await db.asServiceRole()
    const res = await db.one<{ result: Record<string, number> }>(`select seed_demo_data($1,$2,$3,$4) as result`, ids)
    expect(res.result.listings).toBeGreaterThan(25)
    // Re-running is idempotent (resets demo data).
    const again = await db.one<{ result: Record<string, number> }>(`select seed_demo_data($1,$2,$3,$4) as result`, ids)
    expect(again.result).toEqual(res.result)

    const [dDonor, dReceiver, , dAdmin] = ids
    const stats = await rpc<Record<string, number>>(dDonor, 'get_impact_stats', ['mine'])
    expect(stats.verified_meals).toBeGreaterThan(0)
    expect(stats.demo_listings).toBe(stats.total_listings)

    // Demo receiver cannot request real listings.
    const real = await createListing(donorA, donorAOrg)
    await expectDbError(rpc(dReceiver, 'request_listing', [real, null]), /Demo organizations/)
    // Demo admin cannot moderate real data or see real profiles.
    await expectDbError(rpc(dAdmin, 'admin_remove_listing', [real, 'test']), /Administrator access required/)
    await db.asUser(dAdmin)
    expect(await db.q(`select id from profiles where id=$1`, [donorA])).toHaveLength(0)
    // ...but can verify demo organizations.
    await rpc(dAdmin, 'admin_set_org_verification', ['00000000-0000-4000-a000-000000000e03', 'verified', 'Demo approval'])
    // Service role is the only caller allowed to seed.
    await expectDbError(rpc(dAdmin, 'seed_demo_data', ids), /permission denied/)
  })
})
