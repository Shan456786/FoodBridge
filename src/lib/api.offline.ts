/**
 * OFFLINE DEMO BACKEND
 *
 * Used automatically when no Supabase project is configured. It implements the
 * same API surface as api.live.ts against fictional sample data stored in this
 * browser (localStorage). It mirrors the server rules (deadlines, storage /
 * capacity / radius eligibility via the real matching engine, single
 * acceptance, code attempts / expiry / no reuse) so the workflow can be
 * demonstrated — but NOTHING here is a real rescue, and handover codes are a
 * local simulation (the Supabase backend stores only bcrypt hashes).
 */
import { DEMO_ACCOUNTS } from './demo'
import { evaluateMatch } from './matching'
import { effectiveStatus } from './time'
import type {
  AppNotification,
  AuditEvent,
  Category,
  FoodListing,
  FoodRequest,
  ImpactStats,
  ListingStatus,
  Organization,
  Pickup,
  PickupStatus,
  Profile,
  VerifyResult,
} from './types'
import type { ListingInput } from './api.live'

export { friendlyError } from './api.live'

// ------------------------------------------------------------------ store
const DB_KEY = 'fb.offline.db.v1'
const USER_KEY = 'fb.offline.user'
export const OFFLINE_AUTH_EVENT = 'fb-offline-auth'

interface Code {
  pickup_id: string
  code: string
  expires_at: string
  attempts: number
  used_at: string | null
  invalidated: boolean
}
interface DB {
  orgs: Organization[]
  profiles: Profile[]
  members: { org: string; user: string }[]
  listings: FoodListing[]
  requests: FoodRequest[]
  pickups: Pickup[]
  codes: Code[]
  notifications: AppNotification[]
  audit: AuditEvent[]
  seq: number
}

let memory: DB | null = null
let memoryUser: string | null = null

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
function write(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage unavailable: memory only */
  }
}

function db(): DB {
  if (!memory) memory = read<DB>(DB_KEY) ?? seed()
  return memory
}
function save() {
  write(DB_KEY, memory)
}
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 120))
const iso = (ms: number) => new Date(ms).toISOString()
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now()}`)

export function resetOfflineDemo() {
  memory = seed()
  save()
}

// ------------------------------------------------------------------- auth
export function offlineUserId(): string | null {
  return memoryUser ?? read<string>(USER_KEY)
}
export function offlineEmail(id: string) {
  return db().profiles.find((p) => p.id === id)?.email ?? null
}
export function offlineSignIn(email: string) {
  const p = db().profiles.find((x) => x.email?.toLowerCase() === email.toLowerCase())
  if (!p || !DEMO_ACCOUNTS.some((a) => a.email === p.email)) throw new Error('In offline demo mode, sign in with one of the demo accounts.')
  memoryUser = p.id
  write(USER_KEY, p.id)
  window.dispatchEvent(new Event(OFFLINE_AUTH_EVENT))
}
export function offlineSignOut() {
  memoryUser = null
  write(USER_KEY, null)
  window.dispatchEvent(new Event(OFFLINE_AUTH_EVENT))
}

// ------------------------------------------------------------------- seed
const ORG = {
  d1: 'org-d1', d2: 'org-d2', d3: 'org-d3', d4: 'org-d4',
  r1: 'org-r1', r2: 'org-r2', r3: 'org-r3', r4: 'org-r4',
}
const USER = {
  donor: 'user-donor', receiver: 'user-receiver', volunteer: 'user-volunteer', admin: 'user-admin',
  v2: 'user-v2', v3: 'user-v3', v4: 'user-v4',
  d2: 'user-d2', d3: 'user-d3', d4: 'user-d4', r2: 'user-r2', r3: 'user-r3', r4: 'user-r4',
}

function seed(): DB {
  const n = Date.now()
  const H = 3600_000
  const M = 60_000
  const created = iso(n - 40 * 24 * H)
  const org = (id: string, name: string, kind: 'donor' | 'receiver', org_type: Organization['org_type'], address: string, city: string,
    latitude: number, longitude: number, fridge: boolean, freezer: boolean, cap: number, status: Organization['verification_status'] = 'verified'): Organization => ({
    id, name, kind, org_type, address, city, latitude, longitude, has_refrigeration: fridge, has_freezer: freezer,
    capacity_meals: cap, verification_status: status, verification_note: null, is_demo: true, created_at: created,
  })
  const orgs = [
    org(ORG.d1, 'Central Canteen', 'donor', 'canteen', 'Central Block, VIT-AP Campus, Inavolu', 'Amaravati', 16.4963, 80.4994, true, false, 0),
    org(ORG.d2, 'Green Bowl Kitchen', 'donor', 'restaurant', 'Near Benz Circle, MG Road', 'Vijayawada', 16.4996, 80.656, true, false, 0),
    org(ORG.d3, 'Fresh Basket Grocery', 'donor', 'grocery', 'Main Bazaar Road', 'Mangalagiri', 16.4307, 80.5525, true, true, 0),
    org(ORG.d4, 'Celebration Banquets', 'donor', 'banquet_hall', 'NH-16 Service Road', 'Tadepalli', 16.48, 80.6, true, false, 0),
    org(ORG.r1, 'Community Food Collective', 'receiver', 'ngo', 'Undavalli Centre Road', 'Tadepalli', 16.485, 80.59, true, false, 250),
    org(ORG.r2, 'Helping Hands Food Bank', 'receiver', 'food_bank', 'Governorpet', 'Vijayawada', 16.5131, 80.6297, true, true, 500),
    org(ORG.r3, 'Local Relief Network', 'receiver', 'community_org', 'Brodipet', 'Guntur', 16.3067, 80.4365, false, false, 80, 'pending'),
    org(ORG.r4, 'Riverside Community Shelter', 'receiver', 'community_org', 'Bhavanipuram', 'Vijayawada', 16.53, 80.593, false, false, 60),
  ]
  const prof = (id: string, email: string, full_name: string, role: Profile['role'], organization_id: string | null): Profile => ({
    id, email, full_name, role, organization_id, phone: null, is_demo: true, created_at: created,
  })
  const profiles = [
    prof(USER.donor, 'demo.donor@foodbridge.test', 'Demo Donor — Canteen Manager', 'donor', ORG.d1),
    prof(USER.receiver, 'demo.receiver@foodbridge.test', 'Demo Receiver — NGO Coordinator', 'receiver', ORG.r1),
    prof(USER.volunteer, 'demo.volunteer@foodbridge.test', 'Demo Volunteer — Kiran', 'volunteer', null),
    prof(USER.admin, 'demo.admin@foodbridge.test', 'Demo Administrator', 'admin', null),
    prof(USER.v2, 'demo.volunteer2@foodbridge.test', 'Demo Volunteer — Arjun', 'volunteer', null),
    prof(USER.v3, 'demo.volunteer3@foodbridge.test', 'Demo Volunteer — Meera', 'volunteer', null),
    prof(USER.v4, 'demo.volunteer4@foodbridge.test', 'Demo Volunteer — Sai', 'volunteer', null),
    prof(USER.d2, 'demo.staff.greenbowl@foodbridge.test', 'Demo Staff — Green Bowl Kitchen', 'donor', ORG.d2),
    prof(USER.d3, 'demo.staff.freshbasket@foodbridge.test', 'Demo Staff — Fresh Basket Grocery', 'donor', ORG.d3),
    prof(USER.d4, 'demo.staff.celebration@foodbridge.test', 'Demo Staff — Celebration Banquets', 'donor', ORG.d4),
    prof(USER.r2, 'demo.staff.helpinghands@foodbridge.test', 'Demo Staff — Helping Hands Food Bank', 'receiver', ORG.r2),
    prof(USER.r3, 'demo.staff.localrelief@foodbridge.test', 'Demo Staff — Local Relief Network', 'receiver', ORG.r3),
    prof(USER.r4, 'demo.staff.riverside@foodbridge.test', 'Demo Staff — Riverside Community Shelter', 'receiver', ORG.r4),
  ]
  const members = profiles.filter((p) => p.organization_id).map((p) => ({ org: p.organization_id!, user: p.id }))
  const staffOf: Record<string, string> = { [ORG.d1]: USER.donor, [ORG.d2]: USER.d2, [ORG.d3]: USER.d3, [ORG.d4]: USER.d4, [ORG.r1]: USER.receiver, [ORG.r2]: USER.r2 }

  const d: DB = { orgs, profiles, members, listings: [], requests: [], pickups: [], codes: [], notifications: [], audit: [], seq: 1 }
  const audit = (actor: string | null, action: string, entity_type: string, entity_id: string, listing_id: string, at: number, metadata: Record<string, unknown> = {}) =>
    d.audit.push({ id: d.seq++, actor_id: actor, action, entity_type, entity_id, listing_id, metadata, is_demo: true, created_at: iso(at) })

  const listing = (key: string, donorOrg: string, title: string, description: string, category: Category, diet: FoodListing['diet'],
    quantity: number, unit: FoodListing['quantity_unit'], meals: number, storage: FoodListing['storage_requirement'],
    safeH: number, startH: number, endH: number, status: ListingStatus, createdAgoMin: number, allergens: string[] = [], packaging: string | null = null, base = n) => {
    const o = orgs.find((x) => x.id === donorOrg)!
    const l: FoodListing = {
      id: `listing-${key}`, donor_org_id: donorOrg, created_by: staffOf[donorOrg] ?? null, title, description, category, diet,
      quantity, quantity_unit: unit, estimated_meals: meals, prepared_at: iso(base - createdAgoMin * M - 30 * M),
      safe_until: iso(base + safeH * H), pickup_start: iso(base + startH * H), pickup_end: iso(base + endH * H),
      storage_requirement: storage, packaging, allergens, pickup_address: o.address!, latitude: o.latitude!, longitude: o.longitude!,
      max_radius_km: 20, status, handling_confirmed: true, moderation_note: null, is_demo: true,
      created_at: iso(base - createdAgoMin * M), updated_at: iso(base - createdAgoMin * M),
    }
    d.listings.push(l)
    audit(l.created_by, 'listing_created', 'food_listing', l.id, l.id, base - createdAgoMin * M, { title })
    return l
  }
  const request = (key: string, l: FoodListing, recvOrg: string, status: FoodRequest['status'], message: string, atMs: number, note: string | null = null) => {
    const o = orgs.find((x) => x.id === recvOrg)!
    const r: FoodRequest = {
      id: `request-${key}`, listing_id: l.id, receiver_org_id: recvOrg, requested_by: staffOf[recvOrg] ?? null,
      requested_quantity: l.quantity, message, status, distance_km: evaluateMatch(l, o, atMs).distanceKm,
      decision_note: note, decided_at: status === 'pending' ? null : iso(atMs + 15 * M), is_demo: true, created_at: iso(atMs),
    }
    d.requests.push(r)
    audit(r.requested_by, 'request_submitted', 'food_request', r.id, l.id, atMs, { receiver_org: o.name })
    return r
  }
  const pickup = (key: string, l: FoodListing, recvOrg: string, volunteer: string | null, status: PickupStatus, acceptedMs: number, collectedMs: number | null, verifiedMs: number | null) => {
    const r = request(key, l, recvOrg, 'accepted', 'We can collect within the window.', acceptedMs - 20 * M)
    r.decided_at = iso(acceptedMs)
    audit(staffOf[l.donor_org_id] ?? null, 'request_accepted', 'food_request', r.id, l.id, acceptedMs, { receiver_org: orgs.find((o) => o.id === recvOrg)!.name })
    const p: Pickup = {
      id: `pickup-${key}`, listing_id: l.id, request_id: r.id, donor_org_id: l.donor_org_id, receiver_org_id: recvOrg,
      volunteer_id: volunteer, status, assigned_at: volunteer ? iso(acceptedMs + 5 * M) : null,
      en_route_at: ['en_route', 'arrived', 'collected', 'verified'].includes(status) ? iso(acceptedMs + 15 * M) : null,
      arrived_at: collectedMs ? iso(collectedMs - 10 * M) : null, collected_at: collectedMs ? iso(collectedMs) : null,
      verified_at: verifiedMs ? iso(verifiedMs) : null, cancelled_at: null, is_demo: true,
      created_at: iso(acceptedMs), updated_at: iso(verifiedMs ?? collectedMs ?? acceptedMs),
    }
    d.pickups.push(p)
    if (volunteer) audit(r.requested_by, 'pickup_assigned', 'pickup', p.id, l.id, acceptedMs + 5 * M)
    if (collectedMs) {
      d.codes.push({ pickup_id: p.id, code: '', expires_at: iso(collectedMs + 20 * M), attempts: 0, used_at: iso(collectedMs), invalidated: false })
      audit(l.created_by, 'handover_code_generated', 'pickup', p.id, l.id, collectedMs - 10 * M)
      audit(volunteer ?? r.requested_by, 'collection_recorded', 'pickup', p.id, l.id, collectedMs, { method: 'handover_code' })
    }
    if (verifiedMs) audit(r.requested_by, 'verification_completed', 'pickup', p.id, l.id, verifiedMs, { meals: l.estimated_meals })
    return p
  }

  // Open listings
  listing('biryani', ORG.d1, 'Veg Biryani & Raita', 'Lunch surplus from the main counter, kept covered in hot cases since service.', 'cooked_meals', 'veg', 40, 'portions', 40, 'ambient', 3, -0.17, 2.5, 'available', 25, ['dairy'], 'Steel containers')
  listing('bread', ORG.d3, 'Assorted Bread & Buns', "Unsold bakery items from today's batch, sealed in bags.", 'bakery', 'veg', 12, 'kg', 60, 'ambient', 20, 1, 8, 'available', 120, ['gluten'], 'Sealed plastic bags')
  listing('paneer', ORG.d4, 'Paneer Butter Masala with Rotis', 'Evening event surplus, refrigerated immediately after service.', 'cooked_meals', 'veg', 120, 'portions', 120, 'refrigerated', 5, 0, 4, 'available', 40, ['dairy', 'gluten'], 'Food-grade trays')
  listing('vegetables', ORG.d3, 'Fresh Vegetables Crate', 'Tomatoes, onions, carrots and greens with minor cosmetic blemishes.', 'vegetables', 'vegan', 25, 'kg', 50, 'ambient', 48, 0, 24, 'available', 180, [], 'Plastic crates')
  listing('fruit-basket', ORG.d3, 'Seasonal Fruit Basket', 'Bananas, guavas and oranges, ripe.', 'fruits', 'vegan', 15, 'kg', 30, 'ambient', 30, 0, 20, 'available', 80, [], 'Cardboard boxes')
  listing('curd', ORG.d3, 'Curd & Buttermilk Packs', "Sealed dairy packs within the manufacturer's date, kept chilled.", 'dairy', 'veg', 30, 'litres', 60, 'refrigerated', 10, 0, 8, 'available', 90, ['dairy'], 'Sealed sachets')
  listing('chicken-curry', ORG.d2, 'Chicken Curry & Rice', 'Dinner service surplus. Needs immediate pickup.', 'cooked_meals', 'non_veg', 35, 'portions', 35, 'ambient', 50 / 60, -0.5, 0.75, 'available', 50, [], 'Disposable containers')
  listing('parathas', ORG.d3, 'Frozen Parathas', 'Unopened cartons of packaged frozen parathas.', 'packaged_food', 'veg', 80, 'packets', 80, 'frozen', 120, 0, 48, 'available', 300, ['gluten'], 'Original cartons')
  listing('wedding-buffet', ORG.d4, 'Wedding Buffet Surplus', 'Rice, dal and mixed vegetable curry; chilled after service.', 'cooked_meals', 'veg', 300, 'portions', 300, 'refrigerated', 6, 0, 5, 'available', 30, [], 'Insulated containers')

  const idli = listing('idli', ORG.d1, 'Idli & Sambar Breakfast', 'Breakfast surplus, kept in insulated containers.', 'cooked_meals', 'veg', 50, 'portions', 50, 'ambient', 4, 0, 3, 'available', 35, [], 'Insulated containers')
  request('idli-r1', idli, ORG.r1, 'pending', 'We can send a volunteer within 30 minutes.', n - 20 * M)
  request('idli-r2', idli, ORG.r2, 'pending', 'Our van is in the area this morning.', n - 12 * M)

  const friedRice = listing('fried-rice', ORG.d2, 'Veg Fried Rice', 'Kitchen surplus from the lunch buffet.', 'cooked_meals', 'veg', 30, 'portions', 30, 'ambient', 4, 0, 3, 'available', 70, ['soy'], 'Foil containers')
  const rej = request('fried-rice-r4', friedRice, ORG.r4, 'rejected', 'We can pick up at 6 pm.', n - 60 * M, 'Pickup time is after our closing; please request earlier.')
  audit(USER.d2, 'request_rejected', 'food_request', rej.id, friedRice.id, n - 45 * M, { receiver_org: 'Riverside Community Shelter' })

  const pulao = listing('pulao', ORG.d1, 'Vegetable Pulao', 'Lunch surplus, portioned into 30 sealed boxes.', 'cooked_meals', 'veg', 30, 'portions', 30, 'ambient', 3, -0.5, 2, 'reserved', 70, [], 'Sealed boxes')
  pickup('pulao', pulao, ORG.r1, USER.volunteer, 'assigned', n - 45 * M, null, null)
  const cups = listing('fruit-cups', ORG.d1, 'Fruit Salad Cups', 'Cut fruit cups from the juice counter, chilled.', 'fruits', 'vegan', 40, 'items', 40, 'refrigerated', 6, 0, 5, 'reserved', 50, [], 'Lidded cups')
  pickup('fruit-cups', cups, ORG.r1, null, 'scheduled', n - 30 * M, null, null)
  const sandwiches = listing('sandwiches', ORG.d1, 'Sandwich Trays', 'Veg sandwiches from a cancelled department event.', 'bakery', 'veg', 6, 'trays', 48, 'refrigerated', 4, -2, 3, 'collected', 150, ['gluten', 'dairy'], 'Covered trays')
  pickup('sandwiches', sandwiches, ORG.r1, USER.volunteer, 'collected', n - 2 * H, n - 30 * M, null)

  // Verified history (last 30 days)
  const templates: [string, Category, FoodListing['diet'], number, FoodListing['quantity_unit'], number, FoodListing['storage_requirement']][] = [
    ['Veg Meals Thali Surplus', 'cooked_meals', 'veg', 45, 'portions', 45, 'ambient'],
    ['Bread Loaves & Buns', 'bakery', 'veg', 10, 'kg', 40, 'ambient'],
    ['Banana & Papaya Mix', 'fruits', 'vegan', 18, 'kg', 36, 'ambient'],
    ['Seasonal Vegetables', 'vegetables', 'vegan', 30, 'kg', 60, 'ambient'],
    ['Curd Packs', 'dairy', 'veg', 20, 'litres', 40, 'refrigerated'],
    ['Egg Fried Rice', 'cooked_meals', 'non_veg', 35, 'portions', 35, 'ambient'],
    ['Biscuit & Snack Packets', 'packaged_food', 'veg', 90, 'packets', 45, 'ambient'],
    ['Buffet Veg Curries & Rice', 'cooked_meals', 'veg', 120, 'portions', 120, 'refrigerated'],
  ]
  const donors = [ORG.d1, ORG.d2, ORG.d3, ORG.d4]
  const vols = [USER.volunteer, USER.v2, USER.v3, USER.v4]
  const today = new Date(n)
  today.setUTCHours(0, 0, 0, 0)
  for (let i = 1; i <= 18; i++) {
    const t = templates[(i - 1) % 8]
    const day = today.getTime() - (29 - ((i * 5) % 29)) * 24 * H + 6 * H + i * 13 * M
    const l = listing(`history-${i}`, donors[(i - 1) % 4], t[0], 'Rescued surplus (demo history).', t[1], t[2], t[3], t[4], t[5], t[6], 8, 0, 6, 'completed', 30, [], null, day)
    pickup(`history-${i}`, l, i % 3 === 0 ? ORG.r2 : ORG.r1, i % 2 === 0 ? vols[(i / 2 - 1) % 4] : null, 'verified', day + 20 * M, day + 2 * H, day + 3 * H)
  }
  // Terminal outcomes
  const expired = listing('expired-curry', ORG.d2, 'Mixed Veg Curry', 'Not requested before its deadline (demo).', 'cooked_meals', 'veg', 25, 'portions', 25, 'ambient', -48, -51, -49, 'expired', 52 * 60)
  audit(null, 'listing_expired', 'food_listing', expired.id, expired.id, n - 48 * H, { title: expired.title })
  const cancelled = listing('cancelled-desserts', ORG.d4, 'Dessert Platters', 'Cancelled by the donor (demo).', 'other', 'veg', 10, 'trays', 60, 'refrigerated', -192, -193, -192.5, 'cancelled', 194 * 60, ['dairy', 'nuts'])
  audit(USER.d4, 'listing_cancelled', 'food_listing', cancelled.id, cancelled.id, n - 192 * H)

  const note = (user: string, type: string, title: string, body: string, link: string, agoMin: number) =>
    d.notifications.push({ id: uid(), user_id: user, type, title, body, link, read_at: null, created_at: iso(n - agoMin * M) })
  note(USER.donor, 'request_new', 'New food request', 'Community Food Collective requested "Idli & Sambar Breakfast".', '/requests', 20)
  note(USER.donor, 'request_new', 'New food request', 'Helping Hands Food Bank requested "Idli & Sambar Breakfast".', '/requests', 12)
  note(USER.receiver, 'request_accepted', 'Request accepted', 'Your request for "Vegetable Pulao" was accepted.', '/pickups', 45)
  note(USER.receiver, 'pickup_updated', 'Food collected', '"Sandwich Trays" was collected. Confirm receipt once it arrives.', '/pickups', 30)
  note(USER.volunteer, 'pickup_assigned', 'New pickup assigned', 'You have been assigned to collect "Vegetable Pulao".', '/pickups', 40)
  note(USER.admin, 'organization_pending', 'Organization awaiting review', 'Local Relief Network (receiver) is awaiting verification.', '/admin', 24 * 60)
  return d
}

// ---------------------------------------------------------------- helpers
function me(): Profile {
  const id = offlineUserId()
  const p = id ? db().profiles.find((x) => x.id === id) : undefined
  if (!p) throw new Error('Please sign in.')
  return p
}
const isMember = (org: string, user = offlineUserId()) => db().members.some((m) => m.org === org && m.user === user)
const orgById = (id: string) => db().orgs.find((o) => o.id === id) ?? null
const listingById = (id: string) => {
  const l = db().listings.find((x) => x.id === id)
  if (!l) throw new Error('Listing not found.')
  return l
}
const now = () => Date.now()

function withDonor(l: FoodListing): FoodListing {
  const o = orgById(l.donor_org_id)
  return { ...l, donor: o && { id: o.id, name: o.name, org_type: o.org_type, city: o.city, verification_status: o.verification_status, is_demo: o.is_demo } }
}
function joinRequest(r: FoodRequest): FoodRequest {
  const l = db().listings.find((x) => x.id === r.listing_id)
  return { ...r, listing: l ? withDonor(l) : null, receiver: orgById(r.receiver_org_id) }
}
function joinPickup(p: Pickup): Pickup {
  const v = p.volunteer_id ? db().profiles.find((x) => x.id === p.volunteer_id) : null
  return {
    ...p,
    listing: db().listings.find((x) => x.id === p.listing_id) ?? null,
    donor: orgById(p.donor_org_id),
    receiver: orgById(p.receiver_org_id),
    volunteer: v ? { id: v.id, full_name: v.full_name, phone: v.phone } : null,
  }
}
function notifyUser(user: string | null, type: string, title: string, body: string, link: string) {
  if (!user) return
  db().notifications.unshift({ id: uid(), user_id: user, type, title, body, link, read_at: null, created_at: iso(now()) })
}
function notifyOrg(org: string, type: string, title: string, body: string, link: string) {
  for (const m of db().members.filter((x) => x.org === org)) notifyUser(m.user, type, title, body, link)
}
function log(action: string, entity_type: string, entity_id: string, listing_id: string | null, metadata: Record<string, unknown> = {}) {
  const d = db()
  d.audit.push({ id: d.seq++, actor_id: offlineUserId(), action, entity_type, entity_id, listing_id, metadata, is_demo: true, created_at: iso(now()) })
}
function canSeePickup(p: Pickup, u: Profile) {
  return u.role === 'admin' || p.volunteer_id === u.id || isMember(p.donor_org_id, u.id) || isMember(p.receiver_org_id, u.id)
}
function canSeeListing(l: FoodListing, u: Profile | null) {
  if (effectiveStatus(l) === 'available') return true
  if (!u) return false
  if (u.role === 'admin' || isMember(l.donor_org_id, u.id)) return true
  return db().requests.some((r) => r.listing_id === l.id && isMember(r.receiver_org_id, u.id)) ||
    db().pickups.some((p) => p.listing_id === l.id && p.volunteer_id === u.id)
}
function currentOrNull() {
  try {
    return me()
  } catch {
    return null
  }
}
const PRE: PickupStatus[] = ['scheduled', 'assigned', 'en_route', 'arrived']

// ---------------------------------------------------------------- profile
export async function fetchProfile(userId: string) {
  return delay(db().profiles.find((p) => p.id === userId) ?? null)
}
export async function fetchOrganization(id: string) {
  return delay(orgById(id))
}
export async function updateProfile(id: string, values: { full_name: string; phone: string | null }) {
  if (id !== me().id) throw new Error('You can only edit your own profile.')
  Object.assign(db().profiles.find((p) => p.id === id)!, values)
  save()
}
export async function updateOrganization(id: string, values: Partial<Organization>) {
  if (!isMember(id)) throw new Error('Only the organization owner can update these details.')
  const o = orgById(id)!
  const { name, org_type, address, city, latitude, longitude, has_refrigeration, has_freezer, capacity_meals } = values
  Object.assign(o, Object.fromEntries(Object.entries({ name, org_type, address, city, latitude, longitude, has_refrigeration, has_freezer, capacity_meals }).filter(([, v]) => v !== undefined)))
  save()
}
export async function fetchOrganizations(kind?: 'donor' | 'receiver') {
  return delay(db().orgs.filter((o) => !kind || o.kind === kind).sort((a, b) => a.name.localeCompare(b.name)))
}

// --------------------------------------------------------------- listings
export async function fetchAvailableListings() {
  const t = now()
  return delay(
    db().listings.filter((l) => l.status === 'available' && Date.parse(l.safe_until) > t)
      .sort((a, b) => Date.parse(a.safe_until) - Date.parse(b.safe_until)).map(withDonor),
  )
}
export async function fetchOrgListings(orgId: string) {
  return delay(db().listings.filter((l) => l.donor_org_id === orgId).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(withDonor))
}
export async function fetchAllListings(limit = 200) {
  return delay([...db().listings].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit).map(withDonor))
}
export async function fetchListing(id: string) {
  const l = db().listings.find((x) => x.id === id)
  return delay(l && canSeeListing(l, currentOrNull()) ? withDonor(l) : null)
}
export async function createListing(values: ListingInput) {
  const u = me()
  if (u.role !== 'donor' || !isMember(values.donor_org_id)) throw new Error('Only donor organizations can create listings.')
  validateListing(values)
  const t = iso(now())
  const l: FoodListing = { ...values, id: uid(), created_by: u.id, status: 'available', moderation_note: null, is_demo: true, created_at: t, updated_at: t }
  db().listings.push(l)
  log('listing_created', 'food_listing', l.id, l.id, { title: l.title })
  save()
  return { id: l.id }
}
function validateListing(v: Omit<ListingInput, 'donor_org_id'>) {
  const t = now()
  if (Date.parse(v.safe_until) <= t) throw new Error('The safe-use deadline must be in the future.')
  if (Date.parse(v.pickup_end) <= t) throw new Error('The pickup window must end in the future.')
  if (Date.parse(v.pickup_start) >= Date.parse(v.pickup_end)) throw new Error('The pickup window must end after it starts.')
  if (Date.parse(v.pickup_end) > Date.parse(v.safe_until)) throw new Error('The pickup window cannot extend beyond the safe-use deadline.')
  if (!(v.quantity > 0) || !(v.estimated_meals > 0)) throw new Error('Quantity and meals must be greater than zero.')
  if (!v.handling_confirmed) throw new Error('You must confirm safe handling and storage.')
}
export async function updateListing(id: string, values: Omit<ListingInput, 'donor_org_id'>) {
  const l = listingById(id)
  if (!isMember(l.donor_org_id) || l.status !== 'available') throw new Error('This listing can no longer be edited (it may have been reserved or closed).')
  validateListing(values)
  Object.assign(l, values, { updated_at: iso(now()) })
  log('listing_updated', 'food_listing', l.id, l.id, { title: l.title })
  save()
}
export async function cancelListing(id: string, reason?: string) {
  const l = listingById(id)
  if (!isMember(l.donor_org_id)) throw new Error('Only the donor organization can cancel this listing.')
  if (!['available', 'reserved'].includes(l.status)) throw new Error(`A ${l.status} listing cannot be cancelled.`)
  l.status = 'cancelled'
  for (const r of db().requests.filter((x) => x.listing_id === id && ['pending', 'accepted'].includes(x.status))) {
    r.status = 'cancelled'
    r.decision_note = 'Listing cancelled by donor'
    notifyOrg(r.receiver_org_id, 'listing_cancelled', 'Listing cancelled', `"${l.title}" was cancelled by the donor.`, '/requests')
  }
  for (const p of db().pickups.filter((x) => x.listing_id === id && PRE.includes(x.status))) {
    p.status = 'cancelled'
    p.cancelled_at = iso(now())
    notifyUser(p.volunteer_id, 'pickup_updated', 'Pickup cancelled', `The pickup for "${l.title}" was cancelled by the donor.`, '/pickups')
  }
  log('listing_cancelled', 'food_listing', id, id, { reason: reason || null })
  save()
}

// --------------------------------------------------------------- requests
export async function fetchRequests() {
  const u = me()
  return delay(
    db().requests.filter((r) => {
      const l = db().listings.find((x) => x.id === r.listing_id)
      return u.role === 'admin' || isMember(r.receiver_org_id, u.id) || (l && isMember(l.donor_org_id, u.id))
    }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(joinRequest),
  )
}
export async function fetchListingRequests(listingId: string) {
  const u = currentOrNull()
  const l = db().listings.find((x) => x.id === listingId)
  if (!u || !l) return delay([] as FoodRequest[])
  const donor = isMember(l.donor_org_id, u.id) || u.role === 'admin'
  return delay(
    db().requests.filter((r) => r.listing_id === listingId && (donor || isMember(r.receiver_org_id, u.id)))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).map(joinRequest),
  )
}
export async function requestListing(listingId: string, message: string) {
  const u = me()
  if (u.role !== 'receiver' || !u.organization_id) throw new Error('Only receiver organizations can request food.')
  const org = orgById(u.organization_id)!
  if (org.verification_status !== 'verified') throw new Error('Your organization must be verified by an administrator before requesting food.')
  const l = listingById(listingId)
  const m = evaluateMatch(l, org, now())
  if (!m.eligible) throw new Error(`Not eligible: ${m.blockers.join('; ')}.`)
  if (db().requests.some((r) => r.listing_id === listingId && r.receiver_org_id === org.id && ['pending', 'accepted'].includes(r.status)))
    throw new Error('Your organization already has an open request for this listing.')
  const r: FoodRequest = {
    id: uid(), listing_id: l.id, receiver_org_id: org.id, requested_by: u.id, requested_quantity: l.quantity,
    message: message || null, status: 'pending', distance_km: m.distanceKm, decision_note: null, decided_at: null, is_demo: true, created_at: iso(now()),
  }
  db().requests.push(r)
  notifyOrg(l.donor_org_id, 'request_new', 'New food request', `${org.name} requested "${l.title}".`, '/requests')
  log('request_submitted', 'food_request', r.id, l.id, { receiver_org: org.name })
  save()
  return r.id
}
export async function respondToRequest(requestId: string, accept: boolean, note?: string) {
  const r = db().requests.find((x) => x.id === requestId)
  if (!r) throw new Error('Request not found.')
  const l = listingById(r.listing_id)
  if (!isMember(l.donor_org_id)) throw new Error('Only the donor organization can respond to this request.')
  if (r.status !== 'pending') throw new Error(`This request has already been ${r.status}.`)
  const org = orgById(r.receiver_org_id)!
  r.decided_at = iso(now())
  r.decision_note = note || null
  if (!accept) {
    r.status = 'rejected'
    notifyOrg(r.receiver_org_id, 'request_rejected', 'Request declined', `Your request for "${l.title}" was declined.`, '/requests')
    log('request_rejected', 'food_request', r.id, l.id, { receiver_org: org.name })
    save()
    return { status: 'rejected' }
  }
  if (effectiveStatus(l) !== 'available' || Date.parse(l.pickup_end) <= now()) throw new Error('This listing is reserved, closed or past its pickup window.')
  r.status = 'accepted'
  l.status = 'reserved'
  const p: Pickup = {
    id: uid(), listing_id: l.id, request_id: r.id, donor_org_id: l.donor_org_id, receiver_org_id: r.receiver_org_id, volunteer_id: null,
    status: 'scheduled', assigned_at: null, en_route_at: null, arrived_at: null, collected_at: null, verified_at: null, cancelled_at: null,
    is_demo: true, created_at: iso(now()), updated_at: iso(now()),
  }
  db().pickups.push(p)
  for (const o of db().requests.filter((x) => x.listing_id === l.id && x.status === 'pending' && x.id !== r.id)) {
    o.status = 'rejected'
    o.decision_note = 'Another organization was selected for this listing.'
    o.decided_at = iso(now())
    notifyOrg(o.receiver_org_id, 'request_rejected', 'Request not selected', `"${l.title}" was reserved by another organization.`, '/requests')
    log('request_rejected', 'food_request', o.id, l.id, { reason: 'another_request_accepted' })
  }
  notifyOrg(r.receiver_org_id, 'request_accepted', 'Request accepted', `Your request for "${l.title}" was accepted.`, '/pickups')
  log('request_accepted', 'food_request', r.id, l.id, { receiver_org: org.name })
  save()
  return { status: 'accepted', pickup_id: p.id }
}
export async function cancelRequest(requestId: string) {
  const r = db().requests.find((x) => x.id === requestId)
  if (!r) throw new Error('Request not found.')
  if (!isMember(r.receiver_org_id)) throw new Error('Only the requesting organization can cancel this request.')
  if (!['pending', 'accepted'].includes(r.status)) throw new Error(`This request is already ${r.status}.`)
  const l = listingById(r.listing_id)
  if (r.status === 'accepted') {
    const p = db().pickups.find((x) => x.request_id === r.id)!
    if (!PRE.includes(p.status)) throw new Error('This pickup has already been collected and cannot be cancelled.')
    p.status = 'cancelled'
    p.cancelled_at = iso(now())
    l.status = Date.parse(l.safe_until) > now() && Date.parse(l.pickup_end) > now() ? 'available' : 'expired'
    for (const c of db().codes.filter((c) => c.pickup_id === p.id && !c.used_at)) c.invalidated = true
  }
  r.status = 'cancelled'
  notifyOrg(l.donor_org_id, 'request_cancelled', 'Request withdrawn', `A receiver withdrew its request for "${l.title}".`, `/listings/${l.id}`)
  log('request_cancelled', 'food_request', r.id, l.id)
  save()
}

// ---------------------------------------------------------------- pickups
export async function fetchPickups() {
  const u = me()
  return delay(db().pickups.filter((p) => canSeePickup(p, u)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(joinPickup))
}
export async function fetchListingPickup(listingId: string) {
  const u = currentOrNull()
  const p = u ? [...db().pickups].reverse().find((x) => x.listing_id === listingId && canSeePickup(x, u)) : undefined
  return delay(p ? joinPickup(p) : null)
}
export async function listVolunteers() {
  const u = me()
  if (u.role !== 'receiver' && u.role !== 'admin') throw new Error('Only receiver organizations can view volunteers.')
  return delay(db().profiles.filter((p) => p.role === 'volunteer').map((p) => ({ id: p.id, full_name: p.full_name })))
}
function pickupFor(id: string) {
  const p = db().pickups.find((x) => x.id === id)
  if (!p) throw new Error('Pickup not found.')
  return { p, l: listingById(p.listing_id) }
}
export async function assignVolunteer(pickupId: string, volunteerId: string | null) {
  const { p, l } = pickupFor(pickupId)
  if (!isMember(p.receiver_org_id)) throw new Error('Only the receiving organization can assign volunteers.')
  if (!['scheduled', 'assigned'].includes(p.status)) throw new Error('Volunteers can only be changed before the pickup is under way.')
  const prev = p.volunteer_id
  p.volunteer_id = volunteerId
  p.status = volunteerId ? 'assigned' : 'scheduled'
  p.assigned_at = volunteerId ? iso(now()) : null
  if (volunteerId) notifyUser(volunteerId, 'pickup_assigned', 'New pickup assigned', `You have been assigned to collect "${l.title}".`, '/pickups')
  else notifyUser(prev, 'pickup_updated', 'Pickup unassigned', `You were removed from the pickup for "${l.title}".`, '/pickups')
  log('pickup_assigned', 'pickup', p.id, l.id, { volunteer_id: volunteerId })
  save()
}
export async function updatePickupProgress(pickupId: string, status: 'en_route' | 'arrived') {
  const { p, l } = pickupFor(pickupId)
  const uidNow = offlineUserId()
  if (!(p.volunteer_id === uidNow || (!p.volunteer_id && isMember(p.receiver_org_id)))) throw new Error('Only the assigned collector can update this pickup.')
  if (Date.parse(l.safe_until) <= now()) throw new Error('This listing has passed its safe-use deadline.')
  if (status === 'en_route' && ['scheduled', 'assigned'].includes(p.status)) p.en_route_at = iso(now())
  else if (status === 'arrived' && ['scheduled', 'assigned', 'en_route'].includes(p.status)) p.arrived_at = iso(now())
  else throw new Error(`Cannot move a ${p.status} pickup to ${status}.`)
  p.status = status
  notifyOrg(p.donor_org_id, 'pickup_updated', 'Pickup update', `Collector for "${l.title}" is ${status.replace('_', ' ')}.`, '/pickups')
  log('pickup_status_updated', 'pickup', p.id, l.id, { status })
  save()
}
export async function generateHandoverCode(pickupId: string) {
  const { p, l } = pickupFor(pickupId)
  if (!isMember(p.donor_org_id)) throw new Error('Only the donor organization can generate a handover code.')
  if (!PRE.includes(p.status)) throw new Error(`A handover code cannot be generated for a ${p.status} pickup.`)
  if (Date.parse(l.safe_until) <= now()) throw new Error('This listing has passed its safe-use deadline.')
  for (const c of db().codes.filter((c) => c.pickup_id === p.id && !c.used_at)) c.invalidated = true
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  const code = String(buf[0] % 1_000_000).padStart(6, '0')
  const expires_at = iso(Math.min(now() + 30 * 60_000, Date.parse(l.safe_until)))
  db().codes.push({ pickup_id: p.id, code, expires_at, attempts: 0, used_at: null, invalidated: false })
  log('handover_code_generated', 'pickup', p.id, l.id)
  save()
  return { code, expires_at }
}
export async function verifyHandoverCode(pickupId: string, code: string): Promise<VerifyResult> {
  const { p, l } = pickupFor(pickupId)
  if (!(p.volunteer_id === offlineUserId() || isMember(p.receiver_org_id))) throw new Error('Only the assigned volunteer or the receiving organization can verify this handover.')
  if (p.status === 'collected' || p.status === 'verified') return { ok: false, reason: 'already_completed', message: 'This handover has already been verified. Codes cannot be reused.' }
  if (!PRE.includes(p.status)) return { ok: false, reason: 'invalid_state', message: `This pickup is ${p.status}.` }
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'format', message: 'Enter the 6-digit code.' }
  const c = [...db().codes].reverse().find((x) => x.pickup_id === p.id && !x.used_at && !x.invalidated)
  if (!c) return { ok: false, reason: 'no_active_code', message: 'No active code. Ask the donor to generate a handover code.' }
  if (Date.parse(c.expires_at) <= now()) return { ok: false, reason: 'expired', message: 'This code has expired. Ask the donor to generate a new one.' }
  if (c.attempts >= 5) return { ok: false, reason: 'locked', message: 'Too many incorrect attempts. Ask the donor to generate a new code.' }
  if (c.code !== code) {
    c.attempts++
    log('handover_verification_failed', 'pickup', p.id, l.id, { attempt: c.attempts })
    save()
    return { ok: false, reason: 'mismatch', message: 'Incorrect code.', attempts_remaining: 5 - c.attempts }
  }
  c.used_at = iso(now())
  p.status = 'collected'
  p.collected_at = iso(now())
  l.status = 'collected'
  notifyOrg(p.donor_org_id, 'pickup_updated', 'Handover verified', `"${l.title}" was collected (simulated).`, '/pickups')
  notifyOrg(p.receiver_org_id, 'pickup_updated', 'Food collected', `"${l.title}" was collected. Confirm receipt once it arrives.`, '/pickups')
  log('collection_recorded', 'pickup', p.id, l.id, { method: 'handover_code' })
  save()
  return { ok: true, status: 'collected', message: 'Handover verified (offline demo simulation). Food marked as collected.' }
}
export async function confirmReceipt(pickupId: string) {
  const { p, l } = pickupFor(pickupId)
  if (!isMember(p.receiver_org_id)) throw new Error('Only the receiving organization can confirm receipt.')
  if (p.status !== 'collected') throw new Error(`Receipt can only be confirmed after a verified handover (pickup is ${p.status}).`)
  p.status = 'verified'
  p.verified_at = iso(now())
  l.status = 'completed'
  notifyOrg(p.donor_org_id, 'pickup_verified', 'Rescue confirmed (demo)', `"${l.title}" receipt confirmed in the offline demo.`, '/impact')
  notifyUser(p.volunteer_id, 'pickup_verified', 'Delivery confirmed (demo)', `Delivery of "${l.title}" was confirmed.`, '/pickups')
  log('verification_completed', 'pickup', p.id, l.id, { meals: l.estimated_meals })
  save()
}

// ---------------------------------------------------------- notifications
export async function fetchNotifications(limit = 50) {
  const id = offlineUserId()
  return delay(db().notifications.filter((n) => n.user_id === id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit))
}
export async function markNotificationRead(id: string) {
  const n = db().notifications.find((x) => x.id === id && x.user_id === offlineUserId())
  if (n) n.read_at = iso(now())
  save()
}
export async function markAllNotificationsRead() {
  for (const n of db().notifications.filter((x) => x.user_id === offlineUserId() && !x.read_at)) n.read_at = iso(now())
  save()
}

// ------------------------------------------------------ impact / activity
export async function getImpactStats(scope: 'mine' | 'platform'): Promise<ImpactStats> {
  const u = me()
  const d = db()
  const platform = scope === 'platform' || u.role === 'admin'
  const scoped = d.listings.filter((l) => {
    if (platform) return true
    if (u.role === 'donor') return l.donor_org_id === u.organization_id
    if (u.role === 'receiver') return d.pickups.some((p) => p.listing_id === l.id && p.receiver_org_id === u.organization_id)
    if (u.role === 'volunteer') return d.pickups.some((p) => p.listing_id === l.id && p.volunteer_id === u.id)
    return false
  })
  const t = now()
  const verified = scoped
    .filter((l) => l.status === 'completed')
    .map((l) => ({ l, p: d.pickups.find((p) => p.listing_id === l.id && p.status === 'verified') }))
    .filter((x): x is { l: FoodListing; p: Pickup } => !!x.p)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const overdue = (l: FoodListing) => ['available', 'reserved'].includes(l.status) && Date.parse(l.safe_until) <= t
  const closed = scoped.filter((l) => ['completed', 'expired', 'cancelled', 'removed'].includes(l.status) || overdue(l)).length
  const kg = sum(verified.filter((v) => v.l.quantity_unit === 'kg').map((v) => Number(v.l.quantity)))
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const days = Array.from({ length: 30 }, (_, i) => day(t - (29 - i) * 86_400_000))
  const status_distribution = new Map<ListingStatus, number>()
  for (const l of scoped) {
    const s = effectiveStatus(l, t)
    status_distribution.set(s, (status_distribution.get(s) ?? 0) + 1)
  }
  const cats = new Map<Category, { listings: number; verified_meals: number }>()
  for (const l of scoped) {
    const c = cats.get(l.category) ?? { listings: 0, verified_meals: 0 }
    c.listings++
    if (l.status === 'completed') c.verified_meals += l.estimated_meals
    cats.set(l.category, c)
  }
  const donors = new Map<string, { listings: number; verified_meals: number }>()
  for (const l of scoped) {
    const c = donors.get(l.donor_org_id) ?? { listings: 0, verified_meals: 0 }
    c.listings++
    if (l.status === 'completed') c.verified_meals += l.estimated_meals
    donors.set(l.donor_org_id, c)
  }
  return delay({
    scope: platform ? 'platform' : 'mine',
    total_listings: scoped.length,
    listed_meals: sum(scoped.map((l) => l.estimated_meals)),
    collected_meals: sum(scoped.filter((l) => ['collected', 'completed'].includes(l.status)).map((l) => l.estimated_meals)),
    verified_meals: sum(verified.map((v) => v.l.estimated_meals)),
    verified_kg: kg,
    verified_litres: sum(verified.filter((v) => v.l.quantity_unit === 'litres').map((v) => Number(v.l.quantity))),
    co2e_kg_estimate: Math.round(kg * 2.5 * 10) / 10,
    co2e_factor: 2.5,
    expired_listings: scoped.filter((l) => l.status === 'expired' || overdue(l)).length,
    cancelled_listings: scoped.filter((l) => l.status === 'cancelled').length,
    active_listings: scoped.filter((l) => l.status === 'available' && Date.parse(l.safe_until) > t).length,
    in_progress: scoped.filter((l) => l.status === 'collected' || (l.status === 'reserved' && Date.parse(l.safe_until) > t)).length,
    successful_pickups: verified.length,
    completion_rate: closed ? Math.round((verified.length / closed) * 1000) / 10 : null,
    demo_listings: scoped.length,
    timeseries: days.map((dd) => ({
      day: dd,
      verified_meals: sum(verified.filter((v) => v.p.verified_at?.slice(0, 10) === dd).map((v) => v.l.estimated_meals)),
      listed_meals: sum(scoped.filter((l) => l.created_at.slice(0, 10) === dd).map((l) => l.estimated_meals)),
    })),
    categories: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.verified_meals - a.verified_meals),
    status_distribution: [...status_distribution.entries()].map(([status, count]) => ({ status, count })),
    top_donors: [...donors.entries()]
      .map(([id, v]) => ({ name: orgById(id)?.name ?? 'Donor', ...v }))
      .sort((a, b) => b.verified_meals - a.verified_meals || b.listings - a.listings)
      .slice(0, 6),
  })
}
function visibleAudit(u: Profile) {
  return db().audit.filter((e) => {
    if (u.role === 'admin' || e.actor_id === u.id) return true
    if (!e.listing_id) return false
    const l = db().listings.find((x) => x.id === e.listing_id)
    return !!l && l.status !== 'available' ? canSeeListing(l, u) : !!l && isMember(l.donor_org_id, u.id)
  })
}
export async function fetchListingAudit(listingId: string) {
  const u = currentOrNull()
  return delay(u ? visibleAudit(u).filter((e) => e.listing_id === listingId).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) : [])
}
export async function fetchRecentActivity(limit = 10) {
  return delay(visibleAudit(me()).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit))
}
export async function syncExpiry() {
  const t = now()
  let changed = false
  for (const l of db().listings.filter((x) => ['available', 'reserved'].includes(x.status) && Date.parse(x.safe_until) <= t)) {
    l.status = 'expired'
    for (const p of db().pickups.filter((p) => p.listing_id === l.id && PRE.includes(p.status))) p.status = 'expired'
    for (const r of db().requests.filter((r) => r.listing_id === l.id && r.status === 'pending')) {
      r.status = 'cancelled'
      r.decision_note = 'Listing expired before collection'
    }
    notifyOrg(l.donor_org_id, 'listing_expired', 'Listing expired', `"${l.title}" passed its safe-use deadline without being collected.`, `/listings/${l.id}`)
    db().audit.push({ id: db().seq++, actor_id: null, action: 'listing_expired', entity_type: 'food_listing', entity_id: l.id, listing_id: l.id, metadata: { title: l.title }, is_demo: true, created_at: iso(t) })
    changed = true
  }
  if (changed) save()
}

// ------------------------------------------------------------------ admin
function requireAdmin() {
  if (me().role !== 'admin') throw new Error('Administrator access required.')
}
export async function setOrgVerification(orgId: string, status: 'verified' | 'rejected' | 'pending', note?: string) {
  requireAdmin()
  const o = orgById(orgId)
  if (!o) throw new Error('Organization not found.')
  o.verification_status = status
  o.verification_note = note || null
  notifyOrg(o.id, 'organization_verification', status === 'verified' ? 'Organization verified' : 'Verification updated', `${o.name}: ${status}.`, '/profile')
  log(`organization_${status}`, 'organization', o.id, null, { name: o.name, note })
  save()
}
export async function removeListing(listingId: string, note: string) {
  requireAdmin()
  const l = listingById(listingId)
  if (!['available', 'reserved'].includes(l.status)) throw new Error(`Only open listings can be removed (this one is ${l.status}).`)
  l.status = 'removed'
  l.moderation_note = note
  for (const r of db().requests.filter((x) => x.listing_id === l.id && ['pending', 'accepted'].includes(x.status))) {
    r.status = 'cancelled'
    r.decision_note = 'Listing removed by moderator'
  }
  for (const p of db().pickups.filter((x) => x.listing_id === l.id && PRE.includes(x.status))) p.status = 'cancelled'
  notifyOrg(l.donor_org_id, 'listing_removed', 'Listing removed by moderator', `"${l.title}" was removed. Note: ${note}`, `/listings/${l.id}`)
  log('listing_removed', 'food_listing', l.id, l.id, { note })
  save()
}
export async function fetchAuditEvents(limit = 100) {
  requireAdmin()
  return delay([...db().audit].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit))
}
export async function fetchProfiles() {
  return delay(db().profiles)
}
