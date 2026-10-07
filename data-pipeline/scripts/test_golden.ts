/**
 * Golden engineering tests — deterministic known-input/known-output cases.
 * 
 * Every expected value has provenance:
 * - "derived" = computed from first principles in this test
 * - "app-constant" = hardcoded in the app source, verified here
 * - "domain-authority" = requires telecom expert validation
 * 
 * These tests run the ACTUAL app engines against synthetic and real data.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  haversineKm, bboxForRadius, circleAreaKm2, pointToSegmentKm,
  curvatureBulgeM, fresnelRadiusM, fsplDb, earthCurvatureDropM,
} from '../../app/src/utils/geo';
import { analyzePopulation, classifyDensity } from '../../app/src/analysis/populationEngine';
import { classifySaturation } from '../../app/src/analysis/towerEngine';
import { classifyAccessibility } from '../../app/src/analysis/resourceEngine';
import { analyzeRow, DEFAULT_ROW_RULES } from '../../app/src/analysis/rowEngine';
import { lookupSoil, type SoilPolygon } from '../../app/src/analysis/soilEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { scoreFeasibility } from '../../app/src/report/ReportBuilder';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const AJMER = { lat: 26.9124, lon: 75.7873 };

let pass = 0, fail = 0, blocked = 0;
const results: Array<{ id: string; name: string; status: string; detail: string }> = [];

const check = (id: string, name: string, cond: boolean, detail = '') => {
  const status = cond ? 'PASS' : 'FAIL';
  results.push({ id, name, status, detail });
  cond ? pass++ : fail++;
  console.log(`${status}  ${id}  ${name}${detail ? '  -> ' + detail : ''}`);
};

const checkBlocked = (id: string, name: string, reason: string) => {
  blocked++;
  results.push({ id, name, status: 'BLOCKED', detail: reason });
  console.log(`BLOCKED  ${id}  ${name}  -> ${reason}`);
};

// ============================================================
// A. GEO / DISTANCE
// ============================================================
console.log('\n=== A. GEO / DISTANCE ===');

// A1: Haversine — known city pairs
const dAjmerJodhpur = haversineKm(26.9124, 75.7873, 26.2389, 73.0243);
check('A1', 'Haversine Ajmer->Jodhpur ~285km', dAjmerJodhpur > 270 && dAjmerJodhpur < 300, `${dAjmerJodhpur.toFixed(1)} km`);

const dAjmerJaipur = haversineKm(26.9124, 75.7873, 26.9124, 75.7873);
check('A2', 'Haversine same point = 0', dAjmerJaipur === 0, `${dAjmerJaipur} km`);

const dNorthSouth = haversineKm(0, 0, 1, 0);
check('A3', 'Haversine 1deg lat ~111km', Math.abs(dNorthSouth - 111.32) < 0.5, `${dNorthSouth.toFixed(2)} km`);

// A4: Bbox symmetry
const bb = bboxForRadius(26.9124, 75.7873, 5);
check('A4', 'Bbox lat span = 2 * dLat', Math.abs((bb.maxLat - bb.minLat) - 2 * (5 / 111.32)) < 0.001);
check('A5', 'Bbox lon span > lat span at 26N (cos < 1)', (bb.maxLon - bb.minLon) > (bb.maxLat - bb.minLat));

// A6: Circle area
check('A6', 'Circle area 1km = π', Math.abs(circleAreaKm2(1) - Math.PI) < 0.001);
check('A7', 'Circle area 5km = 25π', Math.abs(circleAreaKm2(5) - 25 * Math.PI) < 0.01);

// A8: Point-to-segment
const seg = pointToSegmentKm(0, 1, -1, 0, 1, 0);
check('A8', 'Point-to-segment 1deg from equator ~111km', Math.abs(seg - 111.32) < 1, `${seg.toFixed(2)} km`);

// A9: Earth curvature
check('A9', 'Curvature drop @10km ~7.85m', Math.abs(earthCurvatureDropM(10) - 7.85) < 0.1, `${earthCurvatureDropM(10).toFixed(2)} m`);

// A10: Curvature bulge
check('A10', 'Bulge at start = 0', curvatureBulgeM(0, 10) === 0);
check('A11', 'Bulge at end = 0', curvatureBulgeM(10, 0) === 0);
check('A12', 'Bulge midspan 10km ~1.96m', Math.abs(curvatureBulgeM(5, 5) - 1.96) < 0.1, `${curvatureBulgeM(5, 5).toFixed(2)} m`);

// A13: Fresnel
check('A13', 'Fresnel F1 @2.1GHz midspan 10km ~18.9m', Math.abs(fresnelRadiusM(5, 5, 2.1) - 18.9) < 1, `${fresnelRadiusM(5, 5, 2.1).toFixed(1)} m`);

// A14: FSPL
check('A14', 'FSPL 1km @2100MHz ~98.9dB', Math.abs(fsplDb(1, 2100) - 98.9) < 0.5, `${fsplDb(1, 2100).toFixed(1)} dB`);
check('A15', 'FSPL 10km @2100MHz ~118.9dB', Math.abs(fsplDb(10, 2100) - 118.9) < 0.5, `${fsplDb(10, 2100).toFixed(1)} dB`);

// A16: Invalid coordinates
check('A16', 'Haversine with NaN returns NaN', Number.isNaN(haversineKm(NaN, 0, 0, 0)));
check('A17', 'Haversine with Infinity returns NaN', Number.isNaN(haversineKm(Infinity, 0, 0, 0)));

// ============================================================
// B. TOWER DENSITY
// ============================================================
console.log('\n=== B. TOWER DENSITY ===');

// B1: Saturation classification boundaries (from app source)
check('B1', 'classifySaturation(0) = Low', classifySaturation(0) === 'Low');
check('B2', 'classifySaturation(1.99) = Low', classifySaturation(1.99) === 'Low');
check('B3', 'classifySaturation(2) = Medium', classifySaturation(2) === 'Medium');
check('B4', 'classifySaturation(4.99) = Medium', classifySaturation(4.99) === 'Medium');
check('B5', 'classifySaturation(5) = High', classifySaturation(5) === 'High');
check('B6', 'classifySaturation(9.99) = High', classifySaturation(9.99) === 'High');
check('B7', 'classifySaturation(10) = Saturated', classifySaturation(10) === 'Saturated');
check('B8', 'classifySaturation(100) = Saturated', classifySaturation(100) === 'Saturated');

// B9: NaN handling
check('B9', 'classifySaturation(NaN) = Low (safe fallback)', classifySaturation(NaN) === 'Low');

// B10: Real pack data
const tdb = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);
const total = (tdb.prepare('SELECT COUNT(*) n FROM towers').get() as any).n;
check('B10', 'Rajasthan pack has 125,036 towers', total === 125036, `${total}`);

// B11: Tower counts at Ajmer (bbox pre-filter, not exact disc)
const within = (r: number) => {
  const b = bboxForRadius(AJMER.lat, AJMER.lon, r);
  return (tdb.prepare(
    'SELECT COUNT(*) n FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?',
  ).get(b.minLat, b.maxLat, b.minLon, b.maxLon) as any).n;
};
const w1 = within(1), w2 = within(2), w5 = within(5);
check('B11', 'Towers within 1km (bbox) = 76', w1 === 76, `${w1}`);
check('B12', 'Towers within 2km (bbox) = 264', w2 === 264, `${w2}`);
check('B13', 'Towers within 5km (bbox) = 1283', w5 === 1283, `${w5}`);

// B14: Density calculation
const density1km = w1 / circleAreaKm2(1);
check('B14', 'Density at Ajmer 1km (bbox) ~24.2/km²', Math.abs(density1km - 24.2) < 1, `${density1km.toFixed(1)}/km²`);

// ============================================================
// C. RSRP / RF
// ============================================================
console.log('\n=== C. RSRP / RF ===');

// C1: FSPL at various distances
check('C1', 'FSPL 0.5km @2100MHz ~92.9dB', Math.abs(fsplDb(0.5, 2100) - 92.9) < 0.5, `${fsplDb(0.5, 2100).toFixed(1)} dB`);
check('C2', 'FSPL 2km @2100MHz ~104.9dB', Math.abs(fsplDb(2, 2100) - 104.9) < 0.5, `${fsplDb(2, 2100).toFixed(1)} dB`);
check('C3', 'FSPL 5km @2100MHz ~112.9dB', Math.abs(fsplDb(5, 2100) - 112.9) < 0.5, `${fsplDb(5, 2100).toFixed(1)} dB`);

// C4: RSRP calculation (txPower + gain - FSPL)
const txPower = 46, gain = 18;
const rsrp1km = txPower + gain - fsplDb(1, 2100);
const rsrp5km = txPower + gain - fsplDb(5, 2100);
check('C4', 'RSRP 1km @2100MHz ~-34.9dBm', Math.abs(rsrp1km - (-34.9)) < 1, `${rsrp1km.toFixed(1)} dBm`);
check('C5', 'RSRP 5km @2100MHz ~-48.9dBm', Math.abs(rsrp5km - (-48.9)) < 1, `${rsrp5km.toFixed(1)} dBm`);

// C6: RSRP thresholds — DOMAIN VALIDATION REQUIRED
checkBlocked('C6', 'RSRP strong/weak thresholds', 'No authoritative RSRP threshold defined in app source');

// C7: FSPL edge cases
check('C7', 'FSPL(0, 2100) = 0 (no path loss)', fsplDb(0, 2100) === 0);
check('C8', 'FSPL(1, 0) = 0 (no path loss)', fsplDb(1, 0) === 0);
check('C9', 'FSPL(-1, 2100) = 0 (invalid distance)', fsplDb(-1, 2100) === 0);

// ============================================================
// D. NETWORK OPPORTUNITY
// ============================================================
console.log('\n=== D. NETWORK OPPORTUNITY ===');

// D1: Accessibility classification (from app source)
check('D1', 'classifyAccessibility(0.05) = Excellent', classifyAccessibility(0.05) === 'Excellent');
check('D2', 'classifyAccessibility(0.1) = Good', classifyAccessibility(0.1) === 'Good');
check('D3', 'classifyAccessibility(0.5) = Fair', classifyAccessibility(0.5) === 'Fair');
check('D4', 'classifyAccessibility(1.0) = Poor', classifyAccessibility(1.0) === 'Poor');
check('D5', 'classifyAccessibility(50) = Poor', classifyAccessibility(50) === 'Poor');

// D6: NaN handling
check('D6', 'classifyAccessibility(NaN) = Poor (safe fallback)', classifyAccessibility(NaN) === 'Poor');

// D7: Real fiber data
const fdb = new DatabaseSync(`${PACK}/vectors/fiber.sqlite`);
const ftot = (fdb.prepare('SELECT COUNT(*) n FROM fiber').get() as any).n;
check('D7', 'Fiber segments in pack = 57,349', ftot === 57349, `${ftot}`);

// ============================================================
// E. POPULATION
// ============================================================
console.log('\n=== E. POPULATION ===');

// E1: Density classification (from app source)
check('E1', 'classifyDensity(0) = Rural', classifyDensity(0) === 'Rural');
check('E2', 'classifyDensity(99) = Rural', classifyDensity(99) === 'Rural');
check('E3', 'classifyDensity(100) = Semi-urban', classifyDensity(100) === 'Semi-urban');
check('E4', 'classifyDensity(499) = Semi-urban', classifyDensity(499) === 'Semi-urban');
check('E5', 'classifyDensity(500) = Urban', classifyDensity(500) === 'Urban');
check('E6', 'classifyDensity(1499) = Urban', classifyDensity(1499) === 'Urban');
check('E7', 'classifyDensity(1500) = Dense urban', classifyDensity(1500) === 'Dense urban');
check('E8', 'classifyDensity(10000) = Dense urban', classifyDensity(10000) === 'Dense urban');

// E9: NaN handling
check('E9', 'classifyDensity(NaN) = Rural (safe fallback)', classifyDensity(NaN) === 'Rural');

// E10: Synthetic raster integration
const LAT = AJMER.lat;
const flat = {
  sample: () => 400,
  cellDegLat: 1 / 111.32,
  cellDegLon: 1 / (111.32 * Math.cos((LAT * Math.PI) / 180)),
  bounds: [69.4, 23.0, 78.3, 30.3] as [number, number, number, number],
};
const pop = analyzePopulation(flat, AJMER.lat, AJMER.lon);
const expected10 = 400 * Math.PI * 100;
check('E10', 'Population 10km radius integrates correctly',
  Math.abs(pop.populationWithin10km - expected10) / expected10 < 0.12,
  `${pop.populationWithin10km} vs ~${Math.round(expected10)}`);

// E11: Tower-proxy fallback
const proxyPop = analyzePopulation(null, AJMER.lat, AJMER.lon, 5);
check('E11', 'Tower-proxy population flagged', proxyPop.source === 'tower-proxy');
check('E12', 'Tower-proxy density = fallback * 400', proxyPop.densityPerKm2 === 2000, `${proxyPop.densityPerKm2}`);

// ============================================================
// F. ELEVATION / LoS
// ============================================================
console.log('\n=== F. ELEVATION / LoS ===');

// F1: Flat terrain, tower-to-tower
const flatElev = { sample: () => 300 };
const los = analyzeLos(flatElev, AJMER, { lat: 26.99, lon: 75.79 }, { towerHeightM: 30, targetHeightM: 30, frequencyGhz: 2.1 });
check('F1', 'LoS flat terrain 30m/30m = Clear', los?.losStatus === 'Clear', los?.losStatus);

// F2: Flat terrain to handheld
const losHandheld = analyzeLos(flatElev, AJMER, { lat: 26.99, lon: 75.79 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('F2', 'LoS flat terrain to 1.5m = not Clear', losHandheld?.losStatus !== 'Clear', losHandheld?.losStatus);

// F3: Obstructed path
const ridge = { sample: (la: number, lo: number) => (Math.abs(la - 26.95) < 0.005 ? 900 : 300) };
const losBad = analyzeLos(ridge, AJMER, { lat: 26.99, lon: 75.79 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('F3', 'LoS with ridge = Obstructed', losBad?.losStatus === 'Obstructed', losBad?.losStatus);

// F4: Null sampler
check('F4', 'LoS with null sampler = null', analyzeLos(null, AJMER, { lat: 27, lon: 76 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 }) === null);

// F5: Profile length
check('F5', 'LoS profile has 65 points', los?.terrainProfile.length === 65, `${los?.terrainProfile.length}`);

// F6: Path loss reasonable
check('F6', 'LoS path loss 100-140dB', !!los && los.pathLossDb > 100 && los.pathLossDb < 140, `${los?.pathLossDb} dB`);

// F7: Recommended height
check('F7', 'Obstructed recommends taller tower', !!losBad && losBad.recommendedTowerHeight > 30, `${losBad?.recommendedTowerHeight} m`);

// ============================================================
// G. SOIL
// ============================================================
console.log('\n=== G. SOIL ===');

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
    faoCode: f.properties.FAOSOIL,
    soilType: f.properties.soil_type,
    foundationSuitability: f.properties.foundation_suitability,
    foundationNote: f.properties.foundation_note,
    minLon, minLat, maxLon, maxLat, polygons,
  };
});

check('G1', 'Soil polygons in pack = 40', polys.length === 40, `${polys.length}`);
const soilHit = lookupSoil(polys, AJMER.lat, AJMER.lon);
check('G2', 'Soil lookup at Ajmer returns result', !!soilHit, soilHit ? `${soilHit.faoCode} / ${soilHit.soilType}` : 'null');
const noHit = lookupSoil(polys, 0, 0);
check('G3', 'Soil lookup in ocean = null', noHit === null);

// ============================================================
// H. RoW
// ============================================================
console.log('\n=== H. RoW ===');

const row = analyzeRow('Rajasthan');
check('H1', 'RoW fee = 10000', row.applicationFee === 10000);
check('H2', 'RoW deemed approval = 67 days', row.deemedApprovalDays === 67);
check('H3', 'RoW documents listed', row.requiredDocuments.length >= 5, `${row.requiredDocuments.length} docs`);

// ============================================================
// I. COMMERCIAL FEASIBILITY
// ============================================================
console.log('\n=== I. COMMERCIAL FEASIBILITY ===');

// I1: Scoring — good site
const goodBundle: any = {
  population: { densityPerKm2: 900, densityClassification: 'Urban' },
  towers: { densityPerKm2: 0.5, saturationClassification: 'Low', colocationOpportunity: false },
  resources: { resourceScore: 5, fiberAccessibility: 'Excellent', nearestFiber: { distanceKm: 0.05 } },
  row,
  los: { losStatus: 'Clear', distanceKm: 10, recommendedTowerHeight: 30 },
  soil: { foundationSuitability: 'Best' },
  admin: { state: 'Rajasthan' },
};
const scGood = scoreFeasibility(goodBundle);
check('I1', 'Good site scores >= 7', scGood.score >= 7, `${scGood.score}`);
check('I2', 'Good site recommends Go', scGood.recommendation === 'Go', scGood.recommendation);

// I3: Scoring — bad site
const badBundle: any = {
  population: { densityPerKm2: 50, densityClassification: 'Rural' },
  towers: { densityPerKm2: 25, saturationClassification: 'Saturated', colocationOpportunity: true },
  resources: { resourceScore: 1, fiberAccessibility: 'Poor', nearestFiber: { distanceKm: 50 } },
  row,
  los: { losStatus: 'Obstructed', distanceKm: 10, recommendedTowerHeight: 120 },
  soil: { foundationSuitability: 'Poor' },
  admin: { state: 'Rajasthan' },
};
const scBad = scoreFeasibility(badBundle);
check('I3', 'Bad site scores < 4', scBad.score < 4, `${scBad.score}`);
check('I4', 'Bad site recommends No-Go', scBad.recommendation === 'No-Go', scBad.recommendation);

// I5: Scoring — conditional
const condBundle: any = {
  population: { densityPerKm2: 800, densityClassification: 'Urban' },
  towers: { densityPerKm2: 3, saturationClassification: 'Medium', colocationOpportunity: false },
  resources: { resourceScore: 3, fiberAccessibility: 'Fair', nearestFiber: { distanceKm: 1 } },
  row,
  los: { losStatus: 'Marginal', distanceKm: 10, recommendedTowerHeight: 45 },
  soil: { foundationSuitability: 'Fair' },
  admin: { state: 'Rajasthan' },
};
const scCond = scoreFeasibility(condBundle);
check('I5', 'Conditional site scores 4-6.9', scCond.score >= 4 && scCond.score < 7, `${scCond.score}`);
check('I6', 'Conditional site recommends Conditional', scCond.recommendation === 'Conditional', scCond.recommendation);

// I7: NaN handling in scoring
const nanBundle: any = {
  population: { densityPerKm2: NaN, densityClassification: 'Rural' },
  towers: { densityPerKm2: NaN, saturationClassification: 'Low', colocationOpportunity: false },
  resources: { resourceScore: 3, fiberAccessibility: 'Fair', nearestFiber: { distanceKm: 1 } },
  row,
  los: null,
  soil: { foundationSuitability: 'Unknown' },
  admin: { state: 'Rajasthan' },
};
const scNan = scoreFeasibility(nanBundle);
check('I7', 'NaN inputs produce valid score', scNan.score >= 1 && scNan.score <= 10, `${scNan.score}`);

// I8: Commercial assumptions — DOMAIN VALIDATION REQUIRED
checkBlocked('I8', 'CAPEX/OPEX/revenue model', 'No commercial model in app source — requires domain authority');

// ============================================================
// J. END-TO-END GOLDEN CASES
// ============================================================
console.log('\n=== J. END-TO-END GOLDEN CASES ===');

// J1: Ajmer — known location with real data
const ajmerBundle: any = {
  population: pop,
  towers: {
    towersWithin1km: w1, towersWithin2km: w2, towersWithin5km: w5,
    densityPerKm2: density1km, saturationClassification: classifySaturation(density1km),
    nearbyTowers: [], colocationOpportunity: w1 >= 3,
  },
  resources: {
    nearestFiber: { distanceKm: 1.2, name: 'BharatNet', detail: 'BBNL' },
    nearestRoad: null, resourceScore: 3, fiberAccessibility: 'Fair',
  },
  row,
  los,
  soil: soilHit!,
  admin: { state: 'Rajasthan', district: 'Ajmer', governingAuthority: 'DoT + Rajasthan RoW', complianceRequirements: [] },
};
const scAjmer = scoreFeasibility(ajmerBundle);
check('J1', 'Ajmer golden case: score in valid range', scAjmer.score >= 1 && scAjmer.score <= 10, `${scAjmer.score}`);
check('J2', 'Ajmer golden case: recommendation valid', ['Go', 'No-Go', 'Conditional'].includes(scAjmer.recommendation), scAjmer.recommendation);
check('J3', 'Ajmer golden case: saturated market flagged', scAjmer.criticalIssues.some((i: string) => /saturat/i.test(i)), scAjmer.criticalIssues.join(' | ').slice(0, 80));

// J2: Rural site — low density, no fiber
const ruralBundle: any = {
  population: { densityPerKm2: 50, densityClassification: 'Rural' },
  towers: { densityPerKm2: 0.5, saturationClassification: 'Low', colocationOpportunity: false },
  resources: { resourceScore: 1, fiberAccessibility: 'Poor', nearestFiber: { distanceKm: 50 } },
  row,
  los: { losStatus: 'Clear', distanceKm: 5, recommendedTowerHeight: 30 },
  soil: { foundationSuitability: 'Good' },
  admin: { state: 'Rajasthan', district: null, governingAuthority: 'DoT + Rajasthan RoW', complianceRequirements: [] },
};
const scRural = scoreFeasibility(ruralBundle);
check('J4', 'Rural site: score in valid range', scRural.score >= 1 && scRural.score <= 10, `${scRural.score}`);
check('J5', 'Rural site: no fiber flagged', scRural.criticalIssues.some((i: string) => /fiber/i.test(i)), scRural.criticalIssues.join(' | ').slice(0, 80));

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(70));
console.log(`GOLDEN TEST RESULTS: ${pass} passed, ${fail} failed, ${blocked} blocked`);
console.log('='.repeat(70));

if (fail > 0) {
  console.log('\nFAILURES:');
  results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ${r.id}: ${r.name} — ${r.detail}`));
}
if (blocked > 0) {
  console.log('\nBLOCKED (domain validation required):');
  results.filter(r => r.status === 'BLOCKED').forEach(r => console.log(`  ${r.id}: ${r.name} — ${r.detail}`));
}

process.exit(fail > 0 ? 1 : 0);
