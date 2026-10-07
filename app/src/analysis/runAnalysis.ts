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
  /** optional target point for LoS */
  target?: { lat: number; lon: number } | null;
}

/** A target for LoS when the user has not picked one: ~5 km on a bearing. */
function defaultTarget(lat: number, lon: number) {
  return { lat: lat + 0.03, lon: lon + 0.03 };
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
  const target = input.target ?? defaultTarget(lat, lon);
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

  return buildReport(site, input.region, bundle);
}
