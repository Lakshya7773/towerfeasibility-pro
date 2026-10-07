/**
 * ADVERSARIAL PROBE D — LoS flat-terrain behaviour, tower data integrity,
 * query truncation, dataset bounds.
 */
import { DatabaseSync } from 'node:sqlite';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { haversineKm, fresnelRadiusM, curvatureBulgeM, bboxForRadius } from '../../app/src/utils/geo';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const tdb = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);

console.log('PROBE D\n');

// ---------------------------------------------------------------------------
console.log('--- D1. LoS on perfectly flat terrain ---');
const flat = { sample: () => 300 };
const from = { lat: 26.0, lon: 75.0 }, to = { lat: 26.1, lon: 75.0 };
const d = haversineKm(from.lat, from.lon, to.lat, to.lon);
const los = analyzeLos(flat as any, from, to, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 });
console.log(`  path ${d.toFixed(3)} km, tower 30 m, target 1.5 m, freq 2.1 GHz`);
console.log(`  status=${los?.losStatus} fresnelClearance=${los?.fresnelClearance} recommended=${los?.recommendedTowerHeight} m`);
const mid = los!.terrainProfile[Math.floor(los!.terrainProfile.length / 2)];
console.log(`  midspan: ground=${mid.elevationM} m losLine=${mid.losLineM} m fresnelR=${mid.fresnelRadiusM} m obstructed=${mid.obstructed}`);
const bulge = curvatureBulgeM(d / 2, d / 2);
const fr = fresnelRadiusM(d / 2, d / 2, 2.1);
const clearance = mid.losLineM - mid.elevationM;
console.log(`  independent: bulge=${bulge.toFixed(3)} m, F1=${fr.toFixed(3)} m, 60%F1=${(0.6 * fr).toFixed(3)} m`);
console.log(`  actual clearance=${clearance.toFixed(3)} m  -> need >= ${(0.6 * fr).toFixed(3)} m`);
console.log(`  => flat terrain is flagged OBSTRUCTED because bulge ${bulge.toFixed(2)} m > clearance margin`);
const obstructedPts = los!.terrainProfile.filter((p) => p.obstructed).length;
console.log(`  obstructed sample points: ${obstructedPts}/${los!.terrainProfile.length}`);
console.log(`  worst recommended height: ${los!.recommendedTowerHeight} m for a flat plain`);

// ---------------------------------------------------------------------------
console.log('\n--- D2. tower table field population ---');
for (const col of ['operator', 'installation_type', 'emf_status', 'technology', 'source', 'source_id']) {
  const r = tdb.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN ${col} IS NULL THEN 1 ELSE 0 END) nulls,
            SUM(CASE WHEN TRIM(COALESCE(${col},''))='' THEN 1 ELSE 0 END) empties FROM towers`,
  ).get() as any;
  console.log(`  ${col.padEnd(18)} total=${r.total} nulls=${r.nulls} empty=${r.empties} (${((r.nulls / r.total) * 100).toFixed(1)}% null)`);
}
const dist = tdb.prepare(`SELECT installation_type, COUNT(*) n FROM towers GROUP BY installation_type ORDER BY n DESC`).all() as any[];
console.log('  installation_type distribution:', dist.map((d) => `${d.installation_type ?? 'NULL'}=${d.n}`).join(', '));

// ---------------------------------------------------------------------------
console.log('\n--- D3. analyzeTowers LIMIT 400 truncation risk ---');
for (const [name, lat, lon] of [['Ajmer', 26.4499, 74.6399], ['Jaipur', 26.9124, 75.7873]] as [string, number, number][]) {
  const b = bboxForRadius(lat, lon, 5);
  const total = (tdb.prepare(
    `SELECT COUNT(*) n FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
  ).get(b.minLat, b.maxLat, b.minLon, b.maxLon) as any).n;
  console.log(`  ${name}: ${total} towers in the 5 km bbox (query LIMIT is 400) ${total > 400 ? '<-- TRUNCATED' : ''}`);
}
// Worst case across the region
const worst = tdb.prepare(`
  SELECT COUNT(*) n FROM towers
  GROUP BY CAST((lat*20) AS INT), CAST((lon*20) AS INT)
  ORDER BY n DESC LIMIT 1`).get() as any;
console.log(`  densest 0.05-deg cell in the pack: ${worst?.n} towers`);

// ---------------------------------------------------------------------------
console.log('\n--- D4. tower coordinate integrity ---');
const bounds = tdb.prepare(
  `SELECT MIN(lat) minLat, MAX(lat) maxLat, MIN(lon) minLon, MAX(lon) maxLon, COUNT(*) n FROM towers`,
).get() as any;
console.log(`  lat ${bounds.minLat}..${bounds.maxLat}  lon ${bounds.minLon}..${bounds.maxLon}  n=${bounds.n}`);
console.log(`  lat in [-90,90]: ${bounds.minLat >= -90 && bounds.maxLat <= 90}`);
console.log(`  lon in [-180,180]: ${bounds.minLon >= -180 && bounds.maxLon <= 180}`);
const outside = tdb.prepare(
  `SELECT COUNT(*) n FROM towers WHERE lat < 23.0 OR lat > 30.3 OR lon < 69.4 OR lon > 78.3`,
).get() as any;
console.log(`  outside Rajasthan bbox (23-30.3 N, 69.4-78.3 E): ${outside.n}`);
const nullCoords = tdb.prepare(`SELECT COUNT(*) n FROM towers WHERE lat IS NULL OR lon IS NULL`).get() as any;
console.log(`  null coordinates: ${nullCoords.n}`);
const zeroCoords = tdb.prepare(`SELECT COUNT(*) n FROM towers WHERE lat = 0 OR lon = 0`).get() as any;
console.log(`  zero/null-island coordinates (0,0): ${zeroCoords.n}`);

// ---------------------------------------------------------------------------
console.log('\n--- D5. population / elevation raster bounds (from config) ---');
import { readFileSync } from 'node:fs';
try {
  const pcfg = JSON.parse(readFileSync(`${PACK}/config/population.json`, 'utf8'));
  console.log('  population config:', JSON.stringify(pcfg));
} catch (e) { console.log('  population config unreadable', e); }
try {
  const scfg = JSON.parse(readFileSync(`${PACK}/config/soil-classification.json`, 'utf8'));
  console.log('  soil-classification keys:', Object.keys(scfg).slice(0, 8).join(', '), '...');
} catch (e) { console.log('  soil config unreadable', e); }

// ---------------------------------------------------------------------------
console.log('\n--- D6. is the fiber geom column actually usable as-is? ---');
const fdb = new DatabaseSync(`${PACK}/vectors/fiber.sqlite`);
const sample = fdb.prepare(`SELECT geom FROM fiber LIMIT 1`).get() as any;
const raw = sample.geom;
console.log(`  declared column type: BLOB`);
console.log(`  actual SQLite typeof: ${typeof raw === 'string' ? 'text' : 'blob'}`);
console.log(`  first 40 chars: ${String(raw).slice(0, 40)}`);
console.log(`  matches /^LINESTRING/i : ${/^LINESTRING/i.test(String(raw))}`);
console.log(`  matches /^MULTILINESTRING/i : ${/^MULTILINESTRING/i.test(String(raw))}`);
const kinds = fdb.prepare(`
  SELECT CASE
    WHEN geom LIKE 'LINESTRING%' THEN 'LINESTRING'
    WHEN geom LIKE 'MULTILINESTRING%' THEN 'MULTILINESTRING'
    ELSE 'other' END k, COUNT(*) n FROM fiber GROUP BY k`).all() as any[];
console.log('  geometry kinds:', kinds.map((k) => `${k.k}=${k.n}`).join(', '));
fdb.close();
tdb.close();
