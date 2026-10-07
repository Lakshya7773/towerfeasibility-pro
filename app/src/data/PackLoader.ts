/**
 * Loads the runtime data sources from an installed pack.
 */
import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { packDir } from './DataPackManager';
import { loadRaster, packPopulationPath, packPopulationConfigPath } from './RasterSampler';
import type { RasterSampler } from './RasterSampler';
import type { SoilPolygon } from '../analysis/soilEngine';
import type { AdminBoundary } from '../analysis/adminEngine';

export interface PackData {
  towersDb: SQLite.SQLiteDatabase | null;
  fiberDb: SQLite.SQLiteDatabase | null;
  soil: SoilPolygon[];
  admin: AdminBoundary[];
  soilClassification: Record<string, unknown> | null;
  /** WorldPop people-per-cell raster, or null if not in this pack */
  populationRaster: RasterSampler | null;
  /** km2 per population cell, from the pack config */
  populationCellKm2: number | null;
  /** pack-relative path to the elevation GeoTIFF, or null */
  elevationPath: string | null;
}

function geomToRings(geometry: any): { polygons: number[][][][]; bbox: number[] } | null {
  if (!geometry) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const walk = (arr: any) => {
    if (typeof arr[0] === 'number') {
      minLon = Math.min(minLon, arr[0]); maxLon = Math.max(maxLon, arr[0]);
      minLat = Math.min(minLat, arr[1]); maxLat = Math.max(maxLat, arr[1]);
    } else arr.forEach(walk);
  };
  walk(geometry.coordinates);

  // Keep each polygon's rings together. Flattening a MultiPolygon would make
  // sibling polygons look like holes to the point-in-polygon test.
  if (geometry.type === 'Polygon') {
    return { polygons: [geometry.coordinates], bbox: [minLon, minLat, maxLon, maxLat] };
  }
  if (geometry.type === 'MultiPolygon') {
    return { polygons: geometry.coordinates, bbox: [minLon, minLat, maxLon, maxLat] };
  }
  return null;
}

export async function loadPack(region: string): Promise<PackData> {
  const dir = packDir(region);
  const out: PackData = {
    towersDb: null, fiberDb: null, soil: [], admin: [], soilClassification: null,
    populationRaster: null, populationCellKm2: null, elevationPath: null,
  };

  const towersFile = new File(dir, 'vectors', 'towers.sqlite');
  if (towersFile.exists) out.towersDb = await SQLite.openDatabaseAsync(towersFile.uri);

  const fiberFile = new File(dir, 'vectors', 'fiber.sqlite');
  if (fiberFile.exists) out.fiberDb = await SQLite.openDatabaseAsync(fiberFile.uri);

  const soilFile = new File(dir, 'vectors', 'soil.geojson');
  if (soilFile.exists) {
    const gj = JSON.parse(await soilFile.text());
    out.soil = (gj.features ?? [])
      .map((f: any) => {
        const g = geomToRings(f.geometry);
        if (!g) return null;
        return {
          faoCode: f.properties?.FAOSOIL ?? null,
          soilType: f.properties?.soil_type ?? 'Unknown',
          foundationSuitability: f.properties?.foundation_suitability ?? 'Unknown',
          foundationNote: f.properties?.foundation_note ?? '',
          minLon: g.bbox[0], minLat: g.bbox[1], maxLon: g.bbox[2], maxLat: g.bbox[3],
          polygons: g.polygons,
        } as SoilPolygon;
      })
      .filter(Boolean);
  }

  const cfgFile = new File(dir, 'config', 'soil-classification.json');
  if (cfgFile.exists) out.soilClassification = JSON.parse(await cfgFile.text());

  // population raster + its cell-area config
  const popPath = packPopulationPath(region);
  if (new File(popPath).exists) {
    out.populationRaster = await loadRaster(popPath);
    const pcfg = packPopulationConfigPath(region);
    if (new File(pcfg).exists) {
      try {
        const c = JSON.parse(await new File(pcfg).text());
        out.populationCellKm2 = Number(c.cell_area_km2) || null;
      } catch {
        out.populationCellKm2 = null;
      }
    }
  }

  // elevation is large; expose the path and let the LoS step window it
  const elevFile = new File(dir, 'elevation', 'elevation.tif');
  if (elevFile.exists) out.elevationPath = elevFile.uri;

  return out;
}
