#!/usr/bin/env node
/**
 * Verify the app's GeoTIFF sampling path against the real pack rasters.
 *
 * The app decodes these with the `geotiff` package (fromArrayBuffer ->
 * getImage -> readRasters). This reproduces that exact flow in Node so the
 * decoding, the nodata handling and the pixel-index maths are all exercised
 * before the APK is built.
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', '..', 'app');
const geotiff = require(path.join(APP, 'node_modules', 'geotiff'));

const PACK = path.resolve(__dirname, '..', '..', 'dist', 'packs', 'data-pack-rajasthan');
const POP = path.join(PACK, 'population', 'population.tif');
const ELEV = path.join(PACK, 'elevation', 'elevation.tif');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? '  -> ' + detail : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}

function meta(img, nodata) {
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const res = img.getResolution();
  const origin = img.getOrigin();
  return { width: img.getWidth(), height: img.getHeight(),
           bounds: [minX, minY, maxX, maxY],
           originX: origin[0], originY: origin[1], resX: res[0], resY: res[1], nodata };
}

function pixIndex(m, lat, lon) {
  const col = Math.floor((lon - m.originX) / m.resX);
  const row = Math.floor((lat - m.originY) / m.resY);
  if (row < 0 || col < 0 || row >= m.height || col >= m.width) return null;
  return [row, col];
}

async function main() {
  // ---------- population ----------
  const popBuf = fs.readFileSync(POP);
  const popTiff = await geotiff.fromArrayBuffer(
    popBuf.buffer.slice(popBuf.byteOffset, popBuf.byteOffset + popBuf.byteLength));
  const popImg = await popTiff.getImage();
  const popNodata = popImg.getGDALNoData() != null ? Number(popImg.getGDALNoData()) : null;
  const pm = meta(popImg, popNodata);
  const popBand = (await popImg.readRasters({ interleave: false }))[0];

  console.log(`population raster: ${pm.width}x${pm.height} nodata=${pm.nodata}`);
  check('population raster decoded', pm.width > 0 && popBand.length === pm.width * pm.height,
    `${pm.width}x${pm.height}`);

  const samplePop = (lat, lon) => {
    const idx = pixIndex(pm, lat, lon);
    if (!idx) return null;
    const v = popBand[idx[0] * pm.width + idx[1]];
    if (v == null || !Number.isFinite(v)) return null;
    if (pm.nodata != null && v === pm.nodata) return null;
    return v;
  };

  const cfg = JSON.parse(fs.readFileSync(path.join(PACK, 'config', 'population.json'), 'utf8'));
  const cellKm2 = cfg.cell_area_km2;
  const ajmerPop = samplePop(26.4499, 74.6399);
  check('population samples at Ajmer', ajmerPop != null && ajmerPop > 0,
    `${Math.round(ajmerPop)} people/cell`);
  check('Ajmer density is plausible urban',
    ajmerPop / cellKm2 > 5000 && ajmerPop / cellKm2 < 25000,
    `${Math.round(ajmerPop / cellKm2)} people/km2`);

  const desertPop = samplePop(26.9157, 70.9083); // Jaisalmer
  check('desert (Jaisalmer) density < city density',
    desertPop / cellKm2 < ajmerPop / cellKm2,
    `${Math.round(desertPop / cellKm2)} vs ${Math.round(ajmerPop / cellKm2)} people/km2`);

  // integrate a 10 km disc the way the engine does
  const KM_LAT = 111.32;
  function integrate(lat, lon, radiusKm) {
    const stepLat = Math.abs(pm.resY), stepLon = Math.abs(pm.resX);
    const cosLat = Math.cos(lat * Math.PI / 180);
    let people = 0, cells = 0;
    const iy0 = Math.floor((lat - radiusKm / KM_LAT) / stepLat);
    const iy1 = Math.ceil((lat + radiusKm / KM_LAT) / stepLat);
    const ix0 = Math.floor((lon - radiusKm / (KM_LAT * cosLat)) / stepLon);
    const ix1 = Math.ceil((lon + radiusKm / (KM_LAT * cosLat)) / stepLon);
    for (let iy = iy0; iy <= iy1; iy++) {
      const cellLat = (iy + 0.5) * stepLat;
      const dy = (cellLat - lat) * KM_LAT;
      if (Math.abs(dy) > radiusKm) continue;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cellLon = (ix + 0.5) * stepLon;
        const dx = (cellLon - lon) * KM_LAT * cosLat;
        if (Math.sqrt(dx * dx + dy * dy) > radiusKm) continue;
        const v = samplePop(cellLat, cellLon);
        if (v != null) { people += v; cells++; }
      }
    }
    return { people, cells };
  }

  const r10 = integrate(26.4499, 74.6399, 10);
  check('10 km integration around Ajmer returns people', r10.people > 100000,
    `${Math.round(r10.people).toLocaleString()} people over ${r10.cells} cells`);

  // ---------- elevation (windowed) ----------
  const elevBuf = fs.readFileSync(ELEV);
  const elevTiff = await geotiff.fromArrayBuffer(
    elevBuf.buffer.slice(elevBuf.byteOffset, elevBuf.byteOffset + elevBuf.byteLength));
  const elevImg = await elevTiff.getImage();
  const elevNodata = elevImg.getGDALNoData() != null ? Number(elevImg.getGDALNoData()) : -32768;
  const em = meta(elevImg, elevNodata);
  console.log(`elevation raster: ${em.width}x${em.height} nodata=${em.nodata}`);
  check('elevation raster metadata read', em.width === 13824 && em.height === 12800,
    `${em.width}x${em.height}`);

  // window over a ~5 km LoS corridor near Ajmer
  const from = { lat: 26.4499, lon: 74.6399 };
  const to = { lat: 26.48, lon: 74.67 };
  const i0 = pixIndex(em, from.lat, from.lon);
  const i1 = pixIndex(em, to.lat, to.lon);
  const pad = 16;
  const x0 = Math.max(0, Math.min(i0[1], i1[1]) - pad);
  const y0 = Math.max(0, Math.min(i0[0], i1[0]) - pad);
  const x1 = Math.min(em.width, Math.max(i0[1], i1[1]) + pad + 1);
  const y1 = Math.min(em.height, Math.max(i0[0], i1[0]) + pad + 1);
  const w = x1 - x0, h = y1 - y0;

  const rasters = await elevImg.readRasters({
    window: [x0, y0, x1, y1], interleave: false, width: w, height: h,
  });
  const band = Float32Array.from(rasters[0]);
  check('elevation window decoded', band.length === w * h, `${w}x${h} = ${band.length} cells`);

  const elevSample = (lat, lon) => {
    const idx = pixIndex(em, lat, lon);
    if (!idx) return null;
    const lx = idx[1] - x0, ly = idx[0] - y0;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return null;
    const v = band[ly * w + lx];
    if (v == null || !Number.isFinite(v) || v === elevNodata) return null;
    return v;
  };

  const ajmerElev = elevSample(26.4499, 74.6399);
  check('elevation samples at Ajmer', ajmerElev != null && ajmerElev > 100 && ajmerElev < 1000,
    `${Math.round(ajmerElev)} m`);

  // a full profile across the window
  const N = 32;
  const prof = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    prof.push(elevSample(from.lat + (to.lat - from.lat) * t, from.lon + (to.lon - from.lon) * t));
  }
  const valid = prof.filter((v) => v != null);
  check('LoS path profile has usable samples', valid.length >= N * 0.9,
    `${valid.length}/${N + 1} valid, min=${Math.round(Math.min(...valid))} max=${Math.round(Math.max(...valid))} m`);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
