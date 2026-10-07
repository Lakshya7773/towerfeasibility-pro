/**
 * ADVERSARIAL PROBE F — TRUE end-to-end analysis against the real pack:
 * real towers.sqlite, real fiber.sqlite, real soil.geojson, real population
 * GeoTIFF, real elevation GeoTIFF — driven through the real engines and the
 * real report builder. This is what a user actually gets.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { analyzeTowers } from '../../app/src/analysis/towerEngine';
import { analyzeResources } from '../../app/src/analysis/resourceEngine';
import { analyzePopulation, type PopulationRaster } from '../../app/src/analysis/populationEngine';
import { analyzeRow, DEFAULT_ROW_RULES } from '../../app/src/analysis/rowEngine';
import { lookupSoil, type SoilPolygon } from '../../app/src/analysis/soilEngine';
import { buildAdminResult } from '../../app/src/analysis/adminEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { buildReport } from '../../app/src/report/ReportBuilder';
import { buildReportHtml } from '../../app/src/report/reportHtml';

const APP = '/home/lakshya/company/towerfeasibility/app';
const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const geotiff = require(path.join(APP, 'node_modules', 'geotiff'));

function sqliteShim(file: string) {
  const raw = new DatabaseSync(file);
  return {
    async getAllAsync(sql: string, params: any[] = []) {
      return (raw.prepare(sql).all(...params) as any[]).map((r) => ({
        ...r,
        geom: r.geom == null ? null
          : typeof r.geom === 'string' ? new Uint8Array(Buffer.from(r.geom, 'latin1'))
            : new Uint8Array(r.geom),
      }));
    },
    async getFirstAsync(sql: string, params: any[] = []) {
      return (raw.prepare(sql).get(...params) as any) ?? null;
    },
    close: () => raw.close(),
  };
}

async function makeSampler(tifPath: string) {
  const buf = readFileSync(tifPath);
  const tiff = await geotiff.fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const origin = img.getOrigin();
  const res = img.getResolution();
  const W = img.getWidth(), H = img.getHeight();
  const nodata = img.getGDALNoData() != null ? Number(img.getGDALNoData()) : null;
  const band = (await img.readRasters({ interleave: false }))[0] as ArrayLike<number>;
  const sample = (lat: number, lon: number): number | null => {
    const col = Math.floor((lon - origin[0]) / res[0]);
    const row = Math.floor((lat - origin[1]) / res[1]);
    if (row < 0 || col < 0 || row >= H || col >= W) return null;
    const v = band[row * W + col];
    if (v == null || !Number.isFinite(v)) return null;
    if (nodata != null && v === nodata) return null;
    return v;
  };
  return { sample, width: W, height: H, bounds: [minX, minY, maxX, maxY] as [number, number, number, number],
    cellDegLat: Math.abs(res[1]), cellDegLon: Math.abs(res[0]),
    originLat: origin[1], originLon: origin[0] };
}

/** Windowed elevation sampler, mirroring RasterSampler.loadWindowSampler. */
async function makeWindowSampler(tifPath: string, points: { lat: number; lon: number }[]) {
  const buf = readFileSync(tifPath);
  const tiff = await geotiff.fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const origin = img.getOrigin();
  const res = img.getResolution();
  const W = img.getWidth(), H = img.getHeight();
  const nodata = img.getGDALNoData() != null ? Number(img.getGDALNoData()) : -32768;
  let minRow = Infinity, minCol = Infinity, maxRow = -Infinity, maxCol = -Infinity;
  for (const p of points) {
    const col = Math.floor((p.lon - origin[0]) / res[0]);
    const row = Math.floor((p.lat - origin[1]) / res[1]);
    if (row < 0 || col < 0 || row >= H || col >= W) continue;
    minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
  }
  if (!Number.isFinite(minRow)) return null;
  const pad = 16;
  const x0 = Math.max(0, minCol - pad), y0 = Math.max(0, minRow - pad);
  const x1 = Math.min(W, maxCol + pad + 1), y1 = Math.min(H, maxRow + pad + 1);
  const w = x1 - x0, h = y1 - y0;
  const rasters = await img.readRasters({ window: [x0, y0, x1, y1], interleave: false, width: w, height: h });
  const band = Float32Array.from(rasters[0] as unknown as ArrayLike<number>);
  return {
    sample: (lat: number, lon: number): number | null => {
      const col = Math.floor((lon - origin[0]) / res[0]);
      const row = Math.floor((lat - origin[1]) / res[1]);
      const lx = col - x0, ly = row - y0;
      if (lx < 0 || ly < 0 || lx >= w || ly >= h) return null;
      const v = band[ly * w + lx];
      if (v == null || !Number.isFinite(v) || v === nodata) return null;
      return v;
    },
  };
}

function loadSoil(): SoilPolygon[] {
  const gj = JSON.parse(readFileSync(`${PACK}/vectors/soil.geojson`, 'utf8'));
  return (gj.features ?? []).map((f: any) => {
    const g = f.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    const walk = (a: any) => {
      if (typeof a[0] === 'number') {
        minLon = Math.min(minLon, a[0]); maxLon = Math.max(maxLon, a[0]);
        minLat = Math.min(minLat, a[1]); maxLat = Math.max(maxLat, a[1]);
      } else a.forEach(walk);
    };
    walk(g.coordinates);
    return {
      faoCode: f.properties?.FAOSOIL ?? null,
      soilType: f.properties?.soil_type ?? 'Unknown',
      foundationSuitability: f.properties?.foundation_suitability ?? 'Unknown',
      foundationNote: f.properties?.foundation_note ?? '',
      minLon, minLat, maxLon, maxLat, polygons,
    } as SoilPolygon;
  });
}

(async () => {
  console.log('PROBE F — end-to-end analysis with the REAL pack\n');

  const towersDb = sqliteShim(`${PACK}/vectors/towers.sqlite`);
  const fiberDb = sqliteShim(`${PACK}/vectors/fiber.sqlite`);
  const popRaster = await makeSampler(`${PACK}/population/population.tif`);
  const soil = loadSoil();

  const SITES: [string, number, number][] = [
    ['Ajmer', 26.4499, 74.6399],
    ['Jaipur', 26.9124, 75.7873],
    ['Jodhpur', 26.2389, 73.0243],
    ['Rural Barmer', 25.75, 71.4],
  ];

  for (const [name, lat, lon] of SITES) {
    const towers = await analyzeTowers(towersDb as any, lat, lon);
    const resources = await analyzeResources(fiberDb as any, lat, lon);
    const population = analyzePopulation(popRaster as PopulationRaster, lat, lon, towers.densityPerKm2);
    const soilHit = lookupSoil(soil, lat, lon);
    const row = analyzeRow('Rajasthan', DEFAULT_ROW_RULES);
    const admin = buildAdminResult('Rajasthan', null);
    const target = { lat: lat + 0.03, lon: lon + 0.03 };
    const elev = await makeWindowSampler(`${PACK}/elevation/elevation.tif`, [{ lat, lon }, target]);
    const los = elev ? analyzeLos(elev as any, { lat, lon }, target, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 }) : null;

    const site = { id: 'x', name: `${name} QA`, lat, lon, createdAt: '2026-01-01' };
    const rep = buildReport(site as any, 'rajasthan', {
      population, towers, resources, row, los, soil: soilHit ?? {
        faoCode: null, soilType: 'Unknown', foundationSuitability: 'Unknown', foundationNote: '' }, admin,
    });

    console.log(`\n=== ${name} (${lat}, ${lon}) ===`);
    console.log(`  population   : 2km=${population.populationWithin2km.toLocaleString()} 5km=${population.populationWithin5km.toLocaleString()} density=${population.densityPerKm2}/km2 (${population.densityClassification}) source=${population.source}`);
    console.log(`  towers       : 1km=${towers.towersWithin1km} 2km=${towers.towersWithin2km} 5km=${towers.towersWithin5km} density=${towers.densityPerKm2}/km2 (${towers.saturationClassification})`);
    console.log(`  nearest tower: ${towers.nearbyTowers[0] ? '#' + towers.nearbyTowers[0].id + ' at ' + towers.nearbyTowers[0].distanceKm.toFixed(3) + ' km' : 'none'}`);
    console.log(`  fiber        : ${resources.nearestFiber.distanceKm} km (${resources.fiberAccessibility}) score=${resources.resourceScore}/5  detail="${resources.nearestFiber.detail}"`);
    console.log(`  soil         : ${soilHit ? soilHit.soilType + ' / ' + soilHit.foundationSuitability : 'no polygon'}`);
    console.log(`  LoS          : ${los ? `${los.losStatus} ${los.distanceKm} km rec=${los.recommendedTowerHeight}m rsrp=${los.estimatedRsrpDbm}dBm` : 'unavailable'}`);
    console.log(`  SCORE        : ${rep.executiveSummary.overallScore}/10 -> ${rep.executiveSummary.recommendation}`);
    console.log(`  findings     : ${rep.executiveSummary.keyFindings.join(' | ')}`);
    if (rep.executiveSummary.criticalIssues.length) console.log(`  issues       : ${rep.executiveSummary.criticalIssues.join(' | ')}`);
  }

  // Verify the report renders and its numbers agree with the model.
  const towers = await analyzeTowers(towersDb as any, 26.4499, 74.6399);
  const resources = await analyzeResources(fiberDb as any, 26.4499, 74.6399);
  const population = analyzePopulation(popRaster as PopulationRaster, 26.4499, 74.6399, towers.densityPerKm2);
  const site = { id: 'x', name: 'Ajmer QA', lat: 26.4499, lon: 74.6399, createdAt: '2026-01-01' };
  const rep = buildReport(site as any, 'rajasthan', {
    population, towers, resources, row: analyzeRow('Rajasthan'),
    los: null, soil: lookupSoil(soil, 26.4499, 74.6399)!, admin: buildAdminResult('Rajasthan', null),
  });
  const html = buildReportHtml(rep);
  console.log(`\nreport html length: ${html.length} chars`);
  console.log(`contains score: ${html.includes(rep.executiveSummary.overallScore + '/10')}`);

  towersDb.close(); fiberDb.close();
})();
