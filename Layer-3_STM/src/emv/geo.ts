// ============================================================
// geo.ts — minimal great-circle geometry for EMV GPS checks
//
// Layer 1 (Perception) ingests EMV device telemetry as (lat, lng). The
// Security & Trust gate at Layer 3 needs to answer two geometric questions:
//   1. Is the vehicle actually within the approach zone of THIS junction?
//   2. Is the claimed ETA physically consistent with its position + speed?
// Both reduce to a distance-on-a-sphere calculation (haversine). The mock
// dispatch uses the inverse (destinationPoint) to place a plausible vehicle.
// ============================================================

const EARTH_RADIUS_METERS = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle distance between two WGS84 points, in metres. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Point reached by travelling `distanceMeters` from (lat,lng) along `bearingDeg`
 * (0 = north, 90 = east). Inverse of haversine; used only to synthesise mock
 * EMV positions a known distance away from a junction.
 */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number,
): { lat: number; lng: number } {
  const angular = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}
