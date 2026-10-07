#!/usr/bin/env node
/**
 * Verify the windowed-read memory cap.
 *
 * `loadWindowSampler` decodes the bounding box of the LoS endpoints. Without a
 * cap, cost grows with the square of the path length and a long path would be
 * killed on a phone. This exercises the real planning logic (app/src/data/
 * windowPlan.ts) and the real banded decode against the shipped elevation
 * raster, at path lengths from realistic (5 km) to absurd (500 km).
 */
const fs = require('fs');
const path = require('path');
const ts = require(path.join(
  path.resolve(__dirname, '..', '..', 'app'), 'node_modules', 'typescript'));

const APP = path.resolve(__dirname, '..', '..', 'app');
const geotiff = require(path.join(APP, 'node_modules', 'geotiff'));

const ELEV = path.resolve(
  __dirname, '..', '..', 'dist', 'packs', 'data-pack-rajasthan', 'elevation', 'elevation.tif');

// Load the TS module by transpiling it (no RN imports in this file).
const src = fs.readFileSync(path.join(APP, 'src', 'data', 'windowPlan.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', js)(mod.exports, require, mod);
const { planWindow, pixelIndex, MAX_WINDOW_CELLS } = mod.exports;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? '  -> ' + detail : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}

const MB = (cells) => (cells * 4 / 1e6).toFixed(1);

(async () => {
  const buf = fs.readFileSync(ELEV);
  const tiff = await geotiff.fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const origin = img.getOrigin();
  const res = img.getResolution();
  const meta = {
    width: img.getWidth(), height: img.getHeight(),
    originX: origin[0], originY: origin[1], resX: res[0], resY: res[1],
  };
  console.log(`elevation raster: ${meta.width}x${meta.height}`);

  const ORIGIN = { lat: 26.4499, lon: 74.6399 }; // Ajmer

  console.log('\n--- planWindow: retained cells stay capped ---');
  let allCapped = true;
  for (const dKm of [5, 10, 25, 50, 100, 200, 500]) {
    const dLat = dKm / 111.32 / Math.SQRT2;
    const dLon = dKm / (111.32 * Math.cos(ORIGIN.lat * Math.PI / 180)) / Math.SQRT2;
    const plan = planWindow(meta, [ORIGIN, { lat: ORIGIN.lat + dLat, lon: ORIGIN.lon + dLon }], 16);
    const retained = plan.outW * plan.outH;
    const capped = retained <= MAX_WINDOW_CELLS * 1.05;
    if (!capped) allCapped = false;
    console.log(
      `  ${String(dKm).padStart(4)} km -> src ${String(plan.w).padStart(5)}x${String(plan.h).padStart(5)}` +
      ` stride ${String(plan.stride).padStart(3)} -> retained ${String(retained).padStart(9)} cells (${MB(retained).padStart(6)} MB)` +
      `  bands of ${plan.rowsPerBand} rows`);
  }
  check('retained cells capped at all path lengths', allCapped, `<= ${MAX_WINDOW_CELLS.toLocaleString()} cells`);

  console.log('\n--- short paths are not decimated ---');
  const short = planWindow(meta, [ORIGIN, { lat: 26.48, lon: 74.67 }], 16);
  check('5 km path uses stride 1 (no quality loss)', short.stride === 1,
    `stride=${short.stride}, ${short.w}x${short.h}`);

  console.log('\n--- banded decode of a 500 km window matches the plan ---');
  const dLat = 500 / 111.32 / Math.SQRT2;
  const dLon = 500 / (111.32 * Math.cos(ORIGIN.lat * Math.PI / 180)) / Math.SQRT2;
  const plan = planWindow(meta, [ORIGIN, { lat: ORIGIN.lat + dLat, lon: ORIGIN.lon + dLon }], 16);
  const band = new Float32Array(plan.outW * plan.outH).fill(NaN);
  let bands = 0;
  let peak = 0;
  for (let by = 0; by < plan.h; by += plan.rowsPerBand) {
    const bh = Math.min(plan.rowsPerBand, plan.h - by);
    const rasters = await img.readRasters({
      window: [plan.x0, plan.y0 + by, plan.x0 + plan.w, plan.y0 + by + bh],
      interleave: false, width: plan.w, height: plan.h === 0 ? 0 : bh,
    });
    bands++;
    peak = Math.max(peak, plan.w * bh * 4);
    const srcBand = rasters[0];
    for (let ly = 0; ly < bh; ly++) {
      const absRow = by + ly;              // stride on the absolute source row
      if (absRow % plan.stride !== 0) continue;
      const oy = absRow / plan.stride;
      if (oy >= plan.outH) continue;
      for (let lx = 0; lx < plan.w; lx += plan.stride) {
        const ox = lx / plan.stride;
        if (ox >= plan.outW) break;
        band[oy * plan.outW + ox] = srcBand[ly * plan.w + lx];
      }
    }
  }
  const filled = band.reduce((n, v) => n + (Number.isFinite(v) ? 1 : 0), 0);
  check('500 km window decoded in multiple bands', bands > 1, `${bands} bands`);
  check('peak single-band decode bounded', peak < 10e6, `${MB(peak / 4)} MB peak band`);
  check('retained array mostly populated', filled > band.length * 0.9,
    `${filled}/${band.length} finite`);

  // A sample inside the window must land on real terrain.
  const idx = pixelIndex(meta, ORIGIN.lat, ORIGIN.lon);
  const lx = Math.floor((idx[1] - plan.x0) / plan.stride);
  const ly = Math.floor((idx[0] - plan.y0) / plan.stride);
  const v = band[ly * plan.outW + lx];
  check('Ajmer samples real elevation through the strided window',
    Number.isFinite(v) && v > 100 && v < 1000, `${Math.round(v)} m`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`WINDOW CAP: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(60));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
