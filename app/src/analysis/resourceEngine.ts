/**
 * Feature 3 — Nearby Resources (fiber / power / road).
 *
 * Fiber comes from the pack's fiber.sqlite (R*Tree + WKB geometry).
 * Road/power come from the same store when present; otherwise reported absent.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ResourceResult, NearestResource, Accessibility } from '../models';
import { bboxForRadius, pointToSegmentKm, haversineKm } from '../utils/geo';
import { decodeLineGeom } from '../utils/wkb';

export function classifyAccessibility(distanceKm: number): Accessibility {
  // NaN would fall through every `<` to 'Poor' (the worst claim). An unknown
  // distance is reported as 'Poor' deliberately (never overstate backhaul),
  // but make that explicit rather than accidental.
  if (!Number.isFinite(distanceKm)) return 'Poor';
  const m = distanceKm * 1000;
  if (m < 100) return 'Excellent';
  if (m < 500) return 'Good';
  if (m < 1000) return 'Fair';
  return 'Poor';
}

/**
 * Nearest fiber segment, searching outward until a hit is found.
 * Returns null only if nothing is found within `maxRadiusKm`.
 *
 * `geom` is declared BLOB in the pack but the upstream BharatNet data stores
 * WKT text, so the column comes back as a string; decodeLineGeom handles both.
 */
export async function nearestFiber(
  db: SQLiteDatabase, lat: number, lon: number, maxRadiusKm = 50,
): Promise<NearestResource | null> {
  let radius = 2;
  while (radius <= maxRadiusKm) {
    const b = bboxForRadius(lat, lon, radius);
    let rows: {
      name: string | null; owner: string | null; seg_length: number | null;
      geom: string | Uint8Array;
    }[];
    try {
      rows = await db.getAllAsync<{
        name: string | null; owner: string | null; seg_length: number | null;
        geom: string | Uint8Array;
      }>(
        `SELECT f.name, f.owner, f.seg_length, f.geom
         FROM fiber_rtree r JOIN fiber f ON f.id = r.id
         WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?
         LIMIT 500`,
        [b.maxLon, b.minLon, b.maxLat, b.minLat],
      );
    } catch (e) {
      // A damaged or partially-installed pack can be missing the R*Tree index.
      // Degrade to an unindexed bbox scan on the base table rather than
      // throwing; if that fails too, report no fiber (never a false "fiber
      // available" claim).
      try {
        rows = await db.getAllAsync<{
          name: string | null; owner: string | null; seg_length: number | null;
          geom: string | Uint8Array;
        }>(
          `SELECT name, owner, seg_length, geom FROM fiber
           WHERE minx <= ? AND maxx >= ? AND miny <= ? AND maxy >= ?
           LIMIT 500`,
          [b.maxLon, b.minLon, b.maxLat, b.minLat],
        );
      } catch {
        return null;
      }
    }

    let best: { d: number; name: string | null; owner: string | null } | null = null;
    for (const r of rows) {
      const line = decodeLineGeom(r.geom);
      if (!line) continue;
      for (let i = 0; i < line.length - 1; i++) {
        const [aLon, aLat] = line[i];
        const [bLon, bLat] = line[i + 1];
        const d = pointToSegmentKm(lat, lon, aLat, aLon, bLat, bLon);
        if (!best || d < best.d) best = { d, name: r.name, owner: r.owner };
      }
    }
    if (best) {
      return {
        distanceKm: Math.round(best.d * 1000) / 1000,
        name: best.name?.trim() || null,
        detail: best.owner?.trim() || 'BBNL/BharatNet OFC',
      };
    }
    radius *= 2;
  }
  return null;
}

export async function analyzeResources(
  db: SQLiteDatabase, lat: number, lon: number,
): Promise<ResourceResult> {
  let fiber: NearestResource | null = null;
  try {
    fiber = await nearestFiber(db, lat, lon, 50);
  } catch {
    // Corrupt fiber store: report absence rather than failing the whole analysis.
    fiber = null;
  }

  const nearestFiberRes: NearestResource = fiber ?? {
    distanceKm: 50,
    name: null,
    detail: 'no BharatNet OFC within 50 km',
  };

  // Resource score: fiber access dominates (1-5)
  let score = 1;
  if (fiber) {
    if (fiber.distanceKm < 0.1) score = 5;
    else if (fiber.distanceKm < 0.5) score = 4;
    else if (fiber.distanceKm < 1) score = 3;
    else if (fiber.distanceKm < 5) score = 2;
    else score = 1;
  }

  return {
    nearestFiber: nearestFiberRes,
    nearestRoad: null, // populated when road layer is packaged
    resourceScore: score,
    fiberAccessibility: classifyAccessibility(nearestFiberRes.distanceKm),
  };
}

export { haversineKm };
