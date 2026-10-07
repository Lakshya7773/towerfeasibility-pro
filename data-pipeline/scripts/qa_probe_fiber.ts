/**
 * ADVERSARIAL PROBE C — does fiber analysis actually work end-to-end?
 *
 * PROBE B found that fiber.geom contains WKT TEXT, not WKB binary. The app's
 * resourceEngine passes geom to decodeWkbLine() (a WKB binary parser), which
 * returns null for every row. If so, nearestFiber() always returns null and
 * every site reports "no fiber within 50 km" — regardless of reality.
 *
 * This drives the REAL analyzeResources() against the REAL pack DB, via a
 * shim that mimics expo-sqlite's SQLiteDatabase surface.
 */
import { DatabaseSync } from 'node:sqlite';
import { analyzeResources, nearestFiber } from '../../app/src/analysis/resourceEngine';
import { haversineKm, pointToSegmentKm } from '../../app/src/utils/geo';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const raw = new DatabaseSync(`${PACK}/vectors/fiber.sqlite`);

/** Minimal shim matching the expo-sqlite async surface the engine uses. */
const dbShim: any = {
  async getAllAsync(sql: string, params: any[] = []) {
    const stmt = raw.prepare(sql);
    const rows = stmt.all(...params) as any[];
    // expo-sqlite hands back Uint8Array for BLOBs; node:sqlite gives a
    // latin-1 string. Normalise so the engine sees the same bytes it would
    // on-device (this is faithful, not a workaround).
    return rows.map((r) => ({
      ...r,
      geom: r.geom == null
        ? null
        : typeof r.geom === 'string'
          ? new Uint8Array(Buffer.from(r.geom, 'latin1'))
          : new Uint8Array(r.geom),
    }));
  },
  async getFirstAsync(sql: string, params: any[] = []) {
    const stmt = raw.prepare(sql);
    return (stmt.get(...params) as any) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Ground truth computed directly in SQL: nearest fiber using the R*Tree bbox
// and a correct WKT parse, independent of the app's decoder.
// ---------------------------------------------------------------------------
function parseWktLine(wkt: string): [number, number][] | null {
  const m = /^LINESTRING\s*\((.*)\)$/i.exec(wkt.trim());
  if (!m) return null;
  return m[1].split(',').map((pair) => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    return [x, y] as [number, number];
  });
}

function truthNearestFiber(lat: number, lon: number, maxKm = 50) {
  const dLat = maxKm / 111.32;
  const dLon = maxKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const rows = raw.prepare(
    `SELECT f.name, f.owner, f.geom FROM fiber_rtree r JOIN fiber f ON f.id = r.id
     WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?`,
  ).all(lon + dLon, lon - dLon, lat + dLat, lat - dLat) as any[];
  let best: number | null = null;
  for (const r of rows) {
    const line = parseWktLine(String(r.geom));
    if (!line) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const d = pointToSegmentKm(lat, lon, line[i][1], line[i][0], line[i + 1][1], line[i + 1][0]);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

const SITES: [string, number, number][] = [
  ['Ajmer (city)', 26.4499, 74.6399],
  ['Jaipur (city)', 26.9124, 75.7873],
  ['Jodhpur (city)', 26.2389, 73.0243],
  ['Kota (city)', 25.2138, 75.8648],
  ['Bikaner (city)', 28.0229, 73.3119],
  ['Rural Barmer', 25.75, 71.4],
  ['Rural Jaisalmer', 26.9157, 70.9083],
];

(async () => {
  console.log('PROBE C — fiber analysis: real engine vs SQL ground truth\n');
  console.log('site                 engine_distance  engine_score  engine_access   truth_distance   VERDICT');
  
  let broken = 0;
  for (const [name, lat, lon] of SITES) {
    const res = await analyzeResources(dbShim, lat, lon);
    const truth = truthNearestFiber(lat, lon);
    const engKm = res.nearestFiber.distanceKm;
    const engineFound = res.nearestFiber.detail !== 'no BharatNet OFC within 50 km';
    const truthStr = truth == null ? '>50 km' : `${truth.toFixed(3)} km`;
    const wrong = truth != null && !engineFound;
    if (wrong) broken++;
    console.log(
      `${name.padEnd(20)} ${String(engKm).padStart(14)}  ${String(res.resourceScore).padStart(11)}  ` +
      `${res.fiberAccessibility.padEnd(14)}  ${truthStr.padStart(13)}   ` +
      `${wrong ? 'MISMATCH — fiber exists but engine reports none' : 'ok'}`,
    );
  }
  
  console.log(`\nsites where real fiber exists but the engine reports none: ${broken}/${SITES.length}`);
  
  // Direct probe of nearestFiber()
  const direct = await nearestFiber(dbShim, 26.4499, 74.6399, 50);
  console.log(`\nnearestFiber(Ajmer) -> ${direct ? JSON.stringify(direct) : 'null'}`);
  console.log(`ground truth (SQL+WKT) -> ${truthNearestFiber(26.4499, 74.6399)?.toFixed(3) ?? 'none'} km`);
  
  // How many fiber rows are within 10 km of Ajmer, per ground truth?
  const within10 = (() => {
    const dLat = 10 / 111.32, dLon = 10 / (111.32 * Math.cos(26.4499 * Math.PI / 180));
    const rows = raw.prepare(
      `SELECT f.geom FROM fiber_rtree r JOIN fiber f ON f.id = r.id
       WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?`,
    ).all(74.6399 + dLon, 74.6399 - dLon, 26.4499 + dLat, 26.4499 - dLat) as any[];
    let n = 0;
    for (const r of rows) {
      const line = parseWktLine(String(r.geom));
      if (!line) continue;
      for (let i = 0; i < line.length - 1; i++) {
        if (pointToSegmentKm(26.4499, 74.6399, line[i][1], line[i][0], line[i + 1][1], line[i + 1][0]) <= 10) { n++; break; }
      }
    }
    return n;
  })();
  console.log(`fiber segments actually within 10 km of Ajmer (ground truth): ${within10}`);
  
  raw.close();
  
})();
