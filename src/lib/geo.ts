/**
 * Serviceability.
 *
 * Answers the question the header asks on every page load: can Quoin
 * reach this coordinate, from which store, and how fast.
 */

const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in kilometres.
 *
 * Straight-line, not road distance — it always under-estimates, so a
 * store that looks 5.9 km away may be a 9 km drive. `serviceRadiusKm` is
 * therefore set conservatively per store, and this is replaced with a
 * routing provider before the promise is tightened.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface ServiceableStore {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  baseEtaMinutes: number;
}

export interface Serviceability {
  serviceable: boolean;
  store: ServiceableStore | null;
  distanceKm: number | null;
  etaMinutes: number | null;
}

/**
 * Minutes added per kilometre of straight-line distance.
 *
 * The headline "18 minutes" is the pick-and-pack floor at the store; a
 * customer 5 km out is not getting the same number, and quoting it anyway
 * is how a delivery promise becomes a support ticket.
 */
const MINUTES_PER_KM = 2.5;

/**
 * Picks the nearest active store within its own radius.
 *
 * Radius is per store rather than global because a dense-city dark store
 * and a suburban one have genuinely different reach.
 */
export function resolveServiceability(
  point: LatLng,
  stores: ServiceableStore[],
): Serviceability {
  let best: { store: ServiceableStore; distanceKm: number } | null = null;

  for (const store of stores) {
    const distanceKm = haversineKm(point, store);
    if (distanceKm > store.serviceRadiusKm) continue;
    if (!best || distanceKm < best.distanceKm) best = { store, distanceKm };
  }

  if (!best) {
    return {
      serviceable: false,
      store: null,
      distanceKm: null,
      etaMinutes: null,
    };
  }

  return {
    serviceable: true,
    store: best.store,
    distanceKm: Math.round(best.distanceKm * 10) / 10,
    etaMinutes: Math.round(
      best.store.baseEtaMinutes + best.distanceKm * MINUTES_PER_KM,
    ),
  };
}
