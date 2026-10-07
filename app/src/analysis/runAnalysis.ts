/**
 * Runs the full 7-dimension analysis for a site against an installed pack.
 */
import type { PackData } from '../data/PackLoader';
import type { Site, AnalysisBundleLike, FeasibilityReport } from '../models';
import { analyzeTowers } from '../analysis/towerEngine';
import { analyzeResources } from '../analysis/resourceEngine';
import { analyzePopulation } from '../analysis/populationEngine';
import { analyzeRow, DEFAULT_ROW_RULES } from '../analysis/rowEngine';
import { analyzeLos } from '../analysis/losEngine';
import { lookupSoil } from '../analysis/soilEngine';
import { buildAdminResult } from '../analysis/adminEngine';
import { buildReport } from '../report/ReportBuilder';
import { loadWindowSampler } from '../data/RasterSampler';

export interface AnalyzeInput {
  site: Site;
  region: string;
  state: string;
  district?: string | null;
  pack: PackData;
  /** optional target point for LoS; when absent an assumed geometry is used */
  target?: { lat: number; lon: number } | null;
  /** audit-trail metadata passed through to the report */
  appVersion?: string;
  packVersion?: string;
  sourceDates?: Record<string, string>;
  provenance?: Record<string, any>;
}

/**
 * Fallback LoS target when the caller supplies none.
 *
 * IMPORTANT: this is an ASSUMED geometry, not the site's real line of sight.
 * It produces a ~4.5 km path on a ~42° (NE) bearing. The report must disclose
 * that the target was assumed; `losTargetAssumed` is set accordingly and the
 * UI/report must not present the resulting distance as site-specific fact.
 */
function defaultTarget(lat: number, lon: number) {
  return { lat: lat + 0.03, lon: lon + 0.03 };
}

/** Compass bearing (deg) and distance (km) between two points, for disclosure. */
function pathGeometry(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const dLat = to.lat - from.lat;
  const dLon = to.lon - from.lon;
  const midLat = (from.lat + to.lat) / 2;
  const kx = 111.32 * Math.cos((midLat * Math.PI) / 180);
  const dy = dLat * 111.32;
  const dx = dLon * kx;
  const distanceKm = Math.hypot(dx, dy);
  let bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return { distanceKm, bearing };
}

export async function runAnalysis(input: AnalyzeInput): Promise<FeasibilityReport> {
  const { site, pack } = input;
  const { lat, lon } = site;

  // 1 towers
  const towers = pack.towersDb
    ? await analyzeTowers(pack.towersDb, lat, lon)
    : { towersWithin1km: 0, towersWithin2km: 0, towersWithin5km: 0,
        densityPerKm2: 0, saturationClassification: 'Low' as const,
        nearbyTowers: [], colocationOpportunity: false };

  // 2 population — real raster when the pack has one, else tower-derived proxy
  const population = analyzePopulation(
    pack.populationRaster,
    lat, lon,
    towers.densityPerKm2,
  );

  // 3 resources
  const resources = pack.fiberDb
    ? await analyzeResources(pack.fiberDb, lat, lon)
    : { nearestFiber: { distanceKm: 50, name: null, detail: 'no fiber data in pack' },
        nearestRoad: null, resourceScore: 1, fiberAccessibility: 'Poor' as const };

  // 4 RoW
  const row = analyzeRow(input.state, DEFAULT_ROW_RULES);

  // 5 soil
  const soilHit = lookupSoil(pack.soil, lat, lon);
  const soil = soilHit ?? {
    faoCode: null, soilType: 'Unknown',
    foundationSuitability: 'Unknown',
    foundationNote: 'no soil polygon at this location',
  };

  // 6 admin
  const admin = buildAdminResult(input.state, input.district ?? null);

  // 7 LoS — needs the elevation raster; decode only the path corridor
  const losTargetAssumed = !input.target;
  const target = input.target ?? defaultTarget(lat, lon);
  const pathGeo = pathGeometry({ lat, lon }, target);
  let los = null;
  if (pack.elevationPath) {
    const sampler = await loadWindowSampler(
      pack.elevationPath,
      [{ lat, lon }, target],
      16,
    );
    if (sampler) {
      los = analyzeLos(sampler, { lat, lon }, target, {
        towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1,
      });
    }
  }

  const bundle: AnalysisBundleLike = {
    population, towers, resources, row, los, soil, admin,
  };

  // Attach the assumed-target disclosure to the LoS result so the report can
  // state the geometry it actually used rather than implying a real link.
  if (los) {
    (los as any).targetAssumed = losTargetAssumed;
    (los as any).bearingDeg = Math.round(pathGeo.bearing);
    (los as any).target = { lat: target.lat, lon: target.lon };
  }

  return buildReport(site, input.region, bundle, {
    appVersion: input.appVersion,
    algorithmVersion: '1.1.0',
    packVersion: input.packVersion,
    sourceDates: input.sourceDates,
    provenance: input.provenance,
    losTargetAssumed,
  });
}
