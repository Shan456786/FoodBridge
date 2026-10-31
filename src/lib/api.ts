/**
 * Data API. Uses the live Supabase backend when it is configured; otherwise
 * falls back to the clearly labelled OFFLINE DEMO backend (local sample data).
 */
import * as live from './api.live'
import * as offline from './api.offline'
import { isSupabaseConfigured } from './supabase'

export type { ListingInput } from './api.live'

/** True when running without Supabase on local sample data. */
export const OFFLINE_DEMO = !isSupabaseConfigured

const impl = (OFFLINE_DEMO ? offline : live) as unknown as typeof live

export const {
  friendlyError,
  fetchProfile,
  fetchOrganization,
  updateProfile,
  updateOrganization,
  fetchOrganizations,
  fetchAvailableListings,
  fetchOrgListings,
  fetchAllListings,
  fetchListing,
  createListing,
  updateListing,
  cancelListing,
  fetchRequests,
  fetchListingRequests,
  requestListing,
  respondToRequest,
  cancelRequest,
  fetchPickups,
  fetchListingPickup,
  listVolunteers,
  assignVolunteer,
  updatePickupProgress,
  generateHandoverCode,
  verifyHandoverCode,
  confirmReceipt,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getImpactStats,
  fetchListingAudit,
  fetchRecentActivity,
  syncExpiry,
  setOrgVerification,
  removeListing,
  fetchAuditEvents,
  fetchProfiles,
} = impl

// Compile-time check that the offline backend implements every live function.
type Fns<T> = { [K in keyof T as T[K] extends (...a: never[]) => unknown ? K : never]: T[K] }
const _offlineConforms: Record<keyof Fns<typeof live>, unknown> = offline
void _offlineConforms
