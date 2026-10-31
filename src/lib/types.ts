export type Role = 'donor' | 'receiver' | 'volunteer' | 'admin'
export type OrgKind = 'donor' | 'receiver'
export type OrgType =
  | 'restaurant'
  | 'canteen'
  | 'grocery'
  | 'banquet_hall'
  | 'community_kitchen'
  | 'ngo'
  | 'food_bank'
  | 'community_org'
  | 'other'
export type VerificationStatus = 'pending' | 'verified' | 'rejected'
export type Category = 'cooked_meals' | 'bakery' | 'fruits' | 'vegetables' | 'packaged_food' | 'dairy' | 'other'
export type Diet = 'veg' | 'non_veg' | 'vegan'
export type QuantityUnit = 'kg' | 'portions' | 'packets' | 'trays' | 'litres' | 'items'
export type Storage = 'ambient' | 'refrigerated' | 'frozen'
export type ListingStatus = 'available' | 'reserved' | 'collected' | 'completed' | 'expired' | 'cancelled' | 'removed'
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'
export type PickupStatus =
  | 'scheduled'
  | 'assigned'
  | 'en_route'
  | 'arrived'
  | 'collected'
  | 'verified'
  | 'cancelled'
  | 'expired'

export interface Organization {
  id: string
  name: string
  kind: OrgKind
  org_type: OrgType
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  has_refrigeration: boolean
  has_freezer: boolean
  capacity_meals: number
  verification_status: VerificationStatus
  verification_note: string | null
  is_demo: boolean
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: Role
  organization_id: string | null
  is_demo: boolean
  created_at: string
}

export interface FoodListing {
  id: string
  donor_org_id: string
  created_by: string | null
  title: string
  description: string | null
  category: Category
  diet: Diet
  quantity: number
  quantity_unit: QuantityUnit
  estimated_meals: number
  prepared_at: string | null
  safe_until: string
  pickup_start: string
  pickup_end: string
  storage_requirement: Storage
  packaging: string | null
  allergens: string[]
  pickup_address: string
  latitude: number
  longitude: number
  max_radius_km: number
  status: ListingStatus
  handling_confirmed: boolean
  moderation_note: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
  donor?: Pick<Organization, 'id' | 'name' | 'org_type' | 'city' | 'verification_status' | 'is_demo'> | null
}

export interface FoodRequest {
  id: string
  listing_id: string
  receiver_org_id: string
  requested_by: string | null
  requested_quantity: number
  message: string | null
  status: RequestStatus
  distance_km: number | null
  decision_note: string | null
  decided_at: string | null
  is_demo: boolean
  created_at: string
  listing?: FoodListing | null
  receiver?: Organization | null
}

export interface Pickup {
  id: string
  listing_id: string
  request_id: string
  donor_org_id: string
  receiver_org_id: string
  volunteer_id: string | null
  status: PickupStatus
  assigned_at: string | null
  en_route_at: string | null
  arrived_at: string | null
  collected_at: string | null
  verified_at: string | null
  cancelled_at: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
  listing?: FoodListing | null
  donor?: Organization | null
  receiver?: Organization | null
  volunteer?: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
}

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface AuditEvent {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  listing_id: string | null
  metadata: Record<string, unknown>
  is_demo: boolean
  created_at: string
}

export interface ImpactStats {
  scope: 'mine' | 'platform'
  total_listings: number
  listed_meals: number
  collected_meals: number
  verified_meals: number
  verified_kg: number
  verified_litres: number
  co2e_kg_estimate: number
  co2e_factor: number
  expired_listings: number
  cancelled_listings: number
  active_listings: number
  in_progress: number
  successful_pickups: number
  completion_rate: number | null
  demo_listings: number
  timeseries: { day: string; verified_meals: number; listed_meals: number }[]
  categories: { category: Category; verified_meals: number; listings: number }[]
  status_distribution: { status: ListingStatus; count: number }[]
  top_donors: { name: string; listings: number; verified_meals: number }[]
}

export interface VerifyResult {
  ok: boolean
  reason?: string
  message: string
  status?: string
  attempts_remaining?: number
}
