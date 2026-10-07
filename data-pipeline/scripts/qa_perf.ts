/**
 * PERFORMANCE & RESOURCE MEASUREMENT — real engines, real pack.
 * Records wall time and peak RSS for the operations a user actually waits on.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { analyzeTowers } from '../../app/src/analysis/towerEngine';
import { analyzeResources } from '../../app/src/analysis/resourceEngine';
import { analyzePopulation } from '../../app/src/analysis/populationEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { lookupSoil } from '../../app/src/analysis/soilEngine';
import { buildReport } from '../../app/src/report/ReportBuilder';
import { buildReportHtml } from '../../app/src/report/reportHtml';
import { planWindow } from '../../app/src/data/windowPlan';

const APP = '/home/lakshya/company/towerfeasibility/app';
const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const geotiff = require(path.join(APP, 'node_modules', 'geotiff'));

const mb = (b: number) => (b / 1048576).toFixed(1);
function rss() { return process.memoryUsage().rss; }

function shim(file: string) {
  const raw = new DatabaseSync(file);
  return {
    async getAllAsync(sql: string, p: any[] = []) { return raw.prepare(sql).all(...p) as any[]; },
    async getFirstAsync(sql: string, p: any[] = []) { return (raw.prepare(sql).get(...p) as any) ?? null; },
  };
}

async function time<T>(label: string, fn: () => Promise<T> | T): Promise<{ ms: number; rssMb: number; out: T }> {
  const r0 = rss();
  const t0 = process.hrtime.bigint();
  const out = await fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const peak = Math.max(0, rss() - r0);
  console.log(`  ${label.padEnd(46)} ${ms.toFixed(1).padStart(9)} ms   +${mb(peak).padStart(6)} MB RSS`);
  return { ms, rssMb: peak / 1048576, out };
}

(async () => {
  console.log('PERFORMANCE — real engines against the shipped Rajasthan pack\n');
  const baseRss = rss();
  console.log(`  baseline RSS: ${mb(baseRss)} MB\n`);

  const tdb = shim(`${PACK}/vectors/towers.sqlite`);
  const fdb = shim(`${PACK}/vectors/fiber.sqlite`);

  console.log('--- per-site analysis (the interactive path) ---');
  const SITES: [string, number, number][] = [
    ['Ajmer', 26.4499, 74.6399],
    ['Jaipur (dense)', 26.9124, 75.7873],
    ['Jodhpur', 26.2389, 73.0243],
  ];
  for (const [name, lat, lon] of SITES) {
    console.log(`\n  [${name}]`);
    await time('analyzeTowers (1/2/5 km + nearest)', () => analyzeTowers(tdb as any, lat, lon));
    await time('analyzeResources (fiber rtree + WKT parse)', () => analyzeResources(fdb as any, lat, lon));
  }

  console.log('\n--- population raster (decoded once, then sampled) ---');
  const popBuf = readFileSync(`${PACK}/population/population.tif`);
  const popTiff = await geotiff.fromArrayBuffer(popBuf.buffer.slice(popBuf.byteOffset, popBuf.byteOffset + popBuf.byteLength));
  const popImg = await popTiff.getImage();
  const popOrigin = popImg.getOrigin();
  const popRes = popImg.getResolution();
  const popW = popImg.getWidth(), popH = popImg.getHeight();
  const popNodata = popImg.getGDALNoData() != null ? Number(popImg.getGDALNoData()) : null;
  const popBand = await time('decode population raster (1068x876)', async () =>
    (await popImg.readRasters({ interleave: false }))[0] as ArrayLike<number>);
  const popSampler = {
    sample: (lat: number, lon: number) => {
      const c = Math.floor((lon - popOrigin[0]) / popRes[0]);
      const r = Math.floor((lat - popOrigin[1]) / popRes[1]);
      if (r < 0 || c < 0 || r >= popH || c >= popW) return null;
      const v = popBand.out[r * popW + c];
      if (v == null || !Number.isFinite(v) || (popNodata != null && v === popNodata)) return null;
      return v;
    },
    cellDegLat: Math.abs(popRes[1]), cellDegLon: Math.abs(popRes[0]),
    bounds: [popOrigin[0], popOrigin[1] - popH * Math.abs(popRes[1]), popOrigin[0] + popW * popRes[0], popOrigin[1]] as [number, number, number, number],
    originLat: popOrigin[1], originLon: popOrigin[0],
  };
  await time('analyzePopulation (2/5/10 km integration)', () => analyzePopulation(popSampler as any, 26.4499, 74.6399, 0));

  console.log('\n--- elevation window decode (the LoS cost) ---');
  for (const [label, spanDeg] of [['~4.5 km default path', 0.03], ['~50 km path', 0.35], ['~200 km path', 1.4]] as [string, number][]) {
    const t0 = Date.now();
    const elevBuf = readFileSync(`${PACK}/elevation/elevation.tif`);
    const tiff = await geotiff.fromArrayBuffer(elevBuf.buffer.slice(elevBuf.byteOffset, elevBuf.byteOffset + elevBuf.byteLength));
    const img = await tiff.getImage();
    const o = img.getOrigin(), r = img.getResolution();
    const plan = planWindow(
      { width: img.getWidth(), height: img.getHeight(), originX: o[0], originY: o[1], resX: r[0], resY: r[1] },
      [{ lat: 26.4499, lon: 74.6399 }, { lat: 26.4499 + spanDeg, lon: 74.6399 + spanDeg }], 16);
    if (!plan) { console.log(`  ${label}: no window`); continue; }
    const outBytes = plan.outW * plan.outH * 4;
    console.log(`  ${label.padEnd(24)} window ${plan.w}x${plan.h} -> stride ${plan.stride} -> ${plan.outW}x${plan.outH} = ${mb(outBytes)} MB (${plan.rowsPerBand}-row bands), metadata ${Date.now() - t0} ms`);
  }

  console.log('\n--- soil lookup ---');
  const soilGj = JSON.parse(readFileSync(`${PACK}/vectors/soil.geojson`, 'utf8'));
  const soil = soilGj.features.map((f: any) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    const walk = (a: any) => { if (typeof a[0] === 'number') { minLon = Math.min(minLon, a[0]); maxLon = Math.max(maxLon, a[0]); minLat = Math.min(minLat, a[1]); maxLat = Math.max(maxLat, a[1]); } else a.forEach(walk); };
    walk(g.coordinates);
    return { faoCode: f.properties.FAOSOIL, soilType: f.properties.soil_type, foundationSuitability: f.properties.foundation_suitability, foundationNote: f.properties.foundation_note, minLon, minLat, maxLon, maxLat, polygons: polys };
  });
  await time('lookupSoil over 40 polygons', () => lookupSoil(soil, 26.4499, 74.6399));

  console.log('\n--- report generation ---');
  const towers = await analyzeTowers(tdb as any, 26.4499, 74.6399);
  const resources = await analyzeResources(fdb as any, 26.4499, 74.6399);
  const population = analyzePopulation(popSampler as any, 26.4499, 74.6399, 0);
  const soilHit = lookupSoil(soil, 26.4499, 74.6399);
  const flat = { sample: () => 300 };
  const los = analyzeLos(flat as any, { lat: 26.4499, lon: 74.6399 }, { lat: 26.48, lon: 74.67 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
  const bundle = {
    population, towers, resources,
    row: { state: 'Rajasthan', applicationFee: 10000, estimatedTotalCost: 10100, approvalTimelineDays: 45, deemedApprovalDays: 67, requiredDocuments: ['a'] },
    los, soil: soilHit ?? { faoCode: null, soilType: 'Unknown', foundationSuitability: 'Unknown', foundationNote: '' },
    admin: { state: 'Rajasthan', district: null, governingAuthority: 'x', complianceRequirements: [] },
  };
  const site = { id: 's', name: 'Ajmer', lat: 26.4499, lon: 74.6399, createdAt: '2026-01-01' };
  const rep = await time('buildReport (scoring + assembly)', () => buildReport(site as any, 'rajasthan', bundle as any));
  await time('buildReportHtml (render)', () => buildReportHtml(rep.out));
  console.log(`  report HTML length: ${buildReportHtml(rep.out).length} chars`);

  console.log(`\n  final RSS: ${mb(rss())} MB (baseline ${mb(baseRss)} MB)`);
})();
