const EARTH_RADIUS_KM = 6371.0088

export interface LatLng {
  latitude: number | null | undefined
  longitude: number | null | undefined
}

/**
 * Great-circle ("straight-line") distance in km using the Haversine formula.
 * This is NOT road distance or travel time. Returns null when coordinates are missing.
 */
export function haversineKm(a: LatLng, b: LatLng): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatKm(km: number | null): string {
  if (km == null) return 'Distance unknown'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}
