/**
 * Feature 1 — Population Density.
 *
 * Population comes from the pack's WorldPop raster, which stores **people per
 * cell** (WorldPop 1 km "Aggregated"). We count the raster's own cells inside
 * the radius, so the total does not depend on any latitude approximation:
 *
 *     people = SUM(cell value) over cells whose centre lies in the disc
 *
 * Density is then total people / disc area, which is what the classification
 * thresholds are defined against.
 *
 * If no raster is packaged we fall back to a tower-derived proxy, which the
 * report flags as an estimate.
 */
import type { PopulationResult, DensityClass } from '../models';
import { circleAreaKm2 } from '../utils/geo';

export function classifyDensity(perKm2: number): DensityClass {
  // NaN fails every `<` test and would land on 'Dense urban', the most
  // favourable demand category, inflating the feasibility score from unknown
  // data. Unknown density is reported as 'Rural' (neutral/lowest claim).
  if (!Number.isFinite(perKm2) || perKm2 < 100) return 'Rural';
  if (perKm2 < 500) return 'Semi-urban';
  if (perKm2 < 1500) return 'Urban';
  return 'Dense urban';
}

export interface PopulationRaster {
  /** people per cell at a lat/lon, or null outside coverage */
  sample: (lat: number, lon: number) => number | null;
  /** native cell size in degrees */
  cellDegLat: number;
  cellDegLon: number;
  bounds: [number, number, number, number];
  /**
   * North-west corner of the raster in degrees. Optional for backwards
   * compatibility, but REQUIRED for correct results: without it the grid walk
   * assumes an origin of (0°, 0°) and offsets every cell centre by the raster's
   * true origin, which for Rajasthan shifted the integrated population by up
   * to 6% (and sampled a different part of the map than it summed).
   */
  originLat?: number;
  originLon?: number;
}

/** km per degree of latitude. */
const KM_PER_DEG_LAT = 111.32;

/**
 * Sum people over a disc by walking the raster grid, so every cell is counted
 * exactly once. Returns people and the number of cells counted.
 *
 * Cell centres are computed from the raster's true north-west origin when it
 * is known. GeoTIFFs here are north-up, so row index increases southward and
 * latitude therefore DECREASES with row: cellLat = originLat - (iy + 0.5)*step.
 * The (0°, 0°) fallback is kept only for samplers that cannot report an origin.
 */
function integrate(
  raster: PopulationRaster, lat: number, lon: number, radiusKm: number,
): { people: number; cells: number } {
  const stepLat = raster.cellDegLat;
  const stepLon = raster.cellDegLon;
  if (!(stepLat > 0) || !(stepLon > 0)) return { people: 0, cells: 0 };

  const hasOrigin = raster.originLat != null && raster.originLon != null;
  const originLat = raster.originLat ?? 0;
  const originLon = raster.originLon ?? 0;

  const dLatDeg = radiusKm / KM_PER_DEG_LAT;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLonDeg = radiusKm / (KM_PER_DEG_LAT * cosLat);

  // Latitude at the centre of row `iy`, and longitude at the centre of `ix`.
  const cellLatOf = (iy: number) =>
    hasOrigin ? originLat - (iy + 0.5) * stepLat : (iy + 0.5) * stepLat;
  const cellLonOf = (ix: number) =>
    hasOrigin ? originLon + (ix + 0.5) * stepLon : (ix + 0.5) * stepLon;

  // Row index range for latitudes [lat - dLat, lat + dLat].
  const iy0 = hasOrigin
    ? Math.floor((originLat - (lat + dLatDeg)) / stepLat)
    : Math.floor((lat - dLatDeg) / stepLat);
  const iy1 = hasOrigin
    ? Math.ceil((originLat - (lat - dLatDeg)) / stepLat)
    : Math.ceil((lat + dLatDeg) / stepLat);

  // Column index range for longitudes [lon - dLon, lon + dLon].
  const ix0 = Math.floor(((lon - dLonDeg) - originLon) / stepLon);
  const ix1 = Math.ceil(((lon + dLonDeg) - originLon) / stepLon);

  // guard against absurd loops if raster metadata is wrong
  if ((iy1 - iy0) * (ix1 - ix0) > 4_000_000) return { people: 0, cells: 0 };

  let people = 0;
  let cells = 0;
  for (let iy = iy0; iy <= iy1; iy++) {
    const cellLat = cellLatOf(iy);
    if (cellLat < raster.bounds[1] || cellLat > raster.bounds[3]) continue;
    const dyKm = (cellLat - lat) * KM_PER_DEG_LAT;
    if (Math.abs(dyKm) > radiusKm) continue;

    for (let ix = ix0; ix <= ix1; ix++) {
      const cellLon = cellLonOf(ix);
      if (cellLon < raster.bounds[0] || cellLon > raster.bounds[2]) continue;
      const dxKm = (cellLon - lon) * KM_PER_DEG_LAT * cosLat;
      if (Math.sqrt(dxKm * dxKm + dyKm * dyKm) > radiusKm) continue;

      const v = raster.sample(cellLat, cellLon);
      if (v != null && Number.isFinite(v)) {
        people += v;
        cells += 1;
      }
    }
  }
  return { people, cells };
}

export function analyzePopulation(
  raster: PopulationRaster | null, lat: number, lon: number,
  towerFallbackPerKm2 = 0,
): PopulationResult {
  if (!raster) {
    // no population raster in this pack — clearly flagged as an estimate
    const perKm2 = Math.max(0, towerFallbackPerKm2 * 400);
    return {
      populationWithin2km: Math.round(perKm2 * circleAreaKm2(2)),
      populationWithin5km: Math.round(perKm2 * circleAreaKm2(5)),
      populationWithin10km: Math.round(perKm2 * circleAreaKm2(10)),
      densityPerKm2: Math.round(perKm2),
      densityClassification: classifyDensity(perKm2),
      serviceablePopulation: Math.round(perKm2 * circleAreaKm2(2)),
      source: 'tower-proxy',
    };
  }

  const r2 = integrate(raster, lat, lon, 2);
  const r5 = integrate(raster, lat, lon, 5);
  const r10 = integrate(raster, lat, lon, 10);

  const density = r2.people / circleAreaKm2(2);

  return {
    populationWithin2km: Math.round(r2.people),
    populationWithin5km: Math.round(r5.people),
    populationWithin10km: Math.round(r10.people),
    densityPerKm2: Math.round(density),
    densityClassification: classifyDensity(density),
    // ~70% of a 2 km disc is realistically serviceable by one macro site
    serviceablePopulation: Math.round(r2.people * 0.7),
    source: 'worldpop',
  };
}
