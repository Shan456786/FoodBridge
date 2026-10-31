#!/usr/bin/env node
// Provisions the four public demo accounts and (re)seeds isolated demo data.
// Runs on the operator's machine only. Requires the service-role key, which
// must NEVER be exposed to the browser (do not prefix it with VITE_).
//
//   npm run seed:demo
//
// Reads .env.local / .env:
//   VITE_SUPABASE_URL (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY
//   DEMO_PASSWORD (optional; must match src/lib/demo.ts)
import { randomBytes } from 'node:crypto'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })
config({ quiet: true })

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.DEMO_PASSWORD || 'FoodBridge-Demo-2026'

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const ACCOUNTS = [
  { key: 'donor', email: 'demo.donor@foodbridge.test', name: 'Demo Donor (Canteen Manager)' },
  { key: 'receiver', email: 'demo.receiver@foodbridge.test', name: 'Demo Receiver (NGO Coordinator)' },
  { key: 'volunteer', email: 'demo.volunteer@foodbridge.test', name: 'Demo Volunteer' },
  { key: 'admin', email: 'demo.admin@foodbridge.test', name: 'Demo Administrator' },
]

// Non-login accounts: fictional staff for each demo organization and extra
// volunteers, so every decision/confirmation in the demo history is attributed
// to a member of the right organization. Their passwords are random, never
// printed and never stored — nobody can sign in as them.
const NON_LOGIN = [
  { key: 'volunteer2', email: 'demo.volunteer2@foodbridge.test', name: 'Demo Volunteer — Arjun' },
  { key: 'volunteer3', email: 'demo.volunteer3@foodbridge.test', name: 'Demo Volunteer — Meera' },
  { key: 'volunteer4', email: 'demo.volunteer4@foodbridge.test', name: 'Demo Volunteer — Sai' },
  { key: 'staff_d2', org: '00000000-0000-4000-a000-000000000d02', email: 'demo.staff.greenbowl@foodbridge.test', name: 'Demo Staff — Green Bowl Kitchen' },
  { key: 'staff_d3', org: '00000000-0000-4000-a000-000000000d03', email: 'demo.staff.freshbasket@foodbridge.test', name: 'Demo Staff — Fresh Basket Grocery' },
  { key: 'staff_d4', org: '00000000-0000-4000-a000-000000000d04', email: 'demo.staff.celebration@foodbridge.test', name: 'Demo Staff — Celebration Banquets' },
  { key: 'staff_r2', org: '00000000-0000-4000-a000-000000000e02', email: 'demo.staff.helpinghands@foodbridge.test', name: 'Demo Staff — Helping Hands Food Bank' },
  { key: 'staff_r3', org: '00000000-0000-4000-a000-000000000e03', email: 'demo.staff.localrelief@foodbridge.test', name: 'Demo Staff — Local Relief Network' },
  { key: 'staff_r4', org: '00000000-0000-4000-a000-000000000e04', email: 'demo.staff.riverside@foodbridge.test', name: 'Demo Staff — Riverside Community Shelter' },
]

async function findUserByEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function ensureUser({ email, name }, login = true) {
  // Every account signs up as a plain volunteer with no organization; the seed
  // function then assigns the intended role/org explicitly (admin is never
  // derived from a name or from signup metadata).
  const user_metadata = { role: 'volunteer', full_name: name, skip_org: 'true' }
  const pw = login ? password : randomBytes(24).toString('base64url')
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata })
  if (!error) return data.user.id
  if (!/already|registered|exists/i.test(error.message)) throw error
  const existing = await findUserByEmail(email)
  if (!existing) throw new Error(`User ${email} reported as existing but was not found`)
  if (login) {
    const { error: upd } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
    if (upd) throw upd
  }
  return existing.id
}

const ids = {}
for (const a of ACCOUNTS) {
  ids[a.key] = await ensureUser(a)
  console.log(`✓ ${a.key.padEnd(9)} ${a.email}`)
}

for (const a of NON_LOGIN) {
  ids[a.key] = await ensureUser(a, false)
  console.log(`✓ ${a.key.padEnd(10)} ${a.email} (no login)`)
}

const p_extras = {
  volunteers: ['volunteer2', 'volunteer3', 'volunteer4'].map((k) => ids[k]),
  org_staff: Object.fromEntries(NON_LOGIN.filter((a) => a.org).map((a) => [a.org, ids[a.key]])),
}

const { data, error } = await admin.rpc('seed_demo_data', {
  p_donor: ids.donor,
  p_receiver: ids.receiver,
  p_volunteer: ids.volunteer,
  p_admin: ids.admin,
  p_extras,
})
if (error) {
  console.error('Seeding failed:', error.message)
  if (/function .* does not exist|Could not find the function/i.test(error.message)) {
    console.error('→ Apply the migrations first (see README: "Database setup").')
  }
  process.exit(1)
}
console.log('✓ Demo data seeded:', data)
console.log(`\nDemo password for all four accounts: ${password}`)
