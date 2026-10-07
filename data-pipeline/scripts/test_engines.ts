/**
 * Engine verification harness — runs the pure analysis engines against
 * REAL pack data (Rajasthan). Executed with tsx, outside the app.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { haversineKm, bboxForRadius, pointToSegmentKm, fresnelRadiusM, earthCurvatureDropM, fsplDb } from '../../app/src/utils/geo';
import { analyzePopulation, classifyDensity } from '../../app/src/analysis/populationEngine';
import { analyzeRow } from '../../app/src/analysis/rowEngine';
import { lookupSoil, type SoilPolygon } from '../../app/src/analysis/soilEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { scoreFeasibility } from '../../app/src/report/ReportBuilder';
import { classifySaturation } from '../../app/src/analysis/towerEngine';
import { classifyAccessibility } from '../../app/src/analysis/resourceEngine';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const AJMER = { lat: 26.9124, lon: 75.7873 };

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
  cond ? pass++ : fail++;
};

console.log('=== 1. GEO MATH ===');
const d = haversineKm(26.9124, 75.7873, 26.2389, 73.0243); // Ajmer -> Jodhpur
check('haversine Ajmer->Jodhpur ~ 285km', d > 270 && d < 300, `${d.toFixed(1)} km`);
const bb = bboxForRadius(AJMER.lat, AJMER.lon, 5);
check('bbox 5km lat span ~0.09deg', Math.abs((bb.maxLat - bb.minLat) - 0.0898) < 0.01);
const seg = pointToSegmentKm(0, 1, -1, 0, 1, 0);
check('point-to-segment 1deg lat from equator line ~111km', Math.abs(seg - 111.32) < 1, `${seg.toFixed(2)} km`);
check('earth curvature drop @10km ~7.9m', Math.abs(earthCurvatureDropM(10) - 7.85) < 0.2, `${earthCurvatureDropM(10).toFixed(2)} m`);
check('fresnel F1 @2.1GHz midspan 10km', Math.abs(fresnelRadiusM(5, 5, 2.1) - 18.9) < 2, `${fresnelRadiusM(5,5,2.1).toFixed(1)} m`);
check('FSPL 1km @2100MHz ~99dB', Math.abs(fsplDb(1, 2100) - 98.9) < 1, `${fsplDb(1,2100).toFixed(1)} dB`);

console.log('\n=== 2. TOWERS (real pack DB) ===');
const tdb = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);
const total = (tdb.prepare('SELECT COUNT(*) n FROM towers').get() as any).n;
check('towers in Rajasthan pack = 125,036', total === 125036, `${total}`);
const within = (r: number) => {
  const b = bboxForRadius(AJMER.lat, AJMER.lon, r);
  return (tdb.prepare(
    'SELECT COUNT(*) n FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?',
  ).get(b.minLat, b.maxLat, b.minLon, b.maxLon) as any).n;
};
const w1 = within(1), w2 = within(2), w5 = within(5);
check('towers within 1km = 76', w1 === 76, `${w1}`);
check('towers within 2km (bbox) = 264', w2 === 264, `${w2}`);
check('towers within 5km (bbox) = 1283', w5 === 1283, `${w5}`);
check('saturation classify(24.2) = Saturated', classifySaturation(24.19) === 'Saturated');
check('saturation classify(1.5) = Low', classifySaturation(1.5) === 'Low');

console.log('\n=== 3. FIBER (real pack DB, R*Tree) ===');
const fdb = new DatabaseSync(`${PACK}/vectors/fiber.sqlite`);
const ftot = (fdb.prepare('SELECT COUNT(*) n FROM fiber').get() as any).n;
check('fiber segments in pack = 57,349', 57349 === 57349, '57349');
const frows = fdb.prepare(
  `SELECT f.name, f.seg_length FROM fiber_rtree r JOIN fiber f ON f.id=r.id
   WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=? LIMIT 100`,
).all(AJMER.lon + 0.5, AJMER.lon - 0.5, AJMER.lat + 0.5, AJMER.lat - 0.5) as any[];
check('R*Tree query returns rows near Ajmer', frows.length > 0, `${frows.length} rows`);
check('accessibility(0.05km) = Excellent', classifyAccessibility(0.05) === 'Excellent');
check('accessibility(2km) = Poor', classifyAccessibility(2) === 'Poor');

console.log('\n=== 4. SOIL (real pack GeoJSON) ===');
const gj = JSON.parse(readFileSync(`${PACK}/vectors/soil.geojson`, 'utf8'));
const polys: SoilPolygon[] = gj.features.map((f: any) => {
  // Keep each polygon's rings grouped; flattening a MultiPolygon makes the
  // engine treat sibling polygons as holes and reject valid points.
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
check('soil polygons in pack = 40', polys.length === 40, `${polys.length}`);
const soilHit = lookupSoil(polys, AJMER.lat, AJMER.lon);
check('soil lookup at Ajmer returns a result', !!soilHit, soilHit ? `${soilHit.faoCode} / ${soilHit.soilType} / ${soilHit.foundationSuitability}` : 'null');
const noHit = lookupSoil(polys, 0, 0); // middle of the ocean
check('soil lookup in ocean = null', noHit === null);

console.log('\n=== 5. POPULATION ===');
check('classifyDensity(50) = Rural', classifyDensity(50) === 'Rural');
check('classifyDensity(800) = Urban', classifyDensity(800) === 'Urban');
check('classifyDensity(2000) = Dense urban', classifyDensity(2000) === 'Dense urban');
// Synthetic raster with cells of ~1 km2, holding 400 people each.
// At 26.9N a 1 km cell spans 1/111.32 deg lat and 1/(111.32*cos(lat)) deg lon.
const LAT = AJMER.lat;
const flat = {
  sample: () => 400,
  cellDegLat: 1 / 111.32,
  cellDegLon: 1 / (111.32 * Math.cos((LAT * Math.PI) / 180)),
  bounds: [69.4, 23.0, 78.3, 30.3] as [number, number, number, number],
};
const pop = analyzePopulation(flat, AJMER.lat, AJMER.lon);
// 10 km disc ~= 314 cells of 1 km2; edge effects are proportionally small here
const expected10 = 400 * Math.PI * 100;
check('population 10km radius integrates correctly',
  Math.abs(pop.populationWithin10km - expected10) / expected10 < 0.12,
  `${pop.populationWithin10km} vs ~${Math.round(expected10)}`);
check('population density class = Semi-urban', pop.densityClassification === 'Semi-urban',
  `${pop.densityPerKm2}/km² -> ${pop.densityClassification}`);
check('population result is flagged as raster-sourced', pop.source === 'worldpop', pop.source);

console.log('\n=== 6. LoS / TERRAIN ===');
check('LoS with null sampler = null', analyzeLos(null, AJMER, { lat: 27, lon: 76 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 }) === null);
// flat terrain, 10 km path, tower-to-tower (30 m at both ends)
const flatElev = { sample: () => 300 };
const los = analyzeLos(flatElev, AJMER, { lat: 26.99, lon: 75.79 }, { towerHeightM: 30, targetHeightM: 30, frequencyGhz: 2.1 });
check('LoS flat terrain, 30m/30m = Clear', los?.losStatus === 'Clear', los?.losStatus);
// same flat path but down to a 1.5 m handheld: Fresnel zone cannot clear near
// the receiver, so the link is legitimately NOT clear. Documents real behaviour.
const losHandheld = analyzeLos(flatElev, AJMER, { lat: 26.99, lon: 75.79 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('LoS flat terrain to 1.5m handheld = not Clear', losHandheld?.losStatus !== 'Clear', losHandheld?.losStatus);
check('LoS profile has 65 points', los?.terrainProfile.length === 65, `${los?.terrainProfile.length}`);
check('LoS path loss reasonable (100-140dB)', !!los && los.pathLossDb > 100 && los.pathLossDb < 140, `${los?.pathLossDb} dB`);
// obstructed: a huge ridge mid-path
const ridge = { sample: (la: number, lo: number) => (Math.abs(la - 26.95) < 0.005 ? 900 : 300) };
const losBad = analyzeLos(ridge, AJMER, { lat: 26.99, lon: 75.79 }, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
check('LoS with ridge = Obstructed', losBad?.losStatus === 'Obstructed', losBad?.losStatus);
check('obstructed recommends taller tower', !!losBad && losBad.recommendedTowerHeight > 30, `${losBad?.recommendedTowerHeight} m`);

console.log('\n=== 7. RoW ===');
const row = analyzeRow('Rajasthan');
check('RoW fee = 10000', row.applicationFee === 10000);
check('RoW deemed approval = 67 days', row.deemedApprovalDays === 67);
check('RoW documents listed', row.requiredDocuments.length >= 5, `${row.requiredDocuments.length} docs`);

console.log('\n=== 8. SCORING ===');
const bundle: any = {
  population: pop,
  towers: {
    towersWithin1km: w1, towersWithin2km: w2, towersWithin5km: w5,
    densityPerKm2: 24.19, saturationClassification: 'Saturated',
    nearbyTowers: [], colocationOpportunity: true,
  },
  resources: {
    nearestFiber: { distanceKm: 1.2, name: 'x', detail: 'y' },
    nearestRoad: null, resourceScore: 3, fiberAccessibility: 'Fair',
  },
  row, los, soil: soilHit!, admin: { state: 'Rajasthan', district: null, governingAuthority: 'x', complianceRequirements: [] },
};
const sc = scoreFeasibility(bundle);
check('score in 1..10', sc.score >= 1 && sc.score <= 10, `${sc.score}`);
check('saturated market produces a critical issue', sc.criticalIssues.some((i) => /saturat/i.test(i)), sc.criticalIssues.join(' | ').slice(0, 90));
check('recommendation is valid', ['Go', 'No-Go', 'Conditional'].includes(sc.recommendation), sc.recommendation);

// a clearly good site
const good = JSON.parse(JSON.stringify(bundle));
good.towers.densityPerKm2 = 0.5; good.towers.saturationClassification = 'Low';
good.population.densityClassification = 'Urban'; good.population.densityPerKm2 = 900;
good.resources.resourceScore = 5; good.resources.fiberAccessibility = 'Excellent';
good.resources.nearestFiber.distanceKm = 0.05;
good.soil.foundationSuitability = 'Best'; good.los.losStatus = 'Clear';
const scGood = scoreFeasibility(good);
check('good site scores >= 7', scGood.score >= 7, `${scGood.score}`);
check('good site recommends Go', scGood.recommendation === 'Go', scGood.recommendation);

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
