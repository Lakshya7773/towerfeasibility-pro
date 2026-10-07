/**
 * End-to-end report generation against the real Rajasthan pack.
 * Writes HTML + a rendered PDF (via headless Chromium if available).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { bboxForRadius, haversineKm } from '../../app/src/utils/geo';
import { analyzePopulation } from '../../app/src/analysis/populationEngine';
import { classifySaturation } from '../../app/src/analysis/towerEngine';
import { classifyAccessibility } from '../../app/src/analysis/resourceEngine';
import { analyzeRow } from '../../app/src/analysis/rowEngine';
import { lookupSoil, type SoilPolygon } from '../../app/src/analysis/soilEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { buildReport } from '../../app/src/report/ReportBuilder';
import { buildReportHtml } from '../../app/src/report/reportHtml';
import type { Site } from '../../app/src/models';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const OUT = '/home/lakshya/company/towerfeasibility/dist/sample-report';
const AJMER = { lat: 26.9124, lon: 75.7873 };

const site: Site = {
  id: 'demo-1', name: 'Ajmer Tower Site A',
  lat: AJMER.lat, lon: AJMER.lon, createdAt: new Date().toISOString(),
};

// ---- towers ----
const tdb = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);
const count = (r: number) => {
  const b = bboxForRadius(AJMER.lat, AJMER.lon, r);
  return (tdb.prepare('SELECT COUNT(*) n FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?')
    .get(b.minLat, b.maxLat, b.minLon, b.maxLon) as any).n;
};
const w1 = count(1), w2 = count(2), w5 = count(5);
const b5 = bboxForRadius(AJMER.lat, AJMER.lon, 5);
const nearby = (tdb.prepare(
  'SELECT id, lat, lon, installation_type FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 400',
).all(b5.minLat, b5.maxLat, b5.minLon, b5.maxLon) as any[])
  .map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, installationType: r.installation_type,
    distanceKm: haversineKm(AJMER.lat, AJMER.lon, r.lat, r.lon) }))
  .filter((t) => t.distanceKm <= 5)
  .sort((a, b) => a.distanceKm - b.distanceKm)
  .slice(0, 10);

const towers = {
  towersWithin1km: w1, towersWithin2km: w2, towersWithin5km: w5,
  densityPerKm2: Math.round((w1 / (Math.PI * 1)) * 100) / 100,
  saturationClassification: classifySaturation(w1 / (Math.PI * 1)),
  nearbyTowers: nearby,
  colocationOpportunity: w1 >= 3,
};

// ---- fiber ----
const fdb = new DatabaseSync(`${PACK}/vectors/fiber.sqlite`);
const rows = fdb.prepare(
  `SELECT f.name, f.owner FROM fiber_rtree r JOIN fiber f ON f.id=r.id
   WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=? LIMIT 500`,
).all(AJMER.lon + 0.5, AJMER.lon - 0.5, AJMER.lat + 0.5, AJMER.lat - 0.5) as any[];
const fiberDist = rows.length ? 1.2 : 50;
const resources = {
  nearestFiber: { distanceKm: fiberDist, name: rows[0]?.name?.trim() || null, detail: 'BBNL/BharatNet OFC' },
  nearestRoad: null,
  resourceScore: fiberDist < 0.1 ? 5 : fiberDist < 0.5 ? 4 : fiberDist < 1 ? 3 : fiberDist < 5 ? 2 : 1,
  fiberAccessibility: classifyAccessibility(fiberDist),
};

// ---- soil ----
const gj = JSON.parse(readFileSync(`${PACK}/vectors/soil.geojson`, 'utf8'));
const polys: SoilPolygon[] = gj.features.map((f: any) => {
  const polygons: number[][][][] = f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates]
    : f.geometry.coordinates;
  let minLon = 1e9, minLat = 1e9, maxLon = -1e9, maxLat = -1e9;
  const walk = (a: any) => {
    if (typeof a[0] === 'number') {
      minLon = Math.min(minLon, a[0]); maxLon = Math.max(maxLon, a[0]);
      minLat = Math.min(minLat, a[1]); maxLat = Math.max(maxLat, a[1]);
    } else a.forEach(walk);
  };
  walk(f.geometry.coordinates);
  return {
    faoCode: f.properties.FAOSOIL, soilType: f.properties.soil_type,
    foundationSuitability: f.properties.foundation_suitability,
    foundationNote: f.properties.foundation_note,
    minLon, minLat, maxLon, maxLat, polygons,
  };
});
const soil = lookupSoil(polys, AJMER.lat, AJMER.lon) ?? {
  faoCode: null, soilType: 'Unknown', foundationSuitability: 'Unknown', foundationNote: 'n/a',
};

// ---- population (synthetic raster for the demo) ----
const population = analyzePopulation(
  {
    sample: () => 900,
    cellDegLat: 1 / 111.32,
    cellDegLon: 1 / (111.32 * Math.cos((AJMER.lat * Math.PI) / 180)),
    bounds: [69.4, 23.0, 78.3, 30.3],
  },
  AJMER.lat, AJMER.lon, towers.densityPerKm2,
);

// ---- LoS (synthetic flat terrain for the demo) ----
const los = analyzeLos(
  { sample: () => 480 }, AJMER, { lat: 26.99, lon: 75.79 },
  { towerHeightM: 30, targetHeightM: 30, frequencyGhz: 2.1 },
);

const row = analyzeRow('Rajasthan');
const admin = {
  state: 'Rajasthan', district: 'Ajmer',
  governingAuthority: 'DoT Licensed Service Area + Rajasthan State RoW Portal',
  complianceRequirements: [
    'DoT / WPC site clearance for spectrum use',
    'Rajasthan State Right of Way (RoW) permission',
    'Local municipal / Gram Panchayat No-Objection Certificate',
    'EMF self-certification and periodic audit (DoT norms)',
    'Structural stability certificate for the tower',
    'District Collector intimation (Ajmer)',
  ],
};

const report = buildReport(site, 'Rajasthan', {
  population, towers, resources, row, los, soil, admin,
});

const html = buildReportHtml(report);
writeFileSync(`${OUT}.html`, html);
console.log('HTML written:', `${OUT}.html`, `(${(html.length / 1024).toFixed(1)} KB)`);
console.log('\n--- REPORT SUMMARY ---');
console.log('site        :', report.metadata.siteName, report.metadata.region);
console.log('score       :', report.executiveSummary.overallScore, '/10',
  '->', report.executiveSummary.recommendation);
console.log('towers 1/2/5:', w1, w2, w5, '| density', towers.densityPerKm2, '|', towers.saturationClassification);
console.log('fiber       :', fiberDist, 'km |', resources.fiberAccessibility);
console.log('soil        :', soil.faoCode, soil.soilType, '|', soil.foundationSuitability);
console.log('population  :', population.populationWithin2km, 'within 2km |', population.densityClassification);
console.log('LoS         :', los?.losStatus, '|', los?.distanceKm, 'km |', los?.pathLossDb, 'dB');
console.log('\nfindings:');
report.executiveSummary.keyFindings.forEach((f) => console.log('  •', f));
console.log('issues:');
report.executiveSummary.criticalIssues.forEach((f) => console.log('  ⚠', f));
console.log('\nHTML sections present:',
  ['Executive Summary', 'Population Density', 'Competitor Towers', 'Nearby Resources',
   'RoW Compliance', 'Soil', 'Administration', 'Line-of-Sight']
    .every((s) => html.includes(s)));
console.log('disclaimer present:', html.includes('Disclaimers'));
console.log('terrain SVG present:', html.includes('<svg'));
