/**
 * ============================================================================
 * ADVERSARIAL QA SUITE — geometry, classification, integration, scoring
 * ============================================================================
 *
 * Independent verification. Nothing here trusts the application's own
 * implementation: expected values are derived from closed-form geometry,
 * a second (Vincenty) distance algorithm, and analytic integrals.
 *
 * Run: npx tsx data-pipeline/scripts/qa_suite_core.ts
 */

import { DatabaseSync } from 'node:sqlite';

import {
  haversineKm, bboxForRadius, circleAreaKm2, pointToSegmentKm,
  earthCurvatureDropM, curvatureBulgeM, fresnelRadiusM, fsplDb, EARTH_RADIUS_KM,
} from '../../app/src/utils/geo';
import { classifyDensity, analyzePopulation } from '../../app/src/analysis/populationEngine';
import { classifySaturation } from '../../app/src/analysis/towerEngine';
import { classifyAccessibility } from '../../app/src/analysis/resourceEngine';
import { lookupSoil, type SoilPolygon } from '../../app/src/analysis/soilEngine';
import { lookupAdmin, type AdminBoundary } from '../../app/src/analysis/adminEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { scoreFeasibility } from '../../app/src/report/ReportBuilder';
import { analyzeRow, DEFAULT_ROW_RULES } from '../../app/src/analysis/rowEngine';
import { buildReportHtml, terrainSvg } from '../../app/src/report/reportHtml';
import { buildReport } from '../../app/src/report/ReportBuilder';
import { decodeWkbLine } from '../../app/src/utils/wkb';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? '  -> ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`); }

// ===========================================================================
// INDEPENDENT REFERENCES
// ===========================================================================

/**
 * Geodesic reference distances (km) computed with PROJ (pyproj 3.8.0,
 * `Geod(ellps='WGS84').inv`) — an independent, industry-standard geodesic
 * implementation, NOT a hand-rolled formula.
 *
 * NOTE: an earlier version of this suite compared haversine against a
 * hand-written Vincenty inverse. That reference was itself buggy (it produced
 * 635 km for the 125 km Jaipur->Ajmer leg), so its "failures" were false.
 * Regenerate with:
 *   python -c "import pyproj; g=pyproj.Geod(ellps='WGS84'); print(g.inv(lon1,lat1,lon2,lat2)[2]/1000)"
 */
const GEODESIC_KM: [string, number, number, number, number, number][] = [
  ['identical point', 26.9124, 75.7873, 26.9124, 75.7873, 0.000000],
  ['~1 km', 26.9124, 75.7873, 26.9214, 75.7873, 0.997220],
  ['~10 km', 26.9124, 75.7873, 27.0024, 75.7873, 9.972257],
  ['~50 km', 26.9124, 75.7873, 27.3624, 75.7873, 49.862560],
  ['Jaipur->Ajmer', 26.9124, 75.7873, 26.4499, 74.6399, 125.173623],
  ['Jaipur->Delhi', 26.9124, 75.7873, 28.6139, 77.2090, 234.925802],
  ['across equator', -1.0000, 36.0000, 1.0000, 36.0000, 221.148777],
  ['across prime meridian', 51.5000, -0.5000, 51.5000, 0.5000, 69.439977],
  ['near antimeridian', 0.0000, 179.9000, 0.0000, -179.9000, 22.263898],
  ['poles', 89.9000, 0.0000, 89.9000, 180.0000, 22.338796],
];

// ===========================================================================
section('1. GEOMETRY — independent verification');
// ===========================================================================

console.log('\n-- haversine vs PROJ geodesic (WGS84 ellipsoid) --');
let maxRel = 0;
for (const [name, la1, lo1, la2, lo2, truth] of GEODESIC_KM) {
  const h = haversineKm(la1, lo1, la2, lo2);
  const rel = truth > 0.001 ? Math.abs(h - truth) / truth : Math.abs(h - truth);
  maxRel = Math.max(maxRel, rel);
  console.log(`    ${name.padEnd(22)} haversine=${h.toFixed(4)} km  PROJ=${truth.toFixed(4)} km  rel=${(rel * 100).toFixed(4)}%`);
}
// Spherical haversine vs the ellipsoidal geodesic differs by up to ~0.5%
// (earth flattening ~1/298). Anything beyond that indicates a formula error.
check('haversine within 0.6% of PROJ geodesic on all cases', maxRel < 0.006,
  `max relative error ${(maxRel * 100).toFixed(4)}%`);

console.log('\n-- haversine degenerate / adversarial --');
check('identical points = 0', haversineKm(26.9, 75.7, 26.9, 75.7) === 0, '0');
check('symmetric', haversineKm(26.9, 75.7, 27.5, 76.5) === haversineKm(27.5, 76.5, 26.9, 75.7), 'equal');
check('non-negative', haversineKm(0, 0, -45, -90) >= 0, '>= 0');
check('finite for extreme coords', Number.isFinite(haversineKm(89.99, 179.99, -89.99, -179.99)), 'finite');
check('triangle inequality holds (Jaipur-Ajmer-Kota)',
  haversineKm(26.9124, 75.7873, 25.2138, 75.8648) <=
  haversineKm(26.9124, 75.7873, 26.4499, 74.6399) + haversineKm(26.4499, 74.6399, 25.2138, 75.8648) + 1e-9,
  'holds');

console.log('\n-- bboxForRadius --');
const bb = bboxForRadius(26.9124, 75.7873, 5);
check('bbox contains centre', bb.minLat < 26.9124 && bb.maxLat > 26.9124 && bb.minLon < 75.7873 && bb.maxLon > 75.7873, 'yes');
check('bbox lat half-width = r/111.32', Math.abs((bb.maxLat - 26.9124) - 5 / 111.32) < 1e-12, `${(bb.maxLat - 26.9124).toFixed(6)}`);
check('bbox lon half-width >= lat half-width (India)', (bb.maxLon - 75.7873) > (bb.maxLat - 26.9124), 'wider in lon');
// A bbox is NOT a disc: its area is 4r^2 vs pi r^2. Document the factor.
const r = 5, dLatDeg = r / 111.32, dLonDeg = r / (111.32 * Math.cos(26.9124 * Math.PI / 180));
const bboxAreaKm2 = (2 * dLatDeg * 111.32) * (2 * dLonDeg * 111.32 * Math.cos(26.9124 * Math.PI / 180));
check('bbox area is 4/pi x the disc area (documented bias)',
  Math.abs(bboxAreaKm2 / circleAreaKm2(r) - 4 / Math.PI) < 0.001,
  `bbox ${bboxAreaKm2.toFixed(1)} km2 vs disc ${circleAreaKm2(r).toFixed(1)} km2, ratio ${(bboxAreaKm2 / circleAreaKm2(r)).toFixed(3)}`);

console.log('\n-- circleAreaKm2 --');
check('r=1 -> pi', Math.abs(circleAreaKm2(1) - Math.PI) < 1e-12, `${circleAreaKm2(1)}`);
check('r=2 -> 4pi', Math.abs(circleAreaKm2(2) - 4 * Math.PI) < 1e-12, `${circleAreaKm2(2)}`);
check('r=0 -> 0', circleAreaKm2(0) === 0, '0');
check('quadratic scaling (r=2 is 4x r=1)', Math.abs(circleAreaKm2(2) / circleAreaKm2(1) - 4) < 1e-12, '4x');

console.log('\n-- pointToSegmentKm --');
check('point on segment = 0', Math.abs(pointToSegmentKm(0, 0.5, 0, 0, 0, 1)) < 1e-9, '0');
check('perpendicular distance', Math.abs(pointToSegmentKm(0.1, 0.5, 0, 0, 0, 1) - 11.132) < 0.01, `${pointToSegmentKm(0.1, 0.5, 0, 0, 0, 1).toFixed(3)} km`);
check('beyond endpoint clamps to endpoint', Math.abs(pointToSegmentKm(0, 2, 0, 0, 0, 1) - 111.32) < 0.1, `${pointToSegmentKm(0, 2, 0, 0, 0, 1).toFixed(2)} km`);
check('degenerate segment (a==b) -> point distance', Math.abs(pointToSegmentKm(0.1, 0, 0, 0, 0, 0) - 11.132) < 0.01, 'ok');

console.log('\n-- RF primitives (independent formulas) --');
const drop = (d: number) => (d * 1000) ** 2 / (2 * EARTH_RADIUS_KM * 1000);
check('curvature drop 10 km', Math.abs(earthCurvatureDropM(10) - drop(10)) < 1e-6, `${earthCurvatureDropM(10).toFixed(3)} m`);
check('curvature drop 50 km', Math.abs(earthCurvatureDropM(50) - drop(50)) < 1e-6, `${earthCurvatureDropM(50).toFixed(3)} m`);
const bulge = (d1: number, d2: number) => (d1 * 1000) * (d2 * 1000) / (2 * EARTH_RADIUS_KM * 1000);
check('bulge zero at endpoints', curvatureBulgeM(0, 10) === 0 && curvatureBulgeM(10, 0) === 0, '0');
check('bulge matches d1*d2/2R', Math.abs(curvatureBulgeM(5, 5) - bulge(5, 5)) < 1e-9, `${curvatureBulgeM(5, 5).toFixed(3)} m`);
const f1 = (d1: number, d2: number, f: number) => 17.32 * Math.sqrt((d1 * d2) / (f * (d1 + d2)));
check('fresnel 10 km @2.1 GHz matches 17.32*sqrt(d1d2/(fD))', Math.abs(fresnelRadiusM(5, 5, 2.1) - f1(5, 5, 2.1)) < 0.01, `${fresnelRadiusM(5, 5, 2.1).toFixed(3)} m`);
check('fresnel 0 for zero distance', fresnelRadiusM(0, 0, 2.1) === 0, '0');
check('fresnel 0 for zero freq (no div-by-zero)', fresnelRadiusM(5, 5, 0) === 0, '0');
check('fresnel 0 for negative freq', fresnelRadiusM(5, 5, -1) === 0, '0');
const fsplRef = (d: number, f: number) => 20 * Math.log10(d) + 20 * Math.log10(f) + 32.45;
check('FSPL 10 km @2100 MHz matches ITU form', Math.abs(fsplDb(10, 2100) - fsplRef(10, 2100)) < 1e-9, `${fsplDb(10, 2100).toFixed(2)} dB`);
check('FSPL 0 distance -> 0 (guarded)', fsplDb(0, 2100) === 0, '0');
check('FSPL negative distance -> 0 (guarded)', fsplDb(-5, 2100) === 0, '0');

// ===========================================================================
section('2. CLASSIFICATION — exact threshold boundaries');
// ===========================================================================

const EPS = 1e-9;
console.log('\n-- classifyDensity (documented: <100 Rural, <500 Semi-urban, <1500 Urban, else Dense urban) --');
check('density 0 -> Rural', classifyDensity(0) === 'Rural', classifyDensity(0));
check('density 99.999 -> Rural', classifyDensity(100 - EPS) === 'Rural', classifyDensity(100 - EPS));
check('density 100 (boundary) -> Semi-urban', classifyDensity(100) === 'Semi-urban', classifyDensity(100));
check('density 499.999 -> Semi-urban', classifyDensity(500 - EPS) === 'Semi-urban', classifyDensity(500 - EPS));
check('density 500 (boundary) -> Urban', classifyDensity(500) === 'Urban', classifyDensity(500));
check('density 1499.999 -> Urban', classifyDensity(1500 - EPS) === 'Urban', classifyDensity(1500 - EPS));
check('density 1500 (boundary) -> Dense urban', classifyDensity(1500) === 'Dense urban', classifyDensity(1500));
check('density 1e9 -> Dense urban', classifyDensity(1e9) === 'Dense urban', classifyDensity(1e9));
check('density -100 -> Rural (negative not rejected)', classifyDensity(-100) === 'Rural', classifyDensity(-100));
// FIXED: NaN used to fall through every `<` to 'Dense urban' — the most
// favourable demand class — inflating the score from unknown data.
check('density NaN -> Rural (neutral, not the best class)', classifyDensity(NaN) === 'Rural', classifyDensity(NaN));
// Non-finite (including Infinity) is treated as UNKNOWN. An infinite density
// usually means a divide-by-zero upstream, so claiming 'Dense urban — strong
// revenue potential' from it would be materially misleading. Conservative
// (Rural) is the correct default for an unknown value.
check('density Infinity -> Rural (non-finite treated as unknown)', classifyDensity(Infinity) === 'Rural', classifyDensity(Infinity));

console.log('\n-- classifySaturation (documented: <2 Low, <5 Medium, <10 High, else Saturated) --');
check('0 -> Low', classifySaturation(0) === 'Low', classifySaturation(0));
check('1.999 -> Low', classifySaturation(2 - EPS) === 'Low', classifySaturation(2 - EPS));
check('2 (boundary) -> Medium', classifySaturation(2) === 'Medium', classifySaturation(2));
check('4.999 -> Medium', classifySaturation(5 - EPS) === 'Medium', classifySaturation(5 - EPS));
check('5 (boundary) -> High', classifySaturation(5) === 'High', classifySaturation(5));
check('9.999 -> High', classifySaturation(10 - EPS) === 'High', classifySaturation(10 - EPS));
check('10 (boundary) -> Saturated', classifySaturation(10) === 'Saturated', classifySaturation(10));
// FIXED: NaN used to fall through to 'Saturated' — the worst class.
check('saturation NaN -> Low (neutral, not the worst class)', classifySaturation(NaN) === 'Low', classifySaturation(NaN));

console.log('\n-- classifyAccessibility (documented: <100 m Excellent, <500 m Good, <1 km Fair, else Poor) --');
check('0 km -> Excellent', classifyAccessibility(0) === 'Excellent', classifyAccessibility(0));
check('0.099 km -> Excellent', classifyAccessibility(0.0999) === 'Excellent', classifyAccessibility(0.0999));
check('0.1 km (boundary) -> Good', classifyAccessibility(0.1) === 'Good', classifyAccessibility(0.1));
check('0.499 km -> Good', classifyAccessibility(0.4999) === 'Good', classifyAccessibility(0.4999));
check('0.5 km (boundary) -> Fair', classifyAccessibility(0.5) === 'Fair', classifyAccessibility(0.5));
check('0.999 km -> Fair', classifyAccessibility(0.9999) === 'Fair', classifyAccessibility(0.9999));
check('1.0 km (boundary) -> Poor', classifyAccessibility(1.0) === 'Poor', classifyAccessibility(1.0));
check('50 km -> Poor', classifyAccessibility(50) === 'Poor', classifyAccessibility(50));

// ===========================================================================
section('3. POPULATION INTEGRATION — analytic ground truth');
// ===========================================================================

console.log('\n-- uniform raster: people must equal density x disc area --');
// Build a synthetic raster of exactly 100 people per 0.25 km cell.
//
// NOTE ON GROUND TRUTH: a "degree square" is NOT a square kilometre. At
// latitude 26 a cell of (1/KM) x (1/KM) degrees measures 1.000 km north-south
// but only cos(26) = 0.8988 km east-west, so it holds 0.8988 km² — its true
// density is 111.26 people/km², not 100. The expected value below is derived
// from the cell's actual area; an earlier version of this test assumed 1 km²
// cells and reported a false 11% "engine error".
const KM = 111.32;
const LAT = 26.0, LON = 75.0;
// 0.05 km cells keep the boundary discretisation error under ~0.1%, so the
// tolerances below test the ENGINE, not the grid.
const cellKm = 0.05;
const step = cellKm / KM;
const peoplePerCell = 1;
const cellAreaKm2 = cellKm * (cellKm * Math.cos((LAT * Math.PI) / 180));
const trueDensity = peoplePerCell / cellAreaKm2;
const uniform = {
  sample: () => peoplePerCell,
  cellDegLat: step,
  cellDegLon: step,
  bounds: [60, 10, 90, 40] as [number, number, number, number],
};
const u2 = analyzePopulation(uniform as any, LAT, LON, 0);
const expected2 = trueDensity * circleAreaKm2(2);
const err2 = Math.abs(u2.populationWithin2km - expected2) / expected2;
check('uniform 2 km disc ~= density x pi r^2', err2 < 0.02,
  `got ${u2.populationWithin2km}, expected ~${expected2.toFixed(0)}, err ${(err2 * 100).toFixed(2)}%`);
check('uniform 5 km disc scales by 25/4', Math.abs(u2.populationWithin5km / u2.populationWithin2km - 6.25) < 0.03,
  `ratio ${(u2.populationWithin5km / u2.populationWithin2km).toFixed(3)}`);
check('uniform density ~= true cell density (445/km2)', Math.abs(u2.densityPerKm2 - trueDensity) / trueDensity < 0.02,
  `${u2.densityPerKm2}/km2 vs ${trueDensity.toFixed(1)}`);
check('uniform class = Semi-urban (~445/km2)', u2.densityClassification === 'Semi-urban', u2.densityClassification);
check('serviceable = 70% of 2 km', Math.abs(u2.serviceablePopulation - u2.populationWithin2km * 0.7) <= 1,
  `${u2.serviceablePopulation} vs ${Math.round(u2.populationWithin2km * 0.7)}`);
check('source tagged worldpop', u2.source === 'worldpop', String(u2.source));

console.log('\n-- empty raster (all null) --');
const empty = { ...uniform, sample: () => null };
const e2 = analyzePopulation(empty as any, 26, 75, 0);
check('all-null raster -> 0 people', e2.populationWithin2km === 0 && e2.populationWithin5km === 0, '0');
check('all-null raster -> density 0 -> Rural', e2.densityPerKm2 === 0 && e2.densityClassification === 'Rural', e2.densityClassification);
check('all-null does NOT silently fall back to proxy', e2.source === 'worldpop', String(e2.source));

console.log('\n-- zero-cell raster (degenerate metadata) --');
const zero = { ...uniform, cellDegLat: 0, cellDegLon: 0 };
const z2 = analyzePopulation(zero as any, 26, 75, 0);
check('zero cell size -> 0 people (no infinite loop)', z2.populationWithin2km === 0, '0');

console.log('\n-- no raster -> tower proxy (must be flagged) --');
const proxy = analyzePopulation(null, 26, 75, 5);
check('no raster -> source tower-proxy', proxy.source === 'tower-proxy', String(proxy.source));
check('no raster -> 2 km > 0 when towers exist', proxy.populationWithin2km > 0, String(proxy.populationWithin2km));
check('no raster -> 5 km = 6.25x of 2 km (area scaling)',
  Math.abs(proxy.populationWithin5km / proxy.populationWithin2km - 6.25) < 0.01, '6.25x');
check('proxy with 0 towers -> 0 population', analyzePopulation(null, 26, 75, 0).populationWithin2km === 0, '0');
check('proxy negative tower density clamped to >= 0', analyzePopulation(null, 26, 75, -5).populationWithin2km === 0, '0');

console.log('\n-- absurd raster metadata guard --');
const absurd = { sample: () => 1, cellDegLat: 1e-9, cellDegLon: 1e-9, bounds: [60, 10, 90, 40] as any };
const a2 = analyzePopulation(absurd as any, 26, 75, 0);
check('sub-nanodegree cell size hits loop guard, returns 0 (no hang)', a2.populationWithin2km === 0, '0');

// ===========================================================================
section('4. TOWER COUNT — bbox used as disc (defect A)');
// ===========================================================================

const tdb = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);
function bboxCount(lat: number, lon: number, r: number) {
  const b = bboxForRadius(lat, lon, r);
  return (tdb.prepare(`SELECT COUNT(*) AS n FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`)
    .get(b.minLat, b.maxLat, b.minLon, b.maxLon) as any).n as number;
}
function discCount(lat: number, lon: number, r: number) {
  const b = bboxForRadius(lat, lon, r);
  const rows = tdb.prepare(`SELECT lat, lon FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`)
    .all(b.minLat, b.maxLat, b.minLon, b.maxLon) as any[];
  return rows.filter((t: any) => haversineKm(lat, lon, t.lat, t.lon) <= r).length;
}
const TOWNS: [string, number, number][] = [
  ['Ajmer', 26.4499, 74.6399], ['Jaipur', 26.9124, 75.7873],
  ['Jodhpur', 26.2389, 73.0243], ['Bikaner', 28.0229, 73.3119],
];
let worstRatio = 0;
for (const [n, la, lo] of TOWNS) {
  const b = bboxCount(la, lo, 1), d = discCount(la, lo, 1);
  if (d > 0) worstRatio = Math.max(worstRatio, b / d);
}
check('tower 1 km count is a bbox count, not a disc count (DEFECT A: over-counts)',
  worstRatio > 1.05,
  `worst over-count ${worstRatio.toFixed(3)}x (theoretical 4/pi=${(4 / Math.PI).toFixed(3)}x)`);
// Demonstrate the classification consequence explicitly.
const jo = bboxCount(26.2389, 73.0243, 1) / circleAreaKm2(1);
const joTrue = discCount(26.2389, 73.0243, 1) / circleAreaKm2(1);
check('DEFECT A changes a user-visible classification (Jodhpur)',
  classifySaturation(jo) !== classifySaturation(joTrue),
  `engine=${classifySaturation(jo)} (${jo.toFixed(2)}/km2) vs correct=${classifySaturation(joTrue)} (${joTrue.toFixed(2)}/km2)`);
tdb.close();

// ===========================================================================
section('5. SCORING — completeness and recommendation logic');
// ===========================================================================

function bundle(over: Partial<any> = {}) {
  return {
    population: { populationWithin2km: 1000, populationWithin5km: 6000, populationWithin10km: 25000,
      densityPerKm2: 500, densityClassification: 'Urban', serviceablePopulation: 700, ...over.population },
    towers: { towersWithin1km: 1, towersWithin2km: 4, towersWithin5km: 20, densityPerKm2: 1,
      saturationClassification: 'Low', nearbyTowers: [], colocationOpportunity: false, ...over.towers },
    resources: { nearestFiber: { distanceKm: 0.05, name: 'x', detail: 'y' }, nearestRoad: null,
      resourceScore: 5, fiberAccessibility: 'Excellent', ...over.resources },
    row: analyzeRow('Rajasthan'),
    los: { losStatus: 'Clear', terrainProfile: [], fresnelClearance: true,
      recommendedTowerHeight: 30, pathLossDb: 100, estimatedRsrpDbm: -54, distanceKm: 5, ...over.los },
    soil: { faoCode: 'X', soilType: 'Alluvial', foundationSuitability: 'Best', foundationNote: '', ...over.soil },
    admin: { state: 'Rajasthan', district: null, governingAuthority: 'x', complianceRequirements: [] },
  } as any;
}

// True best case needs Dense urban (3.0); the bundle default is Urban (2.5),
// which caps the total at 9.5. The expectation of 10 is only reachable with
// every dimension at its maximum.
const best = scoreFeasibility(bundle({ population: { densityClassification: 'Dense urban', densityPerKm2: 2000 } }));
check('best case score = 10', best.score === 10, `${best.score}`);
check('best case recommendation = Go', best.recommendation === 'Go', best.recommendation);
check('score never exceeds 10', best.score <= 10, `${best.score}`);

const worst = scoreFeasibility(bundle({
  population: { densityClassification: 'Rural', densityPerKm2: 10 },
  towers: { saturationClassification: 'Saturated', densityPerKm2: 40 },
  resources: { resourceScore: 1, fiberAccessibility: 'Poor', nearestFiber: { distanceKm: 50, name: null, detail: '' } },
  soil: { foundationSuitability: 'Poor', soilType: 'Saline' },
  los: { losStatus: 'Obstructed', recommendedTowerHeight: 60, distanceKm: 5, fresnelClearance: false },
}));
// The attainable minimum is NOT 1: the resources dimension floors at
// resourceScore 1 -> 0.4 of 2, so even the worst bundle scores ~1.7. The
// documented floor of 1 is a guard, not a reachable value.
check('worst case score is at the attainable minimum (~1.7)', worst.score <= 2, `${worst.score}`);
check('worst case score never drops below the 1.0 guard', worst.score >= 1, `${worst.score}`);
check('worst case recommendation = No-Go', worst.recommendation === 'No-Go', worst.recommendation);

// Completeness: every branch should contribute. Verify each dimension moves the score.
const base = scoreFeasibility(bundle()).score;
check('population dimension affects score',
  scoreFeasibility(bundle({ population: { densityClassification: 'Rural', densityPerKm2: 10 } })).score < base, 'yes');
check('saturation dimension affects score',
  scoreFeasibility(bundle({ towers: { saturationClassification: 'Saturated', densityPerKm2: 40 } })).score < base, 'yes');
check('resource dimension affects score',
  scoreFeasibility(bundle({ resources: { resourceScore: 1, fiberAccessibility: 'Poor', nearestFiber: { distanceKm: 50, name: null, detail: '' } } })).score < base, 'yes');
check('soil dimension affects score',
  scoreFeasibility(bundle({ soil: { foundationSuitability: 'Poor', soilType: 'Saline' } })).score < base, 'yes');
check('LoS dimension affects score',
  scoreFeasibility(bundle({ los: { losStatus: 'Obstructed', recommendedTowerHeight: 60, distanceKm: 5, fresnelClearance: false } })).score < base, 'yes');
check('admin dimension does NOT affect score (documented gap)',
  scoreFeasibility(bundle({ admin: { state: 'X', district: null, governingAuthority: 'y', complianceRequirements: [] } })).score === base,
  'admin is informational only');
check('row dimension does NOT affect score (documented gap)',
  scoreFeasibility(bundle({ row: analyzeRow('Goa') })).score === base, 'RoW is informational only');

console.log('\n-- score arithmetic: dimension caps --');
// pop max 3 + sat max 3 + res max 2 + soil max 1 + los max 1 = 10
const popOnly = scoreFeasibility(bundle({
  towers: { saturationClassification: 'Low', densityPerKm2: 1 },
  resources: { resourceScore: 5, fiberAccessibility: 'Excellent', nearestFiber: { distanceKm: 0.05, name: 'x', detail: '' } },
  soil: { foundationSuitability: 'Best', soilType: 'x' },
  los: { losStatus: 'Clear', recommendedTowerHeight: 30, distanceKm: 5, fresnelClearance: true },
}));
check('dense-urban pop contributes 3.0 of 10', popOnly.score >= 9.5, `${popOnly.score}`);

console.log('\n-- recommendation logic --');
check('Go requires score>=7 AND zero issues', (() => {
  // score 10 but with an issue -> must not be Go
  const r = scoreFeasibility(bundle({ soil: { foundationSuitability: 'Poor', soilType: 'Saline' } }));
  return r.score >= 7 ? r.recommendation !== 'Go' : true;
})(), 'high score + issue -> Conditional/No-Go');
check('score 4-6.9 -> Conditional', (() => {
  const r = scoreFeasibility(bundle({
    population: { densityClassification: 'Semi-urban', densityPerKm2: 300 },
    towers: { saturationClassification: 'Medium', densityPerKm2: 3 },
    resources: { resourceScore: 3, fiberAccessibility: 'Fair', nearestFiber: { distanceKm: 0.8, name: 'x', detail: '' } },
    soil: { foundationSuitability: 'Fair', soilType: 'x' },
    los: { losStatus: 'Marginal', recommendedTowerHeight: 35, distanceKm: 5, fresnelClearance: false },
  }));
  return r.recommendation === 'Conditional';
})(), 'Conditional');

console.log('\n-- NaN / Infinity injection into scoring --');
const nanScore = scoreFeasibility(bundle({ population: { densityClassification: NaN, densityPerKm2: NaN } }));
check('NaN classification does not produce NaN score', Number.isFinite(nanScore.score), `${nanScore.score}`);
check('NaN classification still yields a valid recommendation',
  ['Go', 'Conditional', 'No-Go'].includes(nanScore.recommendation), nanScore.recommendation);

// ===========================================================================
section('6. REPORT — integrity, consistency, injection');
// ===========================================================================

const site = { id: 's1', name: 'QA Site', lat: 26.4499, lon: 74.6399, createdAt: '2026-01-01' };
const rep = buildReport(site as any, 'rajasthan', bundle());
const html = buildReportHtml(rep);

console.log('\n-- section completeness --');
for (const h of ['1. Executive Summary', '2. Population Density', '3. Competitor Towers',
  '4. Nearby Resources', '5. RoW Compliance', '6. Soil &amp; Foundation',
  '7. Administration', '8. Line-of-Sight']) {
  check(`section present: ${h}`, html.includes(h), 'found');
}
check('disclaimer present', html.includes('screening input only') && html.includes('geotechnical survey'), 'yes');
check('no placeholder text (TODO/FIXME/lorem/undefined/NaN)', !/TODO|FIXME|lorem ipsum|undefined|NaN|\[object/i.test(html), 'clean');
check('no debug output', !/console\.|DEBUG|__dev/i.test(html), 'clean');
check('valid HTML skeleton', html.startsWith('<!DOCTYPE html>') && html.trimEnd().endsWith('</html>'), 'ok');
// The report bundle's LoS profile is empty, so terrainSvg() emits nothing and
// the report carries no <svg>. Test the SVG builder directly instead.
const svgProbe = terrainSvg([{ distanceKm: 0, elevationM: 300, losLineM: 330 },
  { distanceKm: 5, elevationM: 310, losLineM: 320 },
  { distanceKm: 10, elevationM: 300, losLineM: 305 }]);
check('svg xmlns uses the XML namespace (not a network call)',
  svgProbe.includes('xmlns="http://www.w3.org/2000/svg"') && !/https?:\/\/(?!www\.w3\.org)/.test(svgProbe),
  'namespace URI');
check('terrainSvg empty profile -> empty string (no broken svg)', terrainSvg([]) === '', 'empty');

console.log('\n-- report values match the engine (no display divergence) --');
check('score in HTML matches report model', html.includes(`${rep.executiveSummary.overallScore}/10`), `${rep.executiveSummary.overallScore}/10`);
check('population 2km in HTML matches model',
  html.includes(rep.populationAnalysis.populationWithin2km.toLocaleString()), 'yes');
check('tower density in HTML matches model', html.includes(`${rep.towerAnalysis.densityPerKm2} /km²`), 'yes');
check('soil type in HTML matches model', html.includes(rep.soilAnalysis.soilType), 'yes');
check('RoW fee in HTML matches model', html.includes(rep.rowAnalysis.applicationFee.toLocaleString()), 'yes');
check('coordinates rendered to 5 dp', html.includes('26.44990') && html.includes('74.63990'), 'yes');

console.log('\n-- XSS / injection --');
const xssSite = { id: 'x', name: '<script>alert(1)</script>', lat: 26.4499, lon: 74.6399, createdAt: '' };
const xssHtml = buildReportHtml(buildReport(xssSite as any, 'rajasthan', bundle()));
check('script tag in site name is escaped', !xssHtml.includes('<script>alert(1)</script>'), 'escaped');
check('escaped form present', xssHtml.includes('&lt;script&gt;'), 'yes');
const imgSite = { id: 'x', name: '"><img src=x onerror=alert(1)>', lat: 26.4499, lon: 74.6399, createdAt: '' };
const imgHtml = buildReportHtml(buildReport(imgSite as any, 'rajasthan', bundle()));
check('attribute-breakout payload escaped', !imgHtml.includes('<img src=x onerror'), 'escaped');
check('double quote in payload escaped to &quot; or left inert',
  !/onerror=alert\(1\)>/.test(imgHtml) || imgHtml.includes('&lt;'), 'inert');

console.log('\n-- terrain SVG --');
const svg = buildReportHtml(buildReport(site as any, 'rajasthan', bundle({
  los: { losStatus: 'Clear', distanceKm: 5, recommendedTowerHeight: 30, pathLossDb: 100,
    estimatedRsrpDbm: -54, fresnelClearance: true,
    terrainProfile: [
      { distanceKm: 0, elevationM: 400, losLineM: 430, fresnelRadiusM: 10, obstructed: false },
      { distanceKm: 2.5, elevationM: 450, losLineM: 440, fresnelRadiusM: 12, obstructed: true },
      { distanceKm: 5, elevationM: 420, losLineM: 421, fresnelRadiusM: 10, obstructed: false },
    ] } })));
check('terrain SVG rendered when profile present', svg.includes('<svg'), 'yes');
check('SVG has no NaN coordinates', !/NaN/.test(svg.split('<svg')[1]?.split('</svg>')[0] ?? ''), 'clean');

// ===========================================================================
section('7. WKB DECODER — adversarial');
// ===========================================================================

console.log('\n-- endianness (DEFECT B candidate) --');
// Big-endian LineString: byteOrder=0, type=2, 2 points.
function makeWkb(le: boolean, type: number, coords: number[][]): Uint8Array {
  const n = coords.length;
  const size = 1 + 4 + 4 + n * 16;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o, le ? 1 : 0); o += 1;
  dv.setUint32(o, type, le); o += 4;
  dv.setUint32(o, n, le); o += 4;
  for (const [x, y] of coords) { dv.setFloat64(o, x, le); o += 8; dv.setFloat64(o, y, le); o += 8; }
  return new Uint8Array(buf);
}
const leLine = decodeWkbLine(makeWkb(true, 2, [[75.0, 26.0], [75.1, 26.1]]));
check('little-endian LineString decodes', !!leLine && leLine.length === 2, `${leLine?.length} pts`);
check('little-endian coords correct', !!leLine && Math.abs(leLine[0][0] - 75.0) < 1e-9 && Math.abs(leLine[1][1] - 26.1) < 1e-9,
  JSON.stringify(leLine?.[0]));

const beLine = decodeWkbLine(makeWkb(false, 2, [[75.0, 26.0], [75.1, 26.1]]));
console.log(`    big-endian LineString decode -> ${JSON.stringify(beLine)}`);
check('big-endian LineString decodes correctly (DEFECT B if not)',
  !!beLine && beLine.length === 2 && Math.abs(beLine[0][0] - 75.0) < 1e-9,
  beLine ? JSON.stringify(beLine[0]) : 'null');

console.log('\n-- malformed inputs --');
check('null -> null', decodeWkbLine(null) === null, 'null');
check('undefined -> null', decodeWkbLine(undefined) === null, 'null');
check('empty -> null', decodeWkbLine(new Uint8Array(0)) === null, 'null');
check('too short -> null', decodeWkbLine(new Uint8Array(4)) === null, 'null');
check('truncated header -> null (no throw)', decodeWkbLine(new Uint8Array([1, 2, 0, 0, 0])) === null, 'null');
check('unsupported type (Point=1) -> null', decodeWkbLine(makeWkb(true, 1, [[1, 2]])) === null, 'null');
check('polygon type (3) -> null', decodeWkbLine(makeWkb(true, 3, [[1, 2]])) === null, 'null');
// Truncated body: header claims 5 points but only 1 present.
const trunc = new Uint8Array(1 + 4 + 4 + 16);
trunc.set([1], 0); new DataView(trunc.buffer).setUint32(1, 2, true); new DataView(trunc.buffer).setUint32(5, 5, true);
check('body shorter than declared point count -> null (no throw)', decodeWkbLine(trunc) === null, 'null');
// Fuzz: random bytes must never throw.
let threw = false;
for (let i = 0; i < 500; i++) {
  const b = new Uint8Array(1 + Math.floor(Math.random() * 64));
  for (let k = 0; k < b.length; k++) b[k] = Math.floor(Math.random() * 256);
  try { decodeWkbLine(b); } catch { threw = true; }
}
check('500 random-byte fuzz inputs never throw', !threw, 'no exceptions');

// ===========================================================================
section('8. SOIL / ADMIN POLYGON LOGIC — adversarial');
// ===========================================================================

const square = (minLon: number, minLat: number, maxLon: number, maxLat: number): SoilPolygon => ({
  faoCode: 'X', soilType: 'Test', foundationSuitability: 'Good', foundationNote: '',
  minLon, minLat, maxLon, maxLat,
  polygons: [[[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]]],
});
const sq = [square(70, 20, 80, 30)];
check('point inside square found', lookupSoil(sq, 25, 75)?.soilType === 'Test', 'hit');
check('point outside bbox -> null', lookupSoil(sq, 40, 75) === null, 'null');
check('point outside polygon but inside bbox -> null', lookupSoil([square(70, 20, 72, 22)], 25, 75) === null, 'null');
check('empty polygon list -> null', lookupSoil([], 25, 75) === null, 'null');
check('polygon with empty ring does not throw', (() => {
  try { lookupSoil([{ ...square(70, 20, 80, 30), polygons: [[[]]] }], 25, 75); return true; } catch { return false; }
})(), 'no throw');
// MultiPolygon: two disjoint squares; a point in the second must be found.
const multi: SoilPolygon = {
  faoCode: 'M', soilType: 'Multi', foundationSuitability: 'Fair', foundationNote: '',
  minLon: 70, minLat: 20, maxLon: 82, maxLat: 32,
  polygons: [
    [[[70, 20], [72, 20], [72, 22], [70, 22], [70, 20]]],
    [[[80, 30], [82, 30], [82, 32], [80, 32], [80, 30]]],
  ],
};
check('MultiPolygon: point in FIRST sub-polygon found', lookupSoil([multi], 21, 71)?.soilType === 'Multi', 'hit');
check('MultiPolygon: point in SECOND sub-polygon found', lookupSoil([multi], 31, 81)?.soilType === 'Multi', 'hit');
check('MultiPolygon: point between sub-polygons -> null', lookupSoil([multi], 25, 76) === null, 'null');
// Polygon with a hole
const holed: SoilPolygon = {
  faoCode: 'H', soilType: 'Holed', foundationSuitability: 'Poor', foundationNote: '',
  minLon: 70, minLat: 20, maxLon: 80, maxLat: 30,
  polygons: [[
    [[70, 20], [80, 20], [80, 30], [70, 30], [70, 20]],
    [[73, 23], [77, 23], [77, 27], [73, 27], [73, 23]],
  ]],
};
check('polygon hole: point inside hole -> null', lookupSoil([holed], 25, 75) === null, 'null');
check('polygon hole: point in ring outside hole -> hit', lookupSoil([holed], 21, 71)?.soilType === 'Holed', 'hit');

console.log('\n-- admin boundary --');
const admin: AdminBoundary[] = [{ state: 'Test', district: 'D1', minLon: 70, minLat: 20, maxLon: 80, maxLat: 30,
  rings: [[[70, 20], [80, 20], [80, 30], [70, 30], [70, 20]]] }];
check('admin hit inside ring', lookupAdmin(admin, 25, 75)?.state === 'Test', 'hit');
check('admin miss outside', lookupAdmin(admin, 40, 75) === null, 'null');
check('admin empty list -> null', lookupAdmin([], 25, 75) === null, 'null');

// ===========================================================================
section('9. LoS ENGINE — adversarial');
// ===========================================================================

// A flat EARTH is not a flat PATH. Over 11 km the curvature bulge is
// d1*d2/(2R) = 5.56*5.56/(2*6371) km = 2.4 m, so the sight line between a 30 m
// antenna and a 1.5 m target drops ~2.4 m below the terrain midspan and the
// path is legitimately NOT clear. Clearance is frequency-dependent: the
// 60% Fresnel radius at 2.1 GHz midspan is 0.6*6.3 = 3.8 m, so a longer flat
// path is obstructed while a short one is clear.
const flat = { sample: () => 300 };
const shortFlat = analyzeLos(flat as any, { lat: 26.0, lon: 75.0 }, { lat: 26.001, lon: 75.0 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('flat terrain, short (0.11 km) path -> Clear', shortFlat?.losStatus === 'Clear', String(shortFlat?.losStatus));
check('flat terrain, short path -> fresnelClearance true', shortFlat?.fresnelClearance === true, 'true');
check('flat terrain, short path -> recommended height unchanged (30 m)', shortFlat?.recommendedTowerHeight === 30, `${shortFlat?.recommendedTowerHeight}`);

const longFlat = analyzeLos(flat as any, { lat: 26.0, lon: 75.0 }, { lat: 26.1, lon: 75.0 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('flat terrain, long (11 km) path -> NOT clear (earth curvature)', longFlat?.losStatus !== 'Clear', String(longFlat?.losStatus));
check('flat terrain, long path -> fresnelClearance false', longFlat?.fresnelClearance === false, String(longFlat?.fresnelClearance));
check('long path -> recommended height raised above 30 m', (longFlat?.recommendedTowerHeight ?? 0) > 30, `${longFlat?.recommendedTowerHeight}`);
check('long path -> recommended height is a multiple of 5', (longFlat?.recommendedTowerHeight ?? 0) % 5 === 0, `${longFlat?.recommendedTowerHeight}`);
// The recommendation must actually work: re-running at the recommended height
// must clear the path. (This is what caught the old +deficit formula, which
// recommended 40 m for a path that does not clear until ~105 m.)
const reRun = analyzeLos(flat as any, { lat: 26.0, lon: 75.0 }, { lat: 26.1, lon: 75.0 }, { towerHeightM: longFlat!.recommendedTowerHeight, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('recommended height actually clears the path it was derived from', reRun?.losStatus === 'Clear', String(reRun?.losStatus));

const los1 = longFlat;
check('profile has samples+1 points', los1?.terrainProfile.length === 65, `${los1?.terrainProfile.length}`);
check('null sampler -> null result', analyzeLos(null, { lat: 26, lon: 75 }, { lat: 26.1, lon: 75 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 }) === null, 'null');
check('zero-length path -> null (guarded)', analyzeLos(flat as any, { lat: 26, lon: 75 }, { lat: 26, lon: 75 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 }) === null, 'null');
check('sampler returning null -> null (guarded)',
  analyzeLos({ sample: () => null } as any, { lat: 26, lon: 75 }, { lat: 26.1, lon: 75 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 }) === null, 'null');

console.log('\n-- RSRP sanity (independent) --');
const d = haversineKm(26.0, 75.0, 26.1, 75.0);
const fsplRef2 = 20 * Math.log10(d) + 20 * Math.log10(2100) + 32.45;
const rsrpExpected = 46 + 18 - fsplRef2;
check('RSRP = tx + gain - FSPL', Math.abs((los1?.estimatedRsrpDbm ?? 0) - rsrpExpected) < 0.2,
  `engine ${los1?.estimatedRsrpDbm} vs independent ${rsrpExpected.toFixed(1)} dBm`);
check('RSRP is negative (physically expected for a real link)', (los1?.estimatedRsrpDbm ?? 0) < 0, `${los1?.estimatedRsrpDbm} dBm`);
check('pathLoss matches independent FSPL', Math.abs((los1?.pathLossDb ?? 0) - fsplRef2) < 0.2,
  `engine ${los1?.pathLossDb} vs ${fsplRef2.toFixed(1)} dB`);

console.log('\n-- obstruction detection --');
// A single spike in the middle should obstruct.
const spike = { sample: (lat: number) => (Math.abs(lat - 26.05) < 0.005 ? 5000 : 300) };
const los2 = analyzeLos(spike as any, { lat: 26.0, lon: 75.0 }, { lat: 26.1, lon: 75.0 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('terrain spike -> Obstructed', los2?.losStatus === 'Obstructed', String(los2?.losStatus));
check('terrain spike -> fresnelClearance false', los2?.fresnelClearance === false, 'false');
check('spike -> recommended height raised above 30 m', (los2?.recommendedTowerHeight ?? 0) > 30, `${los2?.recommendedTowerHeight} m`);
check('spike -> recommended height is a multiple of 5', (los2?.recommendedTowerHeight ?? 1) % 5 === 0, `${los2?.recommendedTowerHeight}`);

// ===========================================================================
section('10. RoW RULES — consistency');
// ===========================================================================

const rowR = analyzeRow('Rajasthan');
check('application fee = 10000', rowR.applicationFee === 10000, `${rowR.applicationFee}`);
check('estimated total = fee + street furniture', rowR.estimatedTotalCost === 10000 + 100, `${rowR.estimatedTotalCost}`);
check('approval timeline = rejection days (45)', rowR.approvalTimelineDays === 45, `${rowR.approvalTimelineDays}`);
check('deemed approval = 67 days', rowR.deemedApprovalDays === 67, `${rowR.deemedApprovalDays}`);
check('deemed approval > rejection timeline (67 > 45)', rowR.deemedApprovalDays > rowR.approvalTimelineDays, 'ok');
check('7 required documents listed', rowR.requiredDocuments.length === 7, `${rowR.requiredDocuments.length}`);
check('state propagated', rowR.state === 'Rajasthan', rowR.state);

// ===========================================================================
console.log(`\n${'='.repeat(78)}`);
console.log(`QA CORE SUITE: ${pass} passed, ${fail} failed`);
if (fail) console.log(`FAILED: ${failures.join(' | ')}`);
console.log('='.repeat(78));
process.exit(fail ? 1 : 0);
