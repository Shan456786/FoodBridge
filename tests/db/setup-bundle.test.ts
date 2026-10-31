// @vitest-environment node
// The bundled supabase/setup.sql (for the dashboard SQL editor) must apply cleanly on its own.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

it('setup.sql applies on a fresh database', async () => {
  const pg = new PGlite({ extensions: { pgcrypto } })
  await pg.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema extensions;`)
  await pg.exec(readFileSync(path.resolve(import.meta.dirname, '../../supabase/setup.sql'), 'utf8'))
  const r = await pg.query<{ n: number }>(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'`)
  expect(r.rows[0].n).toBeGreaterThanOrEqual(15)
})
