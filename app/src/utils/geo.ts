/**
 * Geospatial helpers — pure functions, no native deps.
 */

export const EARTH_RADIUS_KM = 6371.0088;

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km (haversine). */
export function haversineKm(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Bounding box (deg) covering `radiusKm` around a point. */
export function bboxForRadius(lat: number, lon: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(0.01, Math.cos(toRad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

/** Area of a circle in km^2. */
export const circleAreaKm2 = (r: number) => Math.PI * r * r;

/**
 * Point-to-segment distance in km, using an equirectangular local projection.
 * Accurate at the scales we care about (< ~50 km).
 */
export function pointToSegmentKm(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): number {
  const kx = 111.32 * Math.cos(toRad(pLat)); // km per degree lon
  const ky = 111.32;                          // km per degree lat
  const px = (pLon - aLon) * kx, py = (pLat - aLat) * ky;
  const bx = (bLon - aLon) * kx, by = (bLat - aLat) * ky;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.sqrt(px * px + py * py);
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - t * bx, dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Earth-curvature drop (m) at distance d (km) from the observer.
 * h = d^2 / (2R)
 */
export function earthCurvatureDropM(distanceKm: number): number {
  const d = distanceKm * 1000;
  const R = EARTH_RADIUS_KM * 1000;
  return (d * d) / (2 * R);
}

/**
 * Curvature bulge (m) at a point d1 km from one end and d2 km from the other.
 *
 * This is the correct term for a line-of-sight clearance check: it is zero at
 * both endpoints and maximal at midspan. (earthCurvatureDropM, which only
 * measures distance from one end, wrongly dips the path below ground at the
 * far end.)
 *
 * h = d1 * d2 / (2R)
 */
export function curvatureBulgeM(d1Km: number, d2Km: number): number {
  const R = EARTH_RADIUS_KM * 1000;
  return (d1Km * 1000 * d2Km * 1000) / (2 * R);
}

/** First Fresnel zone radius (m) at a given distance. */
export function fresnelRadiusM(d1Km: number, d2Km: number, freqGhz: number): number {
  const d1 = d1Km * 1000, d2 = d2Km * 1000, D = d1 + d2;
  if (D <= 0 || freqGhz <= 0) return 0;
  const lambda = 299792458 / (freqGhz * 1e9); // metres
  return Math.sqrt((lambda * d1 * d2) / D);
}

/** Free-space path loss (dB). */
export function fsplDb(distanceKm: number, freqMhz: number): number {
  // A zero/negative frequency would return -Infinity or NaN, which then
  // propagates into the reported RSRP. Treat a degenerate input as "no path
  // loss computed" (0 dB) rather than emitting a non-finite number.
  if (!(distanceKm > 0) || !(freqMhz > 0)) return 0;
  return 20 * Math.log10(distanceKm) + 20 * Math.log10(freqMhz) + 32.45;
}
