// @vitest-environment node
// Security regression tests: RLS coverage, anonymous access surface,
// function privileges and audit-forgery protection.
import { beforeAll, describe, expect, it } from 'vitest'
import { PUBLIC_LISTING_COLUMNS } from '../../src/lib/api.live'
import { createDb, expectDbError, type Db } from './harness'

let db: Db

beforeAll(async () => {
  db = await createDb()
})

describe('database security posture', () => {
  it('has RLS enabled on every public table', async () => {
    const rows = await db.admin<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    )
    expect(rows.length).toBeGreaterThanOrEqual(9)
    expect(rows.filter((r) => !r.rls).map((r) => r.relname)).toEqual([])
  })

  it('keeps handover-code hashes unreadable by every API role', async () => {
    const policies = await db.admin(`select 1 from pg_policies where tablename = 'pickup_verifications'`)
    expect(policies).toHaveLength(0)
    for (const role of ['anon', 'authenticated']) {
      const r = await db.admin<{ ok: boolean }>(`select has_table_privilege($1, 'public.pickup_verifications', 'SELECT') as ok`, [role])
      expect(r[0].ok).toBe(false)
    }
  })

  it('gives anonymous visitors read-only access to two tables and no functions', async () => {
    const writes = await db.admin(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' and privilege_type <> 'SELECT'`,
    )
    expect(writes).toEqual([])
    const fns = await db.admin<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`,
    )
    expect(fns.map((f) => f.proname)).toEqual([])
  })

  it('lets anonymous visitors run the public Explore query but not read internal columns', async () => {
    await db.asUser(null)
    await db.q(
      `select ${PUBLIC_LISTING_COLUMNS}, (select row(o.id, o.name, o.org_type, o.city, o.verification_status, o.is_demo)
         from organizations o where o.id = l.donor_org_id) as donor
       from food_listings l where status = 'available'`,
    )
    await expectDbError(db.q(`select verification_note from organizations`), /permission denied/)
    await expectDbError(db.q(`select created_by from organizations`), /permission denied/)
    await expectDbError(db.q(`select created_by from food_listings`), /permission denied/)
    await expectDbError(db.q(`select moderation_note from food_listings`), /permission denied/)
  })

  it('prevents signed-in users from forging audit events or seeding data', async () => {
    const u = await db.createUser('forger@x.test', { role: 'donor', full_name: 'F', org_name: 'Forge Kitchen' })
    await db.asUser(u)
    await expectDbError(
      db.q(`select private.log_audit('verification_completed', 'pickup', gen_random_uuid(), null, '{}'::jsonb, false)`),
      /permission denied/,
    )
    // The narrow trigger helper only logs for listings the caller's org owns.
    await db.q(`select private.audit_listing_write(gen_random_uuid(), 'INSERT')`)
    const forged = await db.admin(`select 1 from audit_events where actor_id = $1`, [u])
    expect(forged).toHaveLength(0)
    await expectDbError(
      db.q(`select seed_demo_data(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid())`),
      /permission denied/,
    )
  })

  it('pins search_path on every security-definer function', async () => {
    const rows = await db.admin(
      `select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    )
    expect(rows).toEqual([])
  })
})
