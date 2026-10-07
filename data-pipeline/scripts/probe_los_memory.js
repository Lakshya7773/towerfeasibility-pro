#!/usr/bin/env node
/**
 * Reliability probe: peak memory when decoding the LoS window for different
 * target distances. The window is the endpoints' bounding box, so cost grows
 * with the square of the path length.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const geotiff = require(path.join(ROOT, 'app', 'node_modules', 'geotiff'));

const ELEV = path.join(ROOT, 'dist', 'packs', 'data-pack-rajasthan', 'elevation', 'elevation.tif');
const ORIGIN = { lat: 26.4499, lon: 74.6399 }; // Ajmer

const mb = (b) => (b / 1024 / 1024).toFixed(1);

async function run(distKm) {
  global.gc && global.gc();
  const before = process.memoryUsage().heapUsed;
  let peak = before;

  const buf = fs.readFileSync(ELEV);
  const tiff = await geotiff.fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution();
  const W = img.getWidth(), H = img.getHeight();

  // diagonal target
  const dLat = distKm / 111.32 / Math.SQRT2;
  const dLon = distKm / (111.32 * Math.cos(ORIGIN.lat * Math.PI / 180)) / Math.SQRT2;
  const a = [ORIGIN.lat, ORIGIN.lon];
  const b = [ORIGIN.lat + dLat, ORIGIN.lon + dLon];

  const idx = (lat, lon) => [
    Math.floor((lat - oy) / ry),
    Math.floor((lon - ox) / rx),
  ];
  const [r0, c0] = idx(a[0], a[1]);
  const [r1, c1] = idx(b[0], b[1]);
  const pad = 16;
  const x0 = Math.max(0, Math.min(c0, c1) - pad);
  const y0 = Math.max(0, Math.min(r0, r1) - pad);
  const x1 = Math.min(W, Math.max(c0, c1) + pad + 1);
  const y1 = Math.min(H, Math.max(r0, r1) + pad + 1);
  const w = x1 - x0, h = y1 - y0;

  const rasters = await img.readRasters({
    window: [x0, y0, x1, y1], interleave: false, width: w, height: h,
  });
  const band = Float32Array.from(rasters[0]);
  peak = Math.max(peak, process.memoryUsage().heapUsed);

  console.log(
    `${String(distKm).padStart(4)} km path -> window ${String(w).padStart(5)}x${String(h).padStart(5)}` +
    ` = ${String((w * h).toLocaleString()).padStart(12)} px` +
    ` | band ${mb(band.byteLength).padStart(7)} MB` +
    ` | heap delta ${mb(peak - before).padStart(7)} MB`,
  );
}

(async () => {
  console.log(`elevation raster: ${ELEV}`);
  console.log('(app default target is ~4.4 km; user-picked targets can be longer)\n');
  for (const d of [5, 10, 25, 50, 100, 200]) {
    await run(d);
  }
  console.log('\nNOTE: no window size cap exists in loadWindowSampler().');
})().catch((e) => { console.error(e); process.exit(1); });
