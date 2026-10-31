// Spins up an in-process Postgres (PGlite) that emulates the parts of
// Supabase the migrations depend on (auth schema, API roles, default
// grants), applies every migration, and lets tests act as a given user.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const SUPABASE_STUB = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export type Db = Awaited<ReturnType<typeof createDb>>

export async function createDb() {
  const pg = new PGlite({ extensions: { pgcrypto } })
  await pg.exec(SUPABASE_STUB)
  const dir = path.resolve(__dirname, '../../supabase/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await pg.exec(readFileSync(path.join(dir, file), 'utf8'))
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`)
    }
  }

  let current: string | null = null

  async function asSuperuser() {
    await pg.exec(`reset role; select set_config('request.jwt.claims', '', false);`)
    current = null
  }

  async function asUser(userId: string | null) {
    await pg.exec('reset role')
    if (userId === null) {
      await pg.exec(`select set_config('request.jwt.claims', '', false); set role anon;`)
    } else {
      await pg.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ])
      await pg.exec('set role authenticated')
    }
    current = userId
  }

  async function asServiceRole() {
    await pg.exec(`reset role; select set_config('request.jwt.claims', '', false); set role service_role;`)
    current = null
  }

  /** Insert an auth user (fires the signup trigger). Returns the new id. */
  async function createUser(email: string, meta: Record<string, unknown>) {
    const prev = current
    await asSuperuser()
    const r = await pg.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [email, JSON.stringify(meta)],
    )
    if (prev) await asUser(prev)
    return r.rows[0].id
  }

  async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await pg.query<T>(sql, params)).rows
  }

  async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const rows = await q<T>(sql, params)
    return rows[0]
  }

  /** Run as superuser regardless of current identity, then restore. */
  async function admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const prev = current
    await asSuperuser()
    try {
      return await q<T>(sql, params)
    } finally {
      if (prev) await asUser(prev)
    }
  }

  return { pg, q, one, admin, asUser, asSuperuser, asServiceRole, createUser }
}

export async function expectDbError(p: Promise<unknown>, match: RegExp) {
  try {
    await p
  } catch (e) {
    const msg = (e as Error).message
    if (!match.test(msg)) throw new Error(`Expected error matching ${match}, got: ${msg}`)
    return msg
  }
  throw new Error(`Expected error matching ${match}, but the statement succeeded`)
}
