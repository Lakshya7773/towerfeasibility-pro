/**
 * ADVERSARIAL / NEGATIVE TESTING — the engines must fail safely on degenerate
 * data and never silently produce a misleading feasibility result.
 *
 * Covers: empty dataset, single record, duplicate-heavy, nulls, malformed
 * geometry, missing rtree, absurd values, and interrupted/corrupt inputs.
 */
import { DatabaseSync } from 'node:sqlite';

import { analyzeTowers, classifySaturation } from '../../app/src/analysis/towerEngine';
import { nearestFiber, analyzeResources, classifyAccessibility } from '../../app/src/analysis/resourceEngine';
import { analyzePopulation, classifyDensity } from '../../app/src/analysis/populationEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { lookupSoil } from '../../app/src/analysis/soilEngine';
import { scoreFeasibility, buildReport } from '../../app/src/report/ReportBuilder';
import { buildReportHtml } from '../../app/src/report/reportHtml';
import { decodeLineGeom } from '../../app/src/utils/wkb';
import { haversineKm, bboxForRadius, pointToSegmentKm } from '../../app/src/utils/geo';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}${d ? '  -> ' + d : ''}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? '  -> ' + d : ''}`); }
};

/** Wrap a real node:sqlite DB in the expo-sqlite async shape. */
function shim(raw: DatabaseSync) {
  return {
    async getAllAsync(sql: string, p: any[] = []) { return raw.prepare(sql).all(...p) as any[]; },
    async getFirstAsync(sql: string, p: any[] = []) { return (raw.prepare(sql).get(...p) as any) ?? null; },
  };
}

/** Fresh in-memory towers DB. */
function towersDb(rows: any[]) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE towers (id INTEGER PRIMARY KEY, lat REAL, lon REAL,
    operator TEXT, installation_type TEXT)`);
  const ins = db.prepare('INSERT INTO towers (id,lat,lon,operator,installation_type) VALUES (?,?,?,?,?)');
  for (const r of rows) ins.run(r.id, r.lat, r.lon, r.operator ?? null, r.installation_type ?? null);
  return shim(db);
}

function fiberDb(rows: any[], withRtree = true) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE fiber (id INTEGER PRIMARY KEY, name TEXT, owner TEXT,
    seg_length REAL, minx REAL, miny REAL, maxx REAL, maxy REAL, geom BLOB)`);
  if (withRtree) db.exec('CREATE VIRTUAL TABLE fiber_rtree USING rtree(id, minx, maxx, miny, maxy)');
  const ins = db.prepare('INSERT INTO fiber (id,name,owner,seg_length,minx,miny,maxx,maxy,geom) VALUES (?,?,?,?,?,?,?,?,?)');
  const insR = withRtree ? db.prepare('INSERT INTO fiber_rtree (id,minx,maxx,miny,maxy) VALUES (?,?,?,?,?)') : null;
  for (const r of rows) {
    ins.run(r.id, r.name ?? null, r.owner ?? null, r.seg_length ?? null,
      r.minx, r.miny, r.maxx, r.maxy, r.geom);
    insR?.run(r.id, r.minx, r.maxx, r.miny, r.maxy);
  }
  return shim(db);
}

(async () => {
  const AJ = { lat: 26.4499, lon: 74.6399 };

  // =======================================================================
  console.log('\n1. EMPTY DATASETS');
  // =======================================================================
  const tEmpty = await analyzeTowers(towersDb([]) as any, AJ.lat, AJ.lon);
  ok('empty towers -> zero counts, no throw',
    tEmpty.towersWithin1km === 0 && tEmpty.towersWithin5km === 0 && tEmpty.nearbyTowers.length === 0,
    `1km=${tEmpty.towersWithin1km} nearby=${tEmpty.nearbyTowers.length}`);
  ok('empty towers -> density 0', tEmpty.densityPerKm2 === 0, `${tEmpty.densityPerKm2}`);
  ok('empty towers -> classification Low (not NaN/Saturated)', tEmpty.saturationClassification === 'Low', tEmpty.saturationClassification);
  ok('empty towers -> density is a finite number', Number.isFinite(tEmpty.densityPerKm2), `${tEmpty.densityPerKm2}`);

  const fEmpty = await analyzeResources(fiberDb([]) as any, AJ.lat, AJ.lon);
  ok('empty fiber -> returns a result, not null/throw', fEmpty != null, 'result');
  ok('empty fiber -> flagged as no fiber within 50 km', fEmpty.nearestFiber.distanceKm >= 50, `${fEmpty.nearestFiber.distanceKm} km`);
  ok('empty fiber -> resource score floors at 1', fEmpty.resourceScore === 1, `${fEmpty.resourceScore}/5`);
  ok('empty fiber -> does NOT claim Good/Excellent access', fEmpty.fiberAccessibility === 'Poor', fEmpty.fiberAccessibility);

  const pEmpty = analyzePopulation(null, AJ.lat, AJ.lon, 0);
  ok('null population raster -> falls back to a proxy, tagged', pEmpty.source === 'tower-proxy', pEmpty.source);
  ok('null raster -> fallback population is finite', Number.isFinite(pEmpty.populationWithin2km), `${pEmpty.populationWithin2km}`);
  ok('null raster -> fallback is not presented as measured', pEmpty.source !== 'worldpop', pEmpty.source);

  // =======================================================================
  console.log('\n2. SINGLE RECORD');
  // =======================================================================
  const tOne = await analyzeTowers(towersDb([{ id: 1, lat: AJ.lat, lon: AJ.lon, installation_type: '4G' }]) as any, AJ.lat, AJ.lon);
  ok('single tower at the site -> counted in 1/2/5 km', tOne.towersWithin1km === 1 && tOne.towersWithin5km === 1,
    `1km=${tOne.towersWithin1km} 5km=${tOne.towersWithin5km}`);
  ok('single tower at the site -> distance 0', tOne.nearbyTowers[0]?.distanceKm === 0, `${tOne.nearbyTowers[0]?.distanceKm}`);
  ok('single tower -> colocationOpportunity false (< 3)', tOne.colocationOpportunity === false, `${tOne.colocationOpportunity}`);

  const fOne = await analyzeResources(fiberDb([{
    id: 1, name: 'SEG', owner: 'BBNL', seg_length: 1,
    minx: AJ.lon - 0.01, maxx: AJ.lon + 0.01, miny: AJ.lat - 0.01, maxy: AJ.lat + 0.01,
    geom: `LINESTRING (${AJ.lon - 0.01} ${AJ.lat}, ${AJ.lon + 0.01} ${AJ.lat})`,
  }]) as any, AJ.lat, AJ.lon);
  ok('single fiber segment -> found with ~0 distance', fOne.nearestFiber.distanceKm < 0.05, `${fOne.nearestFiber.distanceKm} km`);
  ok('single fiber segment -> Excellent/Good accessibility', ['Excellent', 'Good'].includes(fOne.fiberAccessibility), fOne.fiberAccessibility);

  // =======================================================================
  console.log('\n3. DUPLICATE-HEAVY DATA');
  // =======================================================================
  const dupes = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, lat: AJ.lat, lon: AJ.lon, installation_type: '4G' }));
  const tDup = await analyzeTowers(towersDb(dupes) as any, AJ.lat, AJ.lon);
  ok('500 coincident towers all counted (no silent dedupe)', tDup.towersWithin1km === 500, `${tDup.towersWithin1km}`);
  ok('duplicate-heavy density scales linearly', Math.abs(tDup.densityPerKm2 - 500 / (Math.PI)) < 0.1, `${tDup.densityPerKm2}`);
  ok('duplicate-heavy -> Saturated classification', tDup.saturationClassification === 'Saturated', tDup.saturationClassification);
  ok('nearby list capped at 10 even with 500 candidates', tDup.nearbyTowers.length === 10, `${tDup.nearbyTowers.length}`);

  // =======================================================================
  console.log('\n4. NULLS / MALFORMED VALUES');
  // =======================================================================
  const tNull = await analyzeTowers(towersDb([
    { id: 1, lat: AJ.lat, lon: AJ.lon, installation_type: null },
    { id: 2, lat: AJ.lat + 0.002, lon: AJ.lon, installation_type: null },
  ]) as any, AJ.lat, AJ.lon);
  ok('null installation_type does not throw', tNull.nearbyTowers.length === 2, `${tNull.nearbyTowers.length}`);
  ok('null installation_type surfaces as null, not "undefined"', tNull.nearbyTowers[0].installationType === null, String(tNull.nearbyTowers[0].installationType));

  // Malformed geometry variants
  ok('null geom -> null', decodeLineGeom(null) === null, 'null');
  ok('empty Uint8Array -> null', decodeLineGeom(new Uint8Array(0)) === null, 'null');
  ok('random bytes -> null, no throw', decodeLineGeom(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9])) === null, 'null');
  ok('WKT with NaN coords -> null', decodeLineGeom('LINESTRING (NaN NaN, 1 1)') === null, 'null');
  ok('truncated WKB (declares 5 points, has 1) -> null', (() => {
    const b = new Uint8Array(1 + 4 + 4 + 16);
    const dv = new DataView(b.buffer);
    dv.setUint8(0, 1); dv.setUint32(1, 2, true); dv.setUint32(5, 5, true);
    return decodeLineGeom(b) === null;
  })(), 'null');
  ok('absurd point count (0xFFFFFFFF) -> null, no OOM', (() => {
    const b = new Uint8Array(1 + 4 + 4);
    const dv = new DataView(b.buffer);
    dv.setUint8(0, 1); dv.setUint32(1, 2, true); dv.setUint32(5, 0xffffffff, true);
    return decodeLineGeom(b) === null;
  })(), 'null');

  // Missing rtree table must not crash the fiber engine
  let missingRtreeThrew = false;
  try {
    const bad = fiberDb([{ id: 1, minx: 74, maxx: 75, miny: 26, maxy: 27, geom: 'LINESTRING (74 26, 75 27)' }], false);
    await analyzeResources(bad as any, AJ.lat, AJ.lon);
  } catch { missingRtreeThrew = true; }
  ok('missing fiber_rtree does not crash the resource engine', !missingRtreeThrew, missingRtreeThrew ? 'threw' : 'handled');

  // =======================================================================
  console.log('\n5. EXTREME / IMPOSSIBLE COORDINATES');
  // =======================================================================
  ok('haversine at identical points = 0', haversineKm(0, 0, 0, 0) === 0, '0');
  ok('haversine across the antimeridian is short, not ~40,000 km',
    haversineKm(0, 179.9, 0, -179.9) < 30, `${haversineKm(0, 179.9, 0, -179.9).toFixed(2)} km`);
  ok('haversine pole to pole ~20,000 km', Math.abs(haversineKm(90, 0, -90, 0) - 20015) < 100, `${haversineKm(90, 0, -90, 0).toFixed(0)} km`);
  ok('haversine is symmetric', haversineKm(26, 75, 28, 77) === haversineKm(28, 77, 26, 75), 'equal');
  ok('pointToSegment with zero-length segment = point distance',
    Math.abs(pointToSegmentKm(26, 75, 26.01, 75, 26.01, 75) - 1.1132) < 0.01, `${pointToSegmentKm(26, 75, 26.01, 75, 26.01, 75).toFixed(4)}`);
  // bbox at the pole must not divide by ~0
  const poleBbox = bboxForRadius(89.99, 0, 5);
  ok('bboxForRadius near the pole stays finite', Number.isFinite(poleBbox.minLon) && Number.isFinite(poleBbox.maxLon),
    `lon span ${(poleBbox.maxLon - poleBbox.minLon).toExponential(2)}`);
  // A tower at an impossible coordinate must not be counted as nearby
  const tBad = await analyzeTowers(towersDb([
    { id: 1, lat: 999, lon: 999, installation_type: '4G' },
    { id: 2, lat: -999, lon: -999, installation_type: '4G' },
  ]) as any, AJ.lat, AJ.lon);
  ok('impossible tower coordinates are not counted as nearby', tBad.towersWithin5km === 0, `${tBad.towersWithin5km}`);

  // =======================================================================
  console.log('\n6. CLASSIFIER BOUNDARIES (threshold +/- epsilon)');
  // =======================================================================
  const eps = 1e-9;
  ok('saturation 2 - e -> Low', classifySaturation(2 - eps) === 'Low', classifySaturation(2 - eps));
  ok('saturation exactly 2 -> Medium', classifySaturation(2) === 'Medium', classifySaturation(2));
  ok('saturation 5 - e -> Medium', classifySaturation(5 - eps) === 'Medium', classifySaturation(5 - eps));
  ok('saturation exactly 5 -> High', classifySaturation(5) === 'High', classifySaturation(5));
  ok('saturation exactly 10 -> Saturated', classifySaturation(10) === 'Saturated', classifySaturation(10));
  ok('saturation negative -> Low (no crash)', classifySaturation(-5) === 'Low', classifySaturation(-5));
  ok('saturation NaN -> Low (safe default)', classifySaturation(NaN) === 'Low', classifySaturation(NaN));
  ok('density exactly 100 -> Semi-urban', classifyDensity(100) === 'Semi-urban', classifyDensity(100));
  ok('density 99.999 -> Rural', classifyDensity(99.999) === 'Rural', classifyDensity(99.999));
  ok('density exactly 1500 -> Dense urban', classifyDensity(1500) === 'Dense urban', classifyDensity(1500));
  ok('accessibility exactly 1.0 km -> Poor', classifyAccessibility(1.0) === 'Poor', classifyAccessibility(1.0));
  ok('accessibility 0.0999 km -> Excellent', classifyAccessibility(0.0999) === 'Excellent', classifyAccessibility(0.0999));

  // =======================================================================
  console.log('\n7. LoS DEGENERATE INPUTS');
  // =======================================================================
  const flat = { sample: () => 300 };
  const opt = { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 };
  ok('null sampler -> null', analyzeLos(null, { lat: 26, lon: 75 }, { lat: 26.1, lon: 75 }, opt) === null, 'null');
  ok('zero-length path -> null', analyzeLos(flat as any, { lat: 26, lon: 75 }, { lat: 26, lon: 75 }, opt) === null, 'null');
  ok('sampler returning null -> null', analyzeLos({ sample: () => null } as any, { lat: 26, lon: 75 }, { lat: 26.1, lon: 75 }, opt) === null, 'null');
  ok('zero tower height -> still produces a result', analyzeLos(flat as any, { lat: 26, lon: 75 }, { lat: 26.01, lon: 75 }, { ...opt, towerHeightM: 0 }) != null, 'result');
  ok('negative tower height does not throw', (() => { try { analyzeLos(flat as any, { lat: 26, lon: 75 }, { lat: 26.01, lon: 75 }, { ...opt, towerHeightM: -10 }); return true; } catch { return false; } })(), 'no throw');
  ok('zero frequency does not divide by zero', (() => {
    const r = analyzeLos(flat as any, { lat: 26, lon: 75 }, { lat: 26.01, lon: 75 }, { ...opt, frequencyGhz: 0 });
    return r == null || (Number.isFinite(r.pathLossDb) || r.pathLossDb === 0);
  })(), 'safe');
  ok('absurd path (1000 km) does not hang or throw', (() => {
    const t0 = Date.now();
    const r = analyzeLos(flat as any, { lat: 10, lon: 70 }, { lat: 19, lon: 70 }, opt);
    return Date.now() - t0 < 5000 && (r == null || Number.isFinite(r.distanceKm));
  })(), 'bounded');

  // =======================================================================
  console.log('\n8. SOIL LOOKUP DEGENERATE INPUTS');
  // =======================================================================
  ok('empty polygon list -> null', lookupSoil([], 26, 75) === null, 'null');
  ok('polygon with empty ring -> null, no throw', (() => {
    try {
      return lookupSoil([{ faoCode: 'X', soilType: 'X', foundationSuitability: 'X', foundationNote: '',
        minLon: 0, minLat: 0, maxLon: 100, maxLat: 100, polygons: [[[]]] }], 26, 75) === null;
    } catch { return false; }
  })(), 'handled');
  ok('degenerate 2-point ring -> null, no throw', (() => {
    try {
      return lookupSoil([{ faoCode: 'X', soilType: 'X', foundationSuitability: 'X', foundationNote: '',
        minLon: 0, minLat: 0, maxLon: 100, maxLat: 100, polygons: [[[[70, 20], [80, 30]]]] }], 26, 75) === null;
    } catch { return false; }
  })(), 'handled');

  // =======================================================================
  console.log('\n9. SCORING / REPORT NEVER PRODUCES MISLEADING OUTPUT');
  // =======================================================================
  const bundle = (o: any = {}) => ({
    population: { populationWithin2km: 1000, populationWithin5km: 6000, populationWithin10km: 25000,
      densityPerKm2: 500, densityClassification: 'Urban', serviceablePopulation: 700, source: 'worldpop', ...o.population },
    towers: { towersWithin1km: 1, towersWithin2km: 4, towersWithin5km: 20, densityPerKm2: 1,
      saturationClassification: 'Low', nearbyTowers: [], colocationOpportunity: false, ...o.towers },
    resources: { nearestFiber: { distanceKm: 0.05, name: 'x', detail: 'y' }, nearestRoad: null,
      resourceScore: 5, fiberAccessibility: 'Excellent', ...o.resources },
    row: { state: 'Rajasthan', applicationFee: 10000, estimatedTotalCost: 10100,
      approvalTimelineDays: 45, deemedApprovalDays: 67, requiredDocuments: ['a'] },
    los: o.los === undefined ? { losStatus: 'Clear', terrainProfile: [], fresnelClearance: true,
      recommendedTowerHeight: 30, pathLossDb: 100, estimatedRsrpDbm: -54, distanceKm: 5 } : o.los,
    soil: { faoCode: 'X', soilType: 'Alluvial', foundationSuitability: 'Best', foundationNote: '', ...o.soil },
    admin: { state: 'Rajasthan', district: null, governingAuthority: 'x', complianceRequirements: [] },
  });

  const nanB = scoreFeasibility(bundle({ population: { densityClassification: NaN, densityPerKm2: NaN } }) as any);
  ok('NaN population -> finite score', Number.isFinite(nanB.score), `${nanB.score}`);
  ok('NaN population -> valid recommendation', ['Go', 'Conditional', 'No-Go'].includes(nanB.recommendation), nanB.recommendation);
  // Match a NUMBER rendered as NaN (e.g. "NaN/km²"), not the word "unavailable".
  const leaksNumber = (strs: string[]) => strs.some((f) => /(^|[^a-zA-Z])NaN([^a-zA-Z]|$)/.test(f));
  ok('NaN population -> no numeric NaN leaks into findings', !leaksNumber(nanB.keyFindings), nanB.keyFindings.join(' | '));

  const infB = scoreFeasibility(bundle({ population: { densityPerKm2: Infinity, densityClassification: 'Urban' } }) as any);
  ok('Infinity density -> finite score', Number.isFinite(infB.score), `${infB.score}`);

  const negB = scoreFeasibility(bundle({ population: { densityPerKm2: -100, densityClassification: 'Rural' } }) as any);
  ok('negative density -> score within 1..10', negB.score >= 1 && negB.score <= 10, `${negB.score}`);

  // A blocked site must never say "Go"
  const blocked = scoreFeasibility(bundle({
    soil: { foundationSuitability: 'Poor', soilType: 'Saline' },
    towers: { saturationClassification: 'Saturated', densityPerKm2: 40 },
  }) as any);
  ok('site with critical issues never recommends Go', blocked.recommendation !== 'Go', blocked.recommendation);
  ok('site with critical issues reports them', blocked.criticalIssues.length > 0, `${blocked.criticalIssues.length} issues`);

  // Report must not contain NaN/undefined/[object Object] for degenerate input
  const site = { id: 's', name: 'QA', lat: 26.4499, lon: 74.6399, createdAt: '2026-01-01' };
  const html = buildReportHtml(buildReport(site as any, 'rajasthan', bundle() as any));
  ok('report HTML has no NaN', !/NaN/.test(html), 'clean');
  ok('report HTML has no "undefined"', !/undefined/.test(html), 'clean');
  ok('report HTML has no "[object"', !/\[object/.test(html), 'clean');
  const htmlNoLos = buildReportHtml(buildReport(site as any, 'rajasthan', bundle({ los: null }) as any));
  ok('report with null LoS renders a fallback, not a crash', htmlNoLos.includes('Line-of-Sight'), 'section present');
  ok('report with null LoS has no NaN', !/NaN/.test(htmlNoLos), 'clean');

  // XSS in a site name must be escaped
  const xss = buildReportHtml(buildReport({ ...site, name: '<script>alert(1)</script>' } as any, 'rajasthan', bundle() as any));
  ok('HTML-escapes a malicious site name (no raw <script>)', !/<script>alert/.test(xss) && xss.includes('&lt;script&gt;'), 'escaped');

  console.log(`\nADVERSARIAL SUITE: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
