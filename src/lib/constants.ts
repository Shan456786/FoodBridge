import type { Category, Diet, ListingStatus, OrgType, PickupStatus, QuantityUnit, RequestStatus, Role, Storage } from './types'

export const CATEGORY_LABELS: Record<Category, string> = {
  cooked_meals: 'Cooked meals',
  bakery: 'Bakery',
  fruits: 'Fruits',
  vegetables: 'Vegetables',
  packaged_food: 'Packaged food',
  dairy: 'Dairy',
  other: 'Other',
}

export const DIET_LABELS: Record<Diet, string> = { veg: 'Vegetarian', non_veg: 'Non-vegetarian', vegan: 'Vegan' }

export const UNIT_LABELS: Record<QuantityUnit, string> = {
  kg: 'kg',
  portions: 'portions',
  packets: 'packets',
  trays: 'trays',
  litres: 'litres',
  items: 'items',
}

export const STORAGE_LABELS: Record<Storage, string> = {
  ambient: 'Room temperature',
  refrigerated: 'Refrigerated',
  frozen: 'Frozen',
}

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  restaurant: 'Restaurant',
  canteen: 'Canteen',
  grocery: 'Grocery store',
  banquet_hall: 'Banquet hall',
  community_kitchen: 'Community kitchen',
  ngo: 'NGO',
  food_bank: 'Food bank',
  community_org: 'Community organization',
  other: 'Other',
}

export const DONOR_ORG_TYPES: OrgType[] = ['restaurant', 'canteen', 'grocery', 'banquet_hall', 'community_kitchen', 'other']
export const RECEIVER_ORG_TYPES: OrgType[] = ['ngo', 'food_bank', 'community_org', 'community_kitchen', 'other']

export const ROLE_LABELS: Record<Role, string> = {
  donor: 'Donor',
  receiver: 'Receiver',
  volunteer: 'Volunteer',
  admin: 'Administrator',
}

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  collected: 'Collected',
  completed: 'Verified rescue',
  expired: 'Expired',
  cancelled: 'Cancelled',
  removed: 'Removed',
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Declined',
  cancelled: 'Cancelled',
}

export const PICKUP_STATUS_LABELS: Record<PickupStatus, string> = {
  scheduled: 'Awaiting collector',
  assigned: 'Volunteer assigned',
  en_route: 'En route',
  arrived: 'Arrived at donor',
  collected: 'Collected',
  verified: 'Delivered & verified',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export const COMMON_ALLERGENS = ['gluten', 'dairy', 'nuts', 'peanuts', 'soy', 'egg', 'fish', 'shellfish', 'sesame', 'mustard']

/** Approximate coordinates for quick location entry (VIT-AP / Vijayawada region). */
export const LOCATION_PRESETS = [
  { label: 'VIT-AP Campus, Amaravati', city: 'Amaravati', latitude: 16.4963, longitude: 80.4994 },
  { label: 'Benz Circle, Vijayawada', city: 'Vijayawada', latitude: 16.4996, longitude: 80.656 },
  { label: 'Governorpet, Vijayawada', city: 'Vijayawada', latitude: 16.5131, longitude: 80.6297 },
  { label: 'Tadepalli', city: 'Tadepalli', latitude: 16.48, longitude: 80.6 },
  { label: 'Undavalli', city: 'Tadepalli', latitude: 16.485, longitude: 80.59 },
  { label: 'Mangalagiri', city: 'Mangalagiri', latitude: 16.4307, longitude: 80.5525 },
  { label: 'Guntur', city: 'Guntur', latitude: 16.3067, longitude: 80.4365 },
] as const

/** Estimated CO2e avoided per kg of food not wasted. Must match get_impact_stats(). */
export const CO2E_FACTOR_KG_PER_KG = 2.5
