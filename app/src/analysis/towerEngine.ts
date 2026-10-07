/**
 * Feature 2 — Competitor Tower Density.
 *
 * Backed by the pack's towers.sqlite (lat/lon indexed).
 *
 * Counting is two-stage: a cheap bbox pre-filter in SQL (which the lat/lon
 * index can serve), then an exact haversine test in JS. The bbox is NOT a disc
 * — its area is 4r² against the disc's πr² — so using the raw bbox count and
 * dividing by πr² over-counted density by up to 4/π (27%) on uniform data and
 * more in clustered areas, shifting the saturation classification and hence
 * the feasibility score.
 *
 * The 5 km neighbour query deliberately has NO LIMIT: it used to cap at 400
 * rows with no ORDER BY, so in dense cities (Jaipur has ~1,280 towers within
 * 5 km) the "nearest" tower reported was whichever 400 rows SQLite happened to
 * return first — 1.64 km away when the true nearest was 0.18 km.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { TowerResult, NearbyTower, SaturationClass } from '../models';
import { bboxForRadius, circleAreaKm2, haversineKm } from '../utils/geo';

export function classifySaturation(densityPerKm2: number): SaturationClass {
  // Every `<` comparison is false for NaN, so a NaN density would fall through
  // to 'Saturated' — the WORST category — and silently penalise the score.
  // An unknown density is treated as 'Low' (neutral for a new site).
  if (!Number.isFinite(densityPerKm2) || densityPerKm2 < 2) return 'Low';
  if (densityPerKm2 < 5) return 'Medium';
  if (densityPerKm2 < 10) return 'High';
  return 'Saturated';
}

/** Every tower within the radius, by exact great-circle distance. */
async function towersWithin(
  db: SQLiteDatabase, lat: number, lon: number, radiusKm: number,
): Promise<{ id: number; lat: number; lon: number; installation_type: string | null }[]> {
  const b = bboxForRadius(lat, lon, radiusKm);
  const rows = await db.getAllAsync<{
    id: number; lat: number; lon: number; installation_type: string | null;
  }>(
    `SELECT id, lat, lon, installation_type FROM towers
     WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
    [b.minLat, b.maxLat, b.minLon, b.maxLon],
  );
  return rows.filter((r) => haversineKm(lat, lon, r.lat, r.lon) <= radiusKm);
}

export async function analyzeTowers(
  db: SQLiteDatabase, lat: number, lon: number,
): Promise<TowerResult> {
  const within1Rows = await towersWithin(db, lat, lon, 1);
  const within2Rows = await towersWithin(db, lat, lon, 2);
  const within5Rows = await towersWithin(db, lat, lon, 5);

  const within1 = within1Rows.length;
  const within2 = within2Rows.length;
  const within5 = within5Rows.length;

  // density measured on the 1 km ring (most local saturation signal)
  const density = within1 / circleAreaKm2(1);

  const nearby: NearbyTower[] = within5Rows
    .map((r) => ({
      id: r.id,
      lat: r.lat,
      lon: r.lon,
      installationType: r.installation_type,
      distanceKm: haversineKm(lat, lon, r.lat, r.lon),
    }))
    .sort((a, b2) => a.distanceKm - b2.distanceKm)
    .slice(0, 10);

  return {
    towersWithin1km: within1,
    towersWithin2km: within2,
    towersWithin5km: within5,
    densityPerKm2: Math.round(density * 100) / 100,
    saturationClassification: classifySaturation(density),
    nearbyTowers: nearby,
    // dense cluster of nearby masts => a sharing/co-location conversation is worth having
    colocationOpportunity: within1 >= 3,
  };
}
