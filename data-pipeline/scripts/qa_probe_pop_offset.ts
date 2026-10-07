/**
 * ADVERSARIAL PROBE H — population integration georeferencing.
 *
 * populationEngine.integrate() computes cell centres as
 *     cellLat = (iy + 0.5) * stepLat
 * which assumes the raster origin is at (0,0) degrees. The actual raster origin
 * is lat 30.30, lon 69.40. The engine then samples the raster at that WRONG
 * coordinate, so the cells it sums (and the distance test it applies) are
 * offset from the cells it thinks it is reading.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { analyzePopulation, type PopulationRaster } from '../../app/src/analysis/populationEngine';

const APP = '/home/lakshya/company/towerfeasibility/app';
const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const geotiff = require(path.join(APP, 'node_modules', 'geotiff'));

(async () => {
  const buf = readFileSync(`${PACK}/population/population.tif`);
  const tiff = await geotiff.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const origin = img.getOrigin();
  const res = img.getResolution();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const W = img.getWidth(), H = img.getHeight();
  const nodata = img.getGDALNoData() != null ? Number(img.getGDALNoData()) : null;
  const band = (await img.readRasters({ interleave: false }))[0] as ArrayLike<number>;

  console.log('PROBE H — population integration georeferencing\n');
  console.log(`raster origin = (${origin[0]}, ${origin[1]})   resolution = (${res[0]}, ${res[1]})`);
  console.log(`bounds = [${minX}, ${minY}, ${maxX}, ${maxY}]\n`);
  console.log('The engine assumes cell centres at (i+0.5)*step, i.e. origin (0,0).');
  console.log(`True origin is lat ${origin[1]} — an offset of ${(origin[1] / Math.abs(res[1])).toFixed(0)} rows.\n`);

  const raster: PopulationRaster = {
    sample: (lat: number, lon: number) => {
      const col = Math.floor((lon - origin[0]) / res[0]);
      const row = Math.floor((lat - origin[1]) / res[1]);
      if (row < 0 || col < 0 || row >= H || col >= W) return null;
      const v = band[row * W + col];
      if (v == null || !Number.isFinite(v)) return null;
      if (nodata != null && v === nodata) return null;
      return v;
    },
    cellDegLat: Math.abs(res[1]),
    cellDegLon: Math.abs(res[0]),
    bounds: [minX, minY, maxX, maxY] as [number, number, number, number],
    // what RasterSampler.loadRaster() now returns
    originLat: origin[1],
    originLon: origin[0],
  };

  // The same raster WITHOUT an origin — the pre-fix behaviour, kept to show
  // the size of the correction.
  const rasterNoOrigin: PopulationRaster = { ...raster };
  delete (rasterNoOrigin as any).originLat;
  delete (rasterNoOrigin as any).originLon;

  /** Correct integration: walk the raster's own grid using its true origin. */
  function correctIntegrate(lat: number, lon: number, radiusKm: number) {
    const KM = 111.32;
    const stepLat = Math.abs(res[1]), stepLon = Math.abs(res[0]);
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dLat = radiusKm / KM, dLon = radiusKm / (KM * cosLat);
    const rowOf = (la: number) => Math.floor((la - origin[1]) / res[1]);
    const colOf = (lo: number) => Math.floor((lo - origin[0]) / res[0]);
    const r0 = Math.max(0, Math.min(rowOf(lat + dLat), rowOf(lat - dLat)));
    const r1 = Math.min(H - 1, Math.max(rowOf(lat + dLat), rowOf(lat - dLat)));
    const c0 = Math.max(0, Math.min(colOf(lon - dLon), colOf(lon + dLon)));
    const c1 = Math.min(W - 1, Math.max(colOf(lon - dLon), colOf(lon + dLon)));
    let people = 0, cells = 0;
    for (let r = r0; r <= r1; r++) {
      const cellLat = origin[1] + (r + 0.5) * res[1];
      const dy = (cellLat - lat) * KM;
      if (Math.abs(dy) > radiusKm) continue;
      for (let c = c0; c <= c1; c++) {
        const cellLon = origin[0] + (c + 0.5) * res[0];
        const dx = (cellLon - lon) * KM * cosLat;
        if (Math.sqrt(dx * dx + dy * dy) > radiusKm) continue;
        const v = band[r * W + c];
        if (v == null || !Number.isFinite(v)) continue;
        if (nodata != null && v === nodata) continue;
        people += v; cells++;
      }
    }
    return people;
  }

  const POINTS: [string, number, number][] = [
    ['Ajmer', 26.4499, 74.6399],
    ['Jaipur', 26.9124, 75.7873],
    ['Jodhpur', 26.2389, 73.0243],
    ['Kota', 25.2138, 75.8648],
    ['Bikaner', 28.0229, 73.3119],
    ['Udaipur', 24.5854, 73.7125],
    ['Mount Abu', 24.5925, 72.7156],
  ];

  console.log('site        pre-fix 2km   fixed 2km    correct 2km     pre-fix err   fixed err   class');
  let maxBefore = 0, maxAfter = 0;
  for (const [name, lat, lon] of POINTS) {
    const before = analyzePopulation(rasterNoOrigin, lat, lon, 0);
    const engine = analyzePopulation(raster, lat, lon, 0);
    const correct = correctIntegrate(lat, lon, 2);
    const errBefore = (before.populationWithin2km - correct) / correct;
    const errAfter = (engine.populationWithin2km - correct) / correct;
    maxBefore = Math.max(maxBefore, Math.abs(errBefore));
    maxAfter = Math.max(maxAfter, Math.abs(errAfter));
    const cls = (d: number) => d < 100 ? 'Rural' : d < 500 ? 'Semi-urban' : d < 1500 ? 'Urban' : 'Dense urban';
    const eD = engine.populationWithin2km / (Math.PI * 4);
    const cD = correct / (Math.PI * 4);
    console.log(
      `${name.padEnd(11)} ${String(before.populationWithin2km).padStart(10)} ${String(engine.populationWithin2km).padStart(11)} ` +
      `${correct.toFixed(0).padStart(13)} ${(errBefore * 100).toFixed(2).padStart(12)}% ${(errAfter * 100).toFixed(2).padStart(10)}%   ` +
      `${cls(eD) === cls(cD) ? 'same' : 'DIFFERS'}`,
    );
  }
  console.log(`\nmax population divergence before fix: ${(maxBefore * 100).toFixed(2)}%`);
  console.log(`max population divergence after  fix: ${(maxAfter * 100).toFixed(2)}%`);

  // Which cell does the engine actually read for Ajmer?
  const lat = 26.4499, lon = 74.6399;
  const step = Math.abs(res[1]);
  const nominalIy = Math.floor((lat - 2 / 111.32) / step);
  const nominalCenter = (nominalIy + 0.5) * step;
  const trueRow = Math.floor((nominalCenter - origin[1]) / res[1]);
  const trueCenter = origin[1] + (trueRow + 0.5) * res[1];
  console.log(`\nAjmer nominal first cell centre (engine thinks): ${nominalCenter.toFixed(4)}`);
  console.log(`  -> maps to raster row ${trueRow}, whose TRUE centre is ${trueCenter.toFixed(4)}`);
  console.log(`  -> systematic offset: ${((trueCenter - nominalCenter) * 111.32).toFixed(2)} km`);
})();
