import { supabase } from './supabase'
import type {
  AppNotification,
  AuditEvent,
  FoodListing,
  FoodRequest,
  ImpactStats,
  Organization,
  Pickup,
  Profile,
  VerifyResult,
} from './types'

type Result<T> = { data: T | null; error: { message: string } | null }

function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

export function friendlyError(message: string): string {
  if (/JWT expired|invalid JWT/i.test(message)) return 'Your session has expired. Please sign in again.'
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Network error — check your connection and try again.'
  if (/row-level security/i.test(message)) return 'You do not have permission to perform this action.'
  if (/permission denied/i.test(message)) return 'You do not have permission to perform this action.'
  if (/pickup_within_safe_deadline/.test(message)) return 'The pickup window cannot extend beyond the safe-use deadline.'
  if (/pickup_window_order/.test(message)) return 'The pickup window must end after it starts.'
  return message
}

const DONOR_EMBED = 'donor:organizations!food_listings_donor_org_id_fkey(id, name, org_type, city, verification_status, is_demo)'
const LISTING_SELECT = `*, ${DONOR_EMBED}`
// Columns anonymous visitors may read (must match the anon grant in migration 20261027000006).
export const PUBLIC_LISTING_COLUMNS =
  'id, donor_org_id, title, description, category, diet, quantity, quantity_unit, estimated_meals, prepared_at, safe_until, pickup_start, pickup_end, storage_requirement, packaging, allergens, pickup_address, latitude, longitude, max_radius_km, status, handling_confirmed, is_demo, created_at, updated_at'
const PUBLIC_LISTING_SELECT = `${PUBLIC_LISTING_COLUMNS}, ${DONOR_EMBED}`
const REQUEST_SELECT = `*, listing:food_listings!food_requests_listing_id_fkey(${LISTING_SELECT}), receiver:organizations!food_requests_receiver_org_id_fkey(*)`
const PICKUP_SELECT = `*, listing:food_listings!pickups_listing_id_fkey(*),
  donor:organizations!pickups_donor_org_id_fkey(*),
  receiver:organizations!pickups_receiver_org_id_fkey(*),
  volunteer:profiles!pickups_volunteer_id_fkey(id, full_name, phone)`

// ---------------------------------------------------------------- profile
export async function fetchProfile(userId: string) {
  return unwrap<Profile | null>(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle())
}

export async function fetchOrganization(id: string) {
  return unwrap<Organization | null>(await supabase.from('organizations').select('*').eq('id', id).maybeSingle())
}

export async function updateProfile(id: string, values: { full_name: string; phone: string | null }) {
  unwrap(await supabase.from('profiles').update(values).eq('id', id))
}

export async function updateOrganization(
  id: string,
  values: Partial<
    Pick<
      Organization,
      'name' | 'org_type' | 'address' | 'city' | 'latitude' | 'longitude' | 'has_refrigeration' | 'has_freezer' | 'capacity_meals'
    >
  >,
) {
  const data = unwrap<Organization[]>(await supabase.from('organizations').update(values).eq('id', id).select())
  if (!data.length) throw new Error('Only the organization owner can update these details.')
}

export async function fetchOrganizations(kind?: 'donor' | 'receiver') {
  let q = supabase.from('organizations').select('*').order('name')
  if (kind) q = q.eq('kind', kind)
  return unwrap<Organization[]>(await q)
}

// --------------------------------------------------------------- listings
export async function fetchAvailableListings() {
  // Explicit public column list (anon grant); the response is shaped like FoodListing minus internal fields.
  const res = await supabase
    .from('food_listings')
    .select(PUBLIC_LISTING_SELECT)
    .eq('status', 'available')
    .gt('safe_until', new Date().toISOString())
    .order('safe_until', { ascending: true })
  return unwrap(res as unknown as Result<FoodListing[]>)
}

export async function fetchOrgListings(orgId: string) {
  return unwrap<FoodListing[]>(
    await supabase.from('food_listings').select(LISTING_SELECT).eq('donor_org_id', orgId).order('created_at', { ascending: false }),
  )
}

export async function fetchAllListings(limit = 200) {
  return unwrap<FoodListing[]>(
    await supabase.from('food_listings').select(LISTING_SELECT).order('created_at', { ascending: false }).limit(limit),
  )
}

export async function fetchListing(id: string) {
  return unwrap<FoodListing | null>(await supabase.from('food_listings').select(LISTING_SELECT).eq('id', id).maybeSingle())
}

export type ListingInput = Omit<
  FoodListing,
  | 'id'
  | 'created_by'
  | 'status'
  | 'moderation_note'
  | 'is_demo'
  | 'created_at'
  | 'updated_at'
  | 'donor'
>

export async function createListing(values: ListingInput) {
  return unwrap<{ id: string }>(await supabase.from('food_listings').insert(values).select('id').single())
}

export async function updateListing(id: string, values: Omit<ListingInput, 'donor_org_id'>) {
  const data = unwrap<{ id: string }[]>(await supabase.from('food_listings').update(values).eq('id', id).select('id'))
  if (!data.length) throw new Error('This listing can no longer be edited (it may have been reserved or closed).')
}

export async function cancelListing(id: string, reason?: string) {
  unwrap(await supabase.rpc('cancel_listing', { p_listing_id: id, p_reason: reason ?? null }))
}

// --------------------------------------------------------------- requests
export async function fetchRequests() {
  return unwrap<FoodRequest[]>(
    await supabase.from('food_requests').select(REQUEST_SELECT).order('created_at', { ascending: false }),
  )
}

export async function fetchListingRequests(listingId: string) {
  return unwrap<FoodRequest[]>(
    await supabase
      .from('food_requests')
      .select(`*, receiver:organizations!food_requests_receiver_org_id_fkey(*)`)
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true }),
  )
}

export async function requestListing(listingId: string, message: string) {
  return unwrap<string>(await supabase.rpc('request_listing', { p_listing_id: listingId, p_message: message || null }))
}

export async function respondToRequest(requestId: string, accept: boolean, note?: string) {
  return unwrap<{ status: string; pickup_id?: string }>(
    await supabase.rpc('respond_to_request', { p_request_id: requestId, p_accept: accept, p_note: note ?? null }),
  )
}

export async function cancelRequest(requestId: string) {
  unwrap(await supabase.rpc('cancel_request', { p_request_id: requestId }))
}

// ---------------------------------------------------------------- pickups
export async function fetchPickups() {
  return unwrap<Pickup[]>(await supabase.from('pickups').select(PICKUP_SELECT).order('created_at', { ascending: false }))
}

export async function fetchListingPickup(listingId: string) {
  return unwrap<Pickup | null>(
    await supabase
      .from('pickups')
      .select(PICKUP_SELECT)
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
}

export async function listVolunteers() {
  return unwrap<{ id: string; full_name: string }[]>(await supabase.rpc('list_volunteers'))
}

export async function assignVolunteer(pickupId: string, volunteerId: string | null) {
  unwrap(await supabase.rpc('assign_volunteer', { p_pickup_id: pickupId, p_volunteer_id: volunteerId }))
}

export async function updatePickupProgress(pickupId: string, status: 'en_route' | 'arrived') {
  unwrap(await supabase.rpc('update_pickup_progress', { p_pickup_id: pickupId, p_status: status }))
}

export async function generateHandoverCode(pickupId: string) {
  return unwrap<{ code: string; expires_at: string }>(await supabase.rpc('generate_handover_code', { p_pickup_id: pickupId }))
}

export async function verifyHandoverCode(pickupId: string, code: string) {
  return unwrap<VerifyResult>(await supabase.rpc('verify_handover_code', { p_pickup_id: pickupId, p_code: code }))
}

export async function confirmReceipt(pickupId: string) {
  unwrap(await supabase.rpc('confirm_receipt', { p_pickup_id: pickupId }))
}

// ---------------------------------------------------------- notifications
export async function fetchNotifications(limit = 50) {
  return unwrap<AppNotification[]>(
    await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit),
  )
}

export async function markNotificationRead(id: string) {
  unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id))
}

export async function markAllNotificationsRead() {
  unwrap(
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null),
  )
}

// ------------------------------------------------------ impact / activity
export async function getImpactStats(scope: 'mine' | 'platform') {
  return unwrap<ImpactStats>(await supabase.rpc('get_impact_stats', { p_scope: scope }))
}

export async function fetchListingAudit(listingId: string) {
  return unwrap<AuditEvent[]>(
    await supabase.from('audit_events').select('*').eq('listing_id', listingId).order('created_at', { ascending: true }),
  )
}

export async function fetchRecentActivity(limit = 10) {
  return unwrap<AuditEvent[]>(
    await supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(limit),
  )
}

/** Opportunistic expiry synchronisation; failures are non-fatal. */
export async function syncExpiry() {
  const { error } = await supabase.rpc('sync_expiry')
  if (error) console.warn('sync_expiry failed:', error.message)
}

// ------------------------------------------------------------------ admin
export async function setOrgVerification(orgId: string, status: 'verified' | 'rejected' | 'pending', note?: string) {
  unwrap(await supabase.rpc('admin_set_org_verification', { p_org_id: orgId, p_status: status, p_note: note ?? null }))
}

export async function removeListing(listingId: string, note: string) {
  unwrap(await supabase.rpc('admin_remove_listing', { p_listing_id: listingId, p_note: note }))
}

export async function fetchAuditEvents(limit = 100) {
  return unwrap<AuditEvent[]>(
    await supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(limit),
  )
}

export async function fetchProfiles() {
  return unwrap<Profile[]>(await supabase.from('profiles').select('*').order('created_at', { ascending: false }))
}
