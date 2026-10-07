/**
 * ADVERSARIAL PROBE E — nearest-tower truncation, and whether the LoS
 * "recommended tower height" actually clears the obstruction it was derived from.
 */
import { DatabaseSync } from 'node:sqlite';
import { analyzeLos } from '../../app/src/analysis/losEngine';
import { haversineKm, bboxForRadius, curvatureBulgeM, fresnelRadiusM } from '../../app/src/utils/geo';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const tdb = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);

console.log('PROBE E\n');

// ---------------------------------------------------------------------------
console.log('--- E1. nearbyTowers truncation (query has LIMIT 400, no ORDER BY) ---');
for (const [name, lat, lon] of [['Jaipur', 26.9124, 75.7873], ['Ajmer', 26.4499, 74.6399]] as [string, number, number][]) {
  const b = bboxForRadius(lat, lon, 5);
  // What the engine gets (first 400 by rowid, matching the app's query)
  const engineRows = tdb.prepare(
    `SELECT id, lat, lon FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 400`,
  ).all(b.minLat, b.maxLat, b.minLon, b.maxLon) as any[];
  const engineNearest = engineRows
    .map((r) => ({ id: r.id, d: haversineKm(lat, lon, r.lat, r.lon) }))
    .filter((t) => t.d <= 5)
    .sort((a, c) => a.d - c.d)[0];

  // Ground truth: ALL towers in the bbox
  const allRows = tdb.prepare(
    `SELECT id, lat, lon FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
  ).all(b.minLat, b.maxLat, b.minLon, b.maxLon) as any[];
  const truthNearest = allRows
    .map((r) => ({ id: r.id, d: haversineKm(lat, lon, r.lat, r.lon) }))
    .filter((t) => t.d <= 5)
    .sort((a, c) => a.d - c.d)[0];

  console.log(`  ${name}: ${allRows.length} towers in 5 km bbox, engine sees ${engineRows.length}`);
  console.log(`    engine nearest : #${engineNearest?.id} at ${engineNearest?.d.toFixed(3)} km`);
  console.log(`    truth  nearest : #${truthNearest?.id} at ${truthNearest?.d.toFixed(3)} km`);
  console.log(`    -> ${engineNearest?.id === truthNearest?.id ? 'same' : 'DIFFERENT — nearest tower reported is not the nearest'}`);
  if (engineNearest?.id !== truthNearest?.id) {
    console.log(`    -> distance error: reports ${engineNearest?.d.toFixed(3)} km, true nearest is ${truthNearest?.d.toFixed(3)} km`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- E2. does the recommended tower height actually clear the path? ---');
function evaluate(heightM: number, from: any, to: any, ground: number) {
  const flat = { sample: () => ground };
  return analyzeLos(flat as any, from, to, { towerHeightM: heightM, targetHeightM: 1.5, frequencyGhz: 2.1 });
}
const from = { lat: 26.0, lon: 75.0 }, to = { lat: 26.1, lon: 75.0 };
const rec = evaluate(30, from, to, 300);
console.log(`  flat plain, 11.12 km path, 30 m tower -> status=${rec?.losStatus}`);
console.log(`  engine recommends ${rec?.recommendedTowerHeight} m`);
const withRec = evaluate(rec!.recommendedTowerHeight, from, to, 300);
console.log(`  re-running with the recommended ${rec?.recommendedTowerHeight} m -> status=${withRec?.losStatus}  (clear? ${withRec?.losStatus === 'Clear'})`);
const withRec2 = evaluate(rec!.recommendedTowerHeight * 2, from, to, 300);
console.log(`  re-running with ${rec!.recommendedTowerHeight * 2} m -> status=${withRec2?.losStatus}`);
// Find the height that actually clears it
let clearsAt = -1;
for (let h = 30; h <= 400; h += 5) {
  if (evaluate(h, from, to, 300)?.losStatus === 'Clear') { clearsAt = h; break; }
}
console.log(`  smallest height (step 5 m, up to 400) that yields Clear: ${clearsAt === -1 ? 'none found' : clearsAt + ' m'}`);
console.log(`  => recommendation of ${rec?.recommendedTowerHeight} m is ${withRec?.losStatus === 'Clear' ? 'sufficient' : 'INSUFFICIENT'}`);

// Where is the binding constraint?
const prof = rec!.terrainProfile;
const worst = prof.reduce((a, p) => (p.obstructed && p.distanceKm > (a?.distanceKm ?? -1) ? p : a), prof[0]);
console.log(`  obstruction extends to ${Math.max(...prof.filter(p => p.obstructed).map(p => p.distanceKm)).toFixed(2)} km of ${rec!.distanceKm} km`);

tdb.close();
