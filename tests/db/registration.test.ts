// @vitest-environment node
// Registration: what the signup trigger stores for each role, that admin can
// never be self-assigned, and that the demo seed provisions all four roles.
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, expectDbError, type Db } from './harness'

let db: Db

beforeAll(async () => {
  db = await createDb()
})

const profileOf = (id: string) =>
  db.admin<{ role: string; full_name: string; organization_id: string | null; is_demo: boolean }>(
    `select role, full_name, organization_id, is_demo from profiles where id = $1`,
    [id],
  )

describe('registration (signup trigger)', () => {
  it('creates a donor profile, its organization and owner membership', async () => {
    const id = await db.createUser('donor@reg.test', {
      role: 'donor', full_name: 'Ravi Kumar', org_name: 'Hostel Mess', org_type: 'canteen',
      address: 'Block A', city: 'Amaravati', latitude: 16.49, longitude: 80.5,
      has_refrigeration: 'true', has_freezer: 'false', capacity_meals: 0,
    })
    const [p] = await profileOf(id)
    expect(p).toMatchObject({ role: 'donor', full_name: 'Ravi Kumar', is_demo: false })
    const [org] = await db.admin(`select name, kind, org_type, latitude, has_refrigeration, is_demo from organizations where id = $1`, [p.organization_id])
    expect(org).toMatchObject({ name: 'Hostel Mess', kind: 'donor', org_type: 'canteen', latitude: 16.49, has_refrigeration: true, is_demo: false })
    const members = await db.admin(`select member_role from organization_members where user_id = $1`, [id])
    expect(members).toEqual([{ member_role: 'owner' }])
  })

  it('creates a receiver organization with capacity that awaits verification', async () => {
    const id = await db.createUser('ngo@reg.test', {
      role: 'receiver', full_name: 'Asha', org_name: 'City NGO', org_type: 'ngo', address: 'Main Rd',
      latitude: 16.5, longitude: 80.6, capacity_meals: 150,
    })
    const [p] = await profileOf(id)
    const [org] = await db.admin(`select kind, capacity_meals, verification_status from organizations where id = $1`, [p.organization_id])
    expect(org).toMatchObject({ kind: 'receiver', capacity_meals: 150 })
    expect(org.verification_status).not.toBe('verified')
  })

  it('creates a volunteer (transporter) without an organization', async () => {
    const id = await db.createUser('vol@reg.test', { role: 'volunteer', full_name: 'Kiran' })
    const [p] = await profileOf(id)
    expect(p).toMatchObject({ role: 'volunteer', organization_id: null })
  })

  it('never grants admin from signup metadata', async () => {
    const id = await db.createUser('sneaky@reg.test', { role: 'admin', full_name: 'Sneaky' })
    const [p] = await profileOf(id)
    expect(p.role).toBe('volunteer')
  })

  it('stops users from changing their own role, but lets them edit their name', async () => {
    const id = await db.createUser('climber@reg.test', { role: 'volunteer', full_name: 'Climber' })
    await db.asUser(id)
    await expectDbError(db.q(`update profiles set role = 'admin' where id = $1`, [id]), /permission denied|cannot change/i)
    await db.q(`update profiles set full_name = 'Renamed' where id = $1`, [id])
    await db.asSuperuser()
    expect((await profileOf(id))[0]).toMatchObject({ role: 'volunteer', full_name: 'Renamed' })
  })
})

describe('demo accounts', () => {
  it('seeds one demo user per role, isolated as demo records', async () => {
    const ids = {
      donor: await db.createUser('demo.donor@foodbridge.test', { role: 'volunteer', skip_org: 'true' }),
      receiver: await db.createUser('demo.receiver@foodbridge.test', { role: 'volunteer', skip_org: 'true' }),
      volunteer: await db.createUser('demo.volunteer@foodbridge.test', { role: 'volunteer', skip_org: 'true' }),
      admin: await db.createUser('demo.admin@foodbridge.test', { role: 'volunteer', skip_org: 'true' }),
    }
    await db.asServiceRole()
    await db.q(`select seed_demo_data($1, $2, $3, $4)`, [ids.donor, ids.receiver, ids.volunteer, ids.admin])
    await db.asSuperuser()

    for (const [role, id] of Object.entries(ids)) {
      const [p] = await profileOf(id)
      expect(p, role).toMatchObject({ role, is_demo: true })
    }
    const [donorOrg] = await db.admin(
      `select o.name, o.is_demo from organizations o join profiles p on p.organization_id = o.id where p.id = $1`,
      [ids.donor],
    )
    expect(donorOrg).toEqual({ name: 'Central Canteen', is_demo: true })
  })
})
