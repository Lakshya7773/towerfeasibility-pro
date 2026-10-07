/**
 * ============================================================================
 * REGRESSION SUITE — locks in the defects found during the release-gate audit.
 * ============================================================================
 *
 * Each block corresponds to a defect that was reproduced, fixed, and must never
 * silently return. These run against the REAL shipped pack (Rajasthan), not
 * synthetic fixtures, because every one of them was a data-encoding or
 * georeferencing defect that synthetic fixtures had failed to catch.
 *
 *   QA-1  fiber.geom holds WKT text, not WKB -> every fiber lookup returned null
 *   QA-2  WKB uint32() read the point count with the wrong endianness
 *   QA-3  tower counts used a square bbox as if it were a disc
 *   QA-4  nearby-tower query truncated at 400 rows with no ORDER BY
 *   QA-5  LoS recommended height ignored that the sight line lifts by (1 - t)
 *   QA-6  population grid walk assumed the raster origin was (0°, 0°)
 *
 * Run: npx tsx data-pipeline/scripts/qa_regression.ts
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { decodeLineGeom } from '../../app/src/utils/wkb';
import { haversineKm, bboxForRadius, circleAreaKm2 } from '../../app/src/utils/geo';
import { analyzeTowers } from '../../app/src/analysis/towerEngine';
import { nearestFiber, analyzeResources } from '../../app/src/analysis/resourceEngine';
import { analyzePopulation } from '../../app/src/analysis/populationEngine';
import { analyzeLos } from '../../app/src/analysis/losEngine';

const APP = '/home/lakshya/company/towerfeasibility/app';
const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const geotiff = require(path.join(APP, 'node_modules', 'geotiff'));

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  -> ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};

/** node:sqlite returns TEXT columns as strings; mirror what expo-sqlite does. */
function sqliteShim(file: string) {
  const raw = new DatabaseSync(file);
  return {
    async getAllAsync(sql: string, params: any[] = []) {
      return (raw.prepare(sql).all(...params) as any[]).map((r) => ({ ...r }));
    },
    async getFirstAsync(sql: string, params: any[] = []) {
      return (raw.prepare(sql).get(...params) as any) ?? null;
    },
    close: () => raw.close(),
  };
}

(async () => {
  const tdb = sqliteShim(`${PACK}/vectors/towers.sqlite`);
  const fdb = sqliteShim(`${PACK}/vectors/fiber.sqlite`);

  // =========================================================================
  console.log('\nQA-1 / QA-2  FIBER GEOMETRY DECODING (WKT + WKB)');
  // =========================================================================
  const wktLine = 'LINESTRING (74.1 26.1, 74.2 26.2, 74.3 26.3)';
  const d1 = decodeLineGeom(wktLine);
  ok('WKT LINESTRING decodes to 3 points', d1?.length === 3, `${d1?.length}`);
  ok('WKT first point is [lon, lat]', d1?.[0]?.[0] === 74.1 && d1?.[0]?.[1] === 26.1, JSON.stringify(d1?.[0]));
  const dMulti = decodeLineGeom('MULTILINESTRING ((74.1 26.1, 74.2 26.2),(75.0 27.0, 75.1 27.1))');
  ok('WKT MULTILINESTRING concatenates parts', dMulti?.length === 4, `${dMulti?.length}`);
  ok('malformed WKT -> null (no throw)', decodeLineGeom('LINESTRING (garbage)') === null, 'null');
  ok('empty string -> null', decodeLineGeom('') === null, 'null');
  ok('null -> null', decodeLineGeom(null) === null, 'null');

  // WKB little-endian LineString (2 points), built by hand.
  const wkbLe = new Uint8Array(1 + 4 + 4 + 16 * 2);
  const dv = new DataView(wkbLe.buffer);
  dv.setUint8(0, 1); dv.setUint32(1, 2, true); dv.setUint32(5, 2, true);
  dv.setFloat64(9, 74.5, true); dv.setFloat64(17, 26.5, true);
  dv.setFloat64(25, 74.6, true); dv.setFloat64(33, 26.6, true);
  const dw = decodeLineGeom(wkbLe);
  ok('WKB little-endian LineString decodes 2 points', dw?.length === 2, `${dw?.length}`);
  ok('WKB LE point count read little-endian (QA-2)', dw?.[0]?.[0] === 74.5, `${dw?.[0]?.[0]}`);

  // Real pack: every geom in the sampled window must decode.
  const rawFiber = new DatabaseSync(`${PACK}/vectors/fiber.sqlite`);
  const sample = rawFiber.prepare('SELECT geom FROM fiber LIMIT 300').all() as any[];
  const decoded = sample.map((r) => decodeLineGeom(typeof r.geom === 'string' ? r.geom : new Uint8Array(r.geom)));
  const decodedCount = decoded.filter((d) => d && d.length >= 2).length;
  ok('real pack: 300 sampled fiber rows all decode', decodedCount === sample.length, `${decodedCount}/${sample.length}`);
  const firstChars = sample.slice(0, 5).map((r) => String(r.geom).slice(0, 12));
  ok('real pack: geom is WKT text (QA-1 root cause)', firstChars.every((c) => /^LINESTRING|^MULTILINESTRING/.test(c)), firstChars[0]);
  rawFiber.close();

  // End-to-end: a city with fiber nearby must NOT report "none".
  const aj = await nearestFiber(fdb as any, 26.4499, 74.6399);
  ok('nearestFiber(Ajmer) returns a real distance', aj != null && aj.distanceKm < 50, `${aj?.distanceKm} km`);
  const res = await analyzeResources(fdb as any, 26.4499, 74.6399);
  ok('Ajmer fiber accessibility is not a false "no fiber"', res.nearestFiber.distanceKm < 50, `${res.nearestFiber.distanceKm} km, ${res.fiberAccessibility}`);
  ok('Ajmer resource score reflects the found fiber', res.resourceScore >= 2, `${res.resourceScore}/5`);

  // Ground truth by SQL over the rtree, decoded independently in Python-style WKT.
  const b = bboxForRadius(26.4499, 74.6399, 5);
  const near = fdb as any;
  const rows = await near.getAllAsync(
    `SELECT f.geom FROM fiber_rtree r JOIN fiber f ON f.id = r.id
     WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?`,
    [b.maxLon, b.minLon, b.maxLat, b.minLat]);
  let truthMin = Infinity;
  for (const r of rows) {
    const line = decodeLineGeom(r.geom);
    if (!line) continue;
    for (let i = 0; i < line.length; i++) {
      truthMin = Math.min(truthMin, haversineKm(26.4499, 74.6399, line[i][1], line[i][0]));
    }
  }
  ok('engine fiber distance is within the rtree ground-truth envelope',
    aj != null && aj.distanceKm <= truthMin + 0.01, `engine ${aj?.distanceKm} vs vertex-min ${truthMin.toFixed(3)}`);

  // =========================================================================
  console.log('\nQA-3 / QA-4  TOWER COUNTING AND NEAREST-TOWER SELECTION');
  // =========================================================================
  const rawT = new DatabaseSync(`${PACK}/vectors/towers.sqlite`);
  for (const [name, lat, lon] of [['Jaipur', 26.9124, 75.7873], ['Ajmer', 26.4499, 74.6399]] as [string, number, number][]) {
    const bb = bboxForRadius(lat, lon, 1);
    const bboxCount = (rawT.prepare(
      'SELECT COUNT(*) n FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?')
      .get(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon) as any).n as number;
    const all = rawT.prepare(
      'SELECT lat, lon FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?')
      .all(bb.minLat, bb.maxLat, bb.minLon, bb.maxLon) as any[];
    const discCount = all.filter((r) => haversineKm(lat, lon, r.lat, r.lon) <= 1).length;

    const engine = await analyzeTowers(tdb as any, lat, lon);
    ok(`${name}: engine 1 km count equals independent disc count (QA-3)`,
      engine.towersWithin1km === discCount, `engine ${engine.towersWithin1km} vs disc ${discCount} (bbox ${bboxCount})`);
    ok(`${name}: engine 1 km count differs from the raw bbox count`,
      bboxCount !== discCount, `bbox ${bboxCount} != disc ${discCount}`);
    ok(`${name}: engine density equals discCount / pi`,
      Math.abs(engine.densityPerKm2 - discCount / circleAreaKm2(1)) < 0.01,
      `${engine.densityPerKm2} vs ${(discCount / circleAreaKm2(1)).toFixed(2)}`);
  }

  // Nearest tower must be the true nearest, even in a dense city.
  const jp = await analyzeTowers(tdb as any, 26.9124, 75.7873);
  const jb = bboxForRadius(26.9124, 75.7873, 5);
  const jall = rawT.prepare(
    'SELECT id, lat, lon FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?')
    .all(jb.minLat, jb.maxLat, jb.minLon, jb.maxLon) as any[];
  const trueNearest = jall
    .map((r) => ({ id: r.id, d: haversineKm(26.9124, 75.7873, r.lat, r.lon) }))
    .filter((t) => t.d <= 5)
    .sort((a, c) => a.d - c.d)[0];
  ok('Jaipur nearest tower is the TRUE nearest (QA-4)',
    jp.nearbyTowers[0]?.id === trueNearest.id,
    `engine #${jp.nearbyTowers[0]?.id} @${jp.nearbyTowers[0]?.distanceKm.toFixed(3)} vs truth #${trueNearest.id} @${trueNearest.d.toFixed(3)}`);
  ok('Jaipur nearby list is sorted ascending',
    jp.nearbyTowers.every((t, i) => i === 0 || t.distanceKm >= jp.nearbyTowers[i - 1].distanceKm), 'sorted');
  rawT.close();

  // =========================================================================
  console.log('\nQA-5  LoS RECOMMENDED HEIGHT ACTUALLY CLEARS THE PATH');
  // =========================================================================
  const flat = { sample: () => 300 };
  const from = { lat: 26.0, lon: 75.0 }, to = { lat: 26.1, lon: 75.0 };
  const rec = analyzeLos(flat as any, from, to, { towerHeightM: 30, targetHeightM: 1.5, frequencyGhz: 2.1 })!;
  ok('flat 11 km path is not falsely Clear', rec.losStatus !== 'Clear', rec.losStatus);
  const re = analyzeLos(flat as any, from, to, { towerHeightM: rec.recommendedTowerHeight, targetHeightM: 1.5, frequencyGhz: 2.1 })!;
  ok('re-running at the recommended height clears the path (QA-5)', re.losStatus === 'Clear',
    `rec ${rec.recommendedTowerHeight} m -> ${re.losStatus}`);
  // Find the true minimum by bisection to confirm the recommendation is tight.
  let lo = 30, hi = 400;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = analyzeLos(flat as any, from, to, { towerHeightM: mid, targetHeightM: 1.5, frequencyGhz: 2.1 })!;
    if (r.losStatus === 'Clear') hi = mid; else lo = mid;
  }
  ok('recommended height is within 6 m of the true clearance height',
    Math.abs(rec.recommendedTowerHeight - hi) <= 6, `rec ${rec.recommendedTowerHeight} vs true ${hi.toFixed(1)}`);
  // A sight line must be straight: losLineM at the far end equals the target tip.
  const far = rec.terrainProfile[rec.terrainProfile.length - 1];
  ok('sight line terminates at the target antenna tip (straight line)',
    Math.abs(far.losLineM - (300 + 1.5)) < 0.2, `${far.losLineM} vs 301.5`);
  // Raising the tower must not change the far endpoint.
  const higher = analyzeLos(flat as any, from, to, { towerHeightM: 90, targetHeightM: 1.5, frequencyGhz: 2.1 })!;
  ok('raising the tower leaves the far endpoint fixed',
    Math.abs(higher.terrainProfile[higher.terrainProfile.length - 1].losLineM - 301.5) < 0.2,
    `${higher.terrainProfile[higher.terrainProfile.length - 1].losLineM}`);
  ok('raising the tower raises the near endpoint',
    higher.terrainProfile[0].losLineM === 390, `${higher.terrainProfile[0].losLineM}`);

  // =========================================================================
  console.log('\nQA-6  POPULATION GRID GEOREFERENCING');
  // =========================================================================
  const buf = readFileSync(`${PACK}/population/population.tif`);
  const tiff = await geotiff.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const origin = img.getOrigin();
  const res2 = img.getResolution();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const W = img.getWidth(), H = img.getHeight();
  const nodata = img.getGDALNoData() != null ? Number(img.getGDALNoData()) : null;
  const band = (await img.readRasters({ interleave: false }))[0] as ArrayLike<number>;
  const sampler = {
    sample: (lat: number, lon: number) => {
      const col = Math.floor((lon - origin[0]) / res2[0]);
      const row = Math.floor((lat - origin[1]) / res2[1]);
      if (row < 0 || col < 0 || row >= H || col >= W) return null;
      const v = band[row * W + col];
      if (v == null || !Number.isFinite(v)) return null;
      if (nodata != null && v === nodata) return null;
      return v;
    },
    cellDegLat: Math.abs(res2[1]), cellDegLon: Math.abs(res2[0]),
    bounds: [minX, minY, maxX, maxY] as [number, number, number, number],
    originLat: origin[1], originLon: origin[0],
  };
  const noOrigin = { ...sampler } as any;
  delete noOrigin.originLat; delete noOrigin.originLon;

  function correct(lat: number, lon: number, radiusKm: number) {
    const KMd = 111.32;
    // Use the ABSOLUTE cell size: res2[1] is negative (north-up raster), and
    // dividing by it would invert the row range.
    const stepLat = Math.abs(res2[1]), stepLon = Math.abs(res2[0]);
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dLat = radiusKm / KMd, dLon = radiusKm / (KMd * cosLat);
    const r0 = Math.floor((origin[1] - (lat + dLat)) / stepLat);
    const r1 = Math.ceil((origin[1] - (lat - dLat)) / stepLat);
    // Longitude increases eastward with column index (only latitude is flipped).
    const c0 = Math.floor((lon - dLon - origin[0]) / stepLon);
    const c1 = Math.ceil((lon + dLon - origin[0]) / stepLon);
    let people = 0;
    for (let r = r0; r <= r1; r++) {
      const cellLat = origin[1] - (r + 0.5) * stepLat;
      const dy = (cellLat - lat) * KMd;
      if (Math.abs(dy) > radiusKm) continue;
      for (let c = c0; c <= c1; c++) {
        const cellLon = origin[0] + (c + 0.5) * stepLon;
        const dx = (cellLon - lon) * KMd * cosLat;
        if (Math.sqrt(dx * dx + dy * dy) > radiusKm) continue;
        const v = band[r * W + c];
        if (v == null || !Number.isFinite(v)) continue;
        if (nodata != null && v === nodata) continue;
        people += v;
      }
    }
    return people;
  }

  let maxErr = 0;
  for (const [name, lat, lon] of [
    ['Ajmer', 26.4499, 74.6399], ['Jaipur', 26.9124, 75.7873], ['Jodhpur', 26.2389, 73.0243],
    ['Kota', 25.2138, 75.8648], ['Bikaner', 28.0229, 73.3119], ['Udaipur', 24.5854, 73.7125],
    ['Mount Abu', 24.5925, 72.7156],
  ] as [string, number, number][]) {
    const got = analyzePopulation(sampler as any, lat, lon, 0).populationWithin2km;
    const want = correct(lat, lon, 2);
    const err = Math.abs(got - want) / want;
    maxErr = Math.max(maxErr, err);
    ok(`${name}: 2 km population matches independent integration (QA-6)`,
      err < 0.005, `${got} vs ${want.toFixed(0)} (${(err * 100).toFixed(3)}%)`);
  }
  ok('max population error under 0.5%', maxErr < 0.005, `${(maxErr * 100).toFixed(3)}%`);

  // The pre-fix path must still be demonstrably worse, proving the fix matters.
  const before = analyzePopulation(noOrigin as any, 26.4499, 74.6399, 0).populationWithin2km;
  const after = analyzePopulation(sampler as any, 26.4499, 74.6399, 0).populationWithin2km;
  ok('origin-aware integration changes the result (fix is load-bearing)', before !== after,
    `pre-fix ${before} vs fixed ${after}`);

  tdb.close(); fdb.close();

  console.log(`\nREGRESSION SUITE: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
