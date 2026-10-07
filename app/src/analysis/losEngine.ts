/**
 * Feature 5 — LoS / Terrain Analysis.
 *
 * Given elevation samples along a path, checks line-of-sight with earth
 * curvature correction and first Fresnel zone clearance, and estimates
 * path loss / RSRP.
 *
 * Two corrections over the previous implementation:
 *
 *  1. The far endpoint of the sight line was computed from the terrain at the
 *     CURRENT sample, so the "straight line" bent to follow the ground and the
 *     clearance test was meaningless. The line now runs between the two
 *     antenna tips (tower base + tower height, and target ground + target
 *     height), which is what a LoS check actually models.
 *
 *  2. The recommended tower height was `currentHeight + worstDeficit`, which
 *     ignores that raising the antenna lifts the sight line by only (1 - t) at
 *     a point t along the path. On a flat 11 km path it recommended 40 m when
 *     the path does not clear until ~105 m. The height is now solved for
 *     directly, with a 5 m safety margin.
 */
import type { LosResult, ElevationPoint, LosStatus } from '../models';
import { curvatureBulgeM, fresnelRadiusM, fsplDb } from '../utils/geo';

export interface ElevationSampler {
  /** elevation in metres at lat/lon, or null outside coverage */
  sample: (lat: number, lon: number) => number | null;
}

export interface LosOptions {
  towerHeightM: number;
  targetHeightM: number;
  frequencyGhz: number;
  samples?: number;
  txPowerDbm?: number;
  antennaGainDbi?: number;
}

/**
 * Practical ceiling for a recommended mast height. Beyond this the path is not
 * realistically cleared by a single tower, and reporting a 400 m recommendation
 * in a commercial feasibility report would be misleading; `losStatus` already
 * tells the user the path is obstructed.
 */
const MAX_RECOMMENDED_HEIGHT_M = 120;

/** Fresnel fraction that must be clear for the path to count as unobstructed. */
const FRESNEL_CLEARANCE_FRACTION = 0.6;

/**
 * Build the terrain profile and evaluate clearance.
 * Returns null when no elevation coverage exists for the path.
 */
export function analyzeLos(
  sampler: ElevationSampler | null,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  opts: LosOptions,
): LosResult | null {
  if (!sampler) return null;

  const samples = opts.samples ?? 64;
  const dLat = to.lat - from.lat;
  const dLon = to.lon - from.lon;
  // approximate total ground distance
  const midLat = (from.lat + to.lat) / 2;
  const kx = 111.32 * Math.cos((midLat * Math.PI) / 180);
  const totalKm = Math.sqrt((dLat * 111.32) ** 2 + (dLon * kx) ** 2);
  if (totalKm <= 0) return null;

  const base = sampler.sample(from.lat, from.lon);
  if (base == null) return null;
  const farGround = sampler.sample(to.lat, to.lon);
  if (farGround == null) return null;

  // Antenna tips: the sight line runs between these two points, not along the
  // ground.
  const hA = base + opts.towerHeightM;
  const hB = farGround + opts.targetHeightM;

  const profile: ElevationPoint[] = [];
  let minMargin = Infinity;
  let worstIndex = -1;
  // Smallest antenna lift that brings every sample to >= 0 clearance margin.
  let requiredLift = 0;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const lat = from.lat + dLat * t;
    const lon = from.lon + dLon * t;
    const ground = sampler.sample(lat, lon);
    if (ground == null) return null;

    const distKm = totalKm * t;
    const remaining = totalKm - distKm;

    // straight line between the antenna tips, with the earth-curvature bulge
    // (zero at both ends, maximal at midspan) subtracted
    const los = hA + (hB - hA) * t - curvatureBulgeM(distKm, remaining);

    const fr = fresnelRadiusM(distKm, remaining, opts.frequencyGhz);
    // obstruction if terrain rises above the 60% Fresnel clearance boundary
    const clearance = los - ground;
    const needed = FRESNEL_CLEARANCE_FRACTION * fr;
    const obstructed = clearance < needed;

    const margin = clearance - needed;
    if (margin < minMargin) {
      minMargin = margin;
      worstIndex = i;
    }

    // Raising the tower lifts the sight line at t by (1 - t); at the far end
    // (t = 1) the line is pinned to the target tip and cannot be lifted.
    if (margin < 0 && t < 0.999) {
      requiredLift = Math.max(requiredLift, -margin / (1 - t));
    }

    profile.push({
      distanceKm: Math.round(distKm * 1000) / 1000,
      elevationM: Math.round(ground),
      losLineM: Math.round(los * 10) / 10,
      fresnelRadiusM: Math.round(fr * 10) / 10,
      obstructed,
    });
  }

  const obstructedCount = profile.filter((p) => p.obstructed).length;
  let status: LosStatus;
  if (obstructedCount === 0) status = 'Clear';
  else if (minMargin > -5) status = 'Marginal';
  else status = 'Obstructed';

  // Solve for the mast height that actually clears the worst obstruction,
  // with a 5 m safety margin, rounded up to the next 5 m.
  let recommended = opts.towerHeightM;
  if (status !== 'Clear') {
    recommended = Math.ceil((opts.towerHeightM + requiredLift + 5) / 5) * 5;
    recommended = Math.min(recommended, MAX_RECOMMENDED_HEIGHT_M);
  }

  const fspl = fsplDb(totalKm, opts.frequencyGhz * 1000);
  const tx = opts.txPowerDbm ?? 46;
  const gain = opts.antennaGainDbi ?? 18;
  const rsrp = tx + gain - fspl;

  return {
    losStatus: status,
    terrainProfile: profile,
    fresnelClearance: obstructedCount === 0,
    recommendedTowerHeight: recommended,
    pathLossDb: Math.round(fspl * 10) / 10,
    estimatedRsrpDbm: Math.round(rsrp * 10) / 10,
    distanceKm: Math.round(totalKm * 1000) / 1000,
  };
}
