/**
 * ADVERSARIAL PROBE A — does the tower count use a square bbox as a disc?
 *
 * towerEngine.countWithin() does `lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`
 * with a bbox sized for the radius, and the density is then divided by the
 * DISC area (pi r^2). A bbox has area 4 r^2 in the local metric, so the count
 * is expected to be over-counted by 4/pi = 1.273x on uniform data.
 *
 * This measures the real error against the real Rajasthan pack by comparing:
 *   - the engine's bbox count
 *   - an exact disc count (haversine <= radius)
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { haversineKm, bboxForRadius, circleAreaKm2 } from '../../app/src/utils/geo';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const db = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);

function bboxCount(lat: number, lon: number, r: number): number {
  const b = bboxForRadius(lat, lon, r);
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM towers
     WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
  ).get(b.minLat, b.maxLat, b.minLon, b.maxLon) as { n: number };
  return row.n;
}

function discCount(lat: number, lon: number, r: number): number {
  const b = bboxForRadius(lat, lon, r);
  const rows = db.prepare(
    `SELECT lat, lon FROM towers
     WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
  ).all(b.minLat, b.maxLat, b.minLon, b.maxLon) as { lat: number; lon: number }[];
  return rows.filter((t) => haversineKm(lat, lon, t.lat, t.lon) <= r).length;
}

const SITES = [
  ['Ajmer', 26.4499, 74.6399],
  ['Jaipur', 26.9124, 75.7873],
  ['Jodhpur', 26.2389, 73.0243],
  ['Bikaner', 28.0229, 73.3119],
  ['Jaisalmer', 26.9157, 70.9083],
  ['Rural Barmer', 25.75, 71.4],
];

console.log('PROBE A — bbox count vs exact disc count (1 km ring)\n');
console.log('site            bbox   disc   ratio   engine_density  true_density  bbox_class      disc_class');
let maxRatio = 0, changed = 0;
for (const [name, lat, lon] of SITES) {
  const bb = bboxCount(lat as number, lon as number, 1);
  const dc = discCount(lat as number, lon as number, 1);
  const ratio = dc > 0 ? bb / dc : NaN;
  if (Number.isFinite(ratio)) maxRatio = Math.max(maxRatio, ratio);
  const dEngine = (bb as number) / circleAreaKm2(1);
  const dTrue = (dc as number) / circleAreaKm2(1);
  const cls = (d: number) => d < 2 ? 'Low' : d < 5 ? 'Medium' : d < 10 ? 'High' : 'Saturated';
  const c1 = cls(dEngine), c2 = cls(dTrue);
  if (c1 !== c2) changed++;
  console.log(
    `${(name as string).padEnd(14)} ${String(bb).padStart(5)} ${String(dc).padStart(5)} ` +
    `${(Number.isFinite(ratio) ? ratio.toFixed(3) : '   n/a').padStart(6)}  ` +
    `${dEngine.toFixed(2).padStart(13)}  ${dTrue.toFixed(2).padStart(11)}  ` +
    `${c1.padEnd(14)}  ${c2}${c1 !== c2 ? '   <-- MISCLASSIFIED' : ''}`,
  );
}

console.log(`\ntheoretical uniform error = 4/pi = ${(4 / Math.PI).toFixed(3)}`);
console.log(`max observed bbox/disc ratio = ${maxRatio.toFixed(3)}`);
console.log(`saturation classes changed by using the correct disc = ${changed}/${SITES.length}`);
db.close();
