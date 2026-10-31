#!/usr/bin/env node
// Verifies the REAL Supabase backend end to end. Prints pass/fail per step and
// never prints keys, passwords or tokens.
//
//   npm run verify:supabase              # read-only checks
//   npm run verify:supabase -- --register # also registers, signs in and deletes a test account
//
// Read-only checks: env values present and not placeholders (same rules the
// browser uses to choose live vs offline), anon key is not a secret key, Auth
// reachable, database tables present (setup.sql applied), demo accounts seeded.
//
// --register (needs SUPABASE_SERVICE_ROLE_KEY in .env.local, used only here for
// cleanup): signs up through the public sign-up endpoint exactly like the app,
// signs in, checks the profile/role/organization the signup trigger created and
// that RLS lets the user read listings, signs out, then deletes the account.
import { randomBytes } from 'node:crypto'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { isPlaceholder, isServerOnlyKey } from '../src/lib/keyGuard.ts'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const REGISTER = process.argv.includes('--register')
const url = process.env.VITE_SUPABASE_URL?.trim()
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

let failures = 0
const ok = (msg) => console.log(`  ✓ ${msg}`)
const bad = (msg, fix) => {
  failures++
  console.log(`  ✗ ${msg}${fix ? `\n      → ${fix}` : ''}`)
}
const info = (msg) => console.log(`  · ${msg}`)
function done() {
  console.log(failures ? `\n${failures} problem(s) found.` : '\nAll checks passed.')
  process.exit(failures ? 1 : 0)
}

const WHERE = 'Supabase dashboard → your project → Project Settings → API'

// ------------------------------------------------------------------ 1. env
console.log('1. Environment (.env.local)')
if (!url) bad('VITE_SUPABASE_URL is missing', `Copy "Project URL" from ${WHERE}`)
else if (isPlaceholder(url)) bad('VITE_SUPABASE_URL is still the .env.example placeholder', `Copy "Project URL" from ${WHERE}`)
else {
  let parsed = null
  try {
    parsed = new URL(url)
  } catch {
    bad('VITE_SUPABASE_URL is not a valid URL', 'It should look like https://<project-ref>.supabase.co')
  }
  if (parsed) {
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))
      bad('VITE_SUPABASE_URL must use https://')
    else if (parsed.pathname !== '/' && parsed.pathname !== '')
      bad('VITE_SUPABASE_URL should be the bare project URL (no /rest/v1 or other path)')
    else ok(`VITE_SUPABASE_URL looks valid (host ${parsed.hostname.replace(/^[^.]+/, '<ref>')})`)
  }
}
if (!anonKey) bad('VITE_SUPABASE_ANON_KEY is missing', `Copy the "anon public" (or publishable) key from ${WHERE}`)
else if (isPlaceholder(anonKey)) bad('VITE_SUPABASE_ANON_KEY is still the .env.example placeholder', `Copy the "anon public" (or publishable) key from ${WHERE}`)
else if (isServerOnlyKey(anonKey))
  bad('VITE_SUPABASE_ANON_KEY holds a SERVICE-ROLE/secret key — it would be shipped to every browser', 'Put the anon/publishable key there instead, and rotate the exposed secret key in Supabase')
else ok('VITE_SUPABASE_ANON_KEY is set and is a public (anon/publishable) key')
if (serviceKey && !isPlaceholder(serviceKey)) {
  if (!isServerOnlyKey(serviceKey) && !serviceKey.startsWith('eyJ')) info('SUPABASE_SERVICE_ROLE_KEY does not look like a service-role key')
  else ok('SUPABASE_SERVICE_ROLE_KEY is set (server-side only; not a VITE_ variable)')
} else info('SUPABASE_SERVICE_ROLE_KEY not set (only needed for npm run seed:demo and --register)')

if (failures) {
  console.log('\nThe app stays in OFFLINE DEMO mode until both VITE_ values are real. After editing .env.local, restart `npm run dev`.')
  done()
}

const anon = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }

// ------------------------------------------------------------ 2. reachable
console.log('\n2. Connectivity')
let settings = null
try {
  const r = await fetch(`${url}/auth/v1/settings`, { headers })
  if (r.status === 401 || r.status === 403) bad(`Auth rejected the anon key (HTTP ${r.status})`, `The key doesn't belong to this project URL — recopy both from ${WHERE}`)
  else if (!r.ok) bad(`Auth responded HTTP ${r.status}`, 'If the project is paused, restore it in the Supabase dashboard')
  else {
    settings = await r.json()
    ok('Supabase Auth is reachable and accepts the anon key')
  }
} catch (e) {
  bad(`Cannot reach ${new URL(url).hostname.replace(/^[^.]+/, '<ref>')} (${e.cause?.code ?? e.message})`, 'Check the project URL and your internet connection; a paused project must be restored')
}
if (!settings) done()

if (settings.external?.email === false) bad('Email/password sign-in is disabled', 'Authentication → Sign In / Providers → enable Email')
else ok('Email/password provider enabled')
if (settings.disable_signup) bad('New sign-ups are disabled in Supabase Auth', 'Authentication → Sign In / Providers → allow new users to sign up')
else ok('Sign-ups allowed')
info(
  settings.mailer_autoconfirm
    ? 'Email confirmation is OFF: new accounts can sign in immediately'
    : 'Email confirmation is ON: new users must click the emailed link before signing in',
)

// ---------------------------------------------------------------- 3. schema
console.log('\n3. Database (supabase/setup.sql)')
const db = anon()
let schemaOk = true
for (const table of ['organizations', 'food_listings']) {
  const { error } = await db.from(table).select('id').limit(1)
  if (error) {
    schemaOk = false
    const missing = /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code} ${error.message}`)
    bad(
      `Table public.${table}: ${missing ? 'not found' : error.message}`,
      missing ? 'Open Supabase → SQL Editor, paste the whole of supabase/setup.sql and click Run' : undefined,
    )
  } else ok(`public.${table} exists and is readable by visitors`)
}
const { error: profErr, data: profRows } = await db.from('profiles').select('id').limit(1)
if (profErr && !/permission denied/i.test(profErr.message)) bad(`public.profiles: ${profErr.message}`)
else if ((profRows ?? []).length) bad('Anonymous visitors can read profiles — row-level security is not in effect', 'Re-run supabase/setup.sql on a fresh project')
else ok('Profiles are hidden from anonymous visitors (RLS active)')

// ----------------------------------------------------------------- 4. demo
console.log('\n4. Demo accounts')
if (schemaOk) {
  const demo = anon()
  const { error } = await demo.auth.signInWithPassword({ email: 'demo.donor@foodbridge.test', password: process.env.DEMO_PASSWORD || 'FoodBridge-Demo-2026' })
  if (error) info(`Demo donor can't sign in yet (${error.message}) → run npm run seed:demo (needs SUPABASE_SERVICE_ROLE_KEY)`)
  else {
    const { data: p } = await demo.from('profiles').select('role, is_demo').eq('id', (await demo.auth.getUser()).data.user.id).single()
    if (p?.role === 'donor' && p.is_demo) ok('Demo donor signs in with the donor role')
    else bad('Demo donor profile is wrong', 'Run npm run seed:demo again')
    await demo.auth.signOut()
  }
} else info('Skipped until the database setup is applied')

// ------------------------------------------------------------- 5. register
if (!REGISTER) {
  info('\nReal registration not tested. Run: npm run verify:supabase -- --register')
  done()
}
console.log('\n5. Real registration (test account, deleted afterwards)')
if (!schemaOk) {
  bad('Skipped: apply supabase/setup.sql first')
  done()
}
if (!serviceKey || isPlaceholder(serviceKey) || !(isServerOnlyKey(serviceKey) || serviceKey.startsWith('eyJ'))) {
  bad('--register needs SUPABASE_SERVICE_ROLE_KEY in .env.local to delete the test account afterwards', `Copy the "service_role" (secret) key from ${WHERE} into SUPABASE_SERVICE_ROLE_KEY — never into a VITE_ variable`)
  done()
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const email = `fb-verify-${Date.now()}@foodbridge.test`
const password = randomBytes(18).toString('base64url')
const user = anon()
let userId = null
let orgId = null
try {
  const meta = {
    role: 'donor', full_name: 'Verify Bot', org_name: 'Verification Kitchen', org_type: 'canteen',
    address: 'Test Road', city: 'Amaravati', latitude: 16.49, longitude: 80.5,
    has_refrigeration: 'true', has_freezer: 'false', capacity_meals: 0,
  }
  // The exact call the sign-up page makes.
  const { data: su, error: suErr } = await user.auth.signUp({ email, password, options: { data: meta } })
  if (suErr) {
    bad(`Sign-up failed: ${suErr.message}`, /not authorized|sending|smtp|confirmation/i.test(suErr.message)
      ? 'Supabase could not send the confirmation email. For testing, turn off "Confirm email" under Authentication → Sign In / Providers → Email, or configure SMTP'
      : undefined)
    throw new Error('stop')
  }
  userId = su.user?.id ?? null
  ok('Signed up through the public sign-up endpoint')

  if (!su.session) {
    info('Email confirmation is on: confirming this test account with the service key so sign-in can be tested')
    const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true })
    if (error) throw new Error(`could not confirm test user: ${error.message}`)
  }
  const { error: siErr } = await user.auth.signInWithPassword({ email, password })
  if (siErr) {
    bad(`Sign-in failed: ${siErr.message}`)
    throw new Error('stop')
  }
  ok('Signed in with email and password')

  const wrong = await anon().auth.signInWithPassword({ email, password: password + 'x' })
  if (wrong.error && /invalid login credentials/i.test(wrong.error.message)) ok('Wrong password is rejected')
  else bad('Wrong password was not rejected as expected')

  const { data: prof, error: pErr } = await user.from('profiles').select('role, full_name, organization_id, is_demo').eq('id', userId).single()
  if (pErr || !prof) bad(`Profile not readable by its owner: ${pErr?.message ?? 'missing'}`, 'The signup trigger may be missing — re-apply supabase/setup.sql')
  else if (prof.role !== 'donor' || prof.is_demo) bad(`Profile has role=${prof.role}, is_demo=${prof.is_demo}`)
  else ok('Profile created by the signup trigger with role "donor"')
  orgId = prof?.organization_id ?? null

  const { data: org } = orgId ? await user.from('organizations').select('name, kind').eq('id', orgId).single() : { data: null }
  if (org?.name === 'Verification Kitchen' && org.kind === 'donor') ok('Organization created and linked to the account')
  else bad('Organization was not created from the sign-up details')

  const promote = await user.from('profiles').update({ role: 'admin' }).eq('id', userId)
  const { data: after } = await user.from('profiles').select('role').eq('id', userId).single()
  if (after?.role === 'donor') ok(`User cannot promote themselves to admin${promote.error ? ' (blocked by the database)' : ''}`)
  else bad('A user was able to change their own role!')

  const { error: lErr } = await user.from('food_listings').select('id').limit(5)
  if (lErr) bad(`Signed-in user cannot read listings: ${lErr.message}`)
  else ok('Signed-in user can query listings')

  const { error: soErr } = await user.auth.signOut()
  const { data: s } = await user.auth.getSession()
  if (soErr || s.session) bad('Sign-out did not clear the session')
  else ok('Signed out')

  const dup = await anon().auth.signUp({ email, password: 'another-password-1' })
  if (dup.error || dup.data.user?.identities?.length === 0) ok('Registering the same email again is refused')
  else bad('Duplicate email registration was accepted')
} catch (e) {
  if (e.message !== 'stop') bad(`Unexpected error: ${e.message}`)
} finally {
  // Cleanup: the org is not deleted by the auth cascade (created_by → set null).
  if (orgId) await admin.from('organizations').delete().eq('id', orgId)
  if (!userId) userId = (await admin.auth.admin.listUsers({ perPage: 1000 })).data?.users.find((u) => u.email === email)?.id ?? null
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) bad(`Could not delete test account ${email}: ${error.message}`, 'Delete it under Authentication → Users')
    else ok('Test account and its organization deleted')
  }
}
done()
