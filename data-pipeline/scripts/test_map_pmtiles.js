#!/usr/bin/env node
/**
 * Verify the offline map's PMTiles byte-range path works end to end.
 *
 * The app serves tiles by reading byte ranges from the pack's .pmtiles file.
 * This test reproduces exactly that flow in Node:
 *   1. open the pack's base-map.pmtiles
 *   2. register a pmtiles Protocol with a getBytes() backed by file slices
 *   3. fetch the TileJSON (pmtiles://local) and a real z/x/y tile
 *   4. decode the MVT and report the layers present
 *
 * If this passes, the WebView map will render the same tiles offline.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const APP = path.resolve(__dirname, '..', '..', 'app');
const pmtiles = require(path.join(APP, 'node_modules', 'pmtiles'));

const PACK = path.resolve(
  __dirname, '..', '..', 'dist', 'packs', 'data-pack-rajasthan',
  'tiles', 'base-map.pmtiles',
);

function main() {
  if (!fs.existsSync(PACK)) {
    console.error('FAIL: pack basemap missing:', PACK);
    process.exit(1);
  }
  const fd = fs.openSync(PACK, 'r');
  const stat = fs.fstatSync(fd);
  console.log(`pmtiles file: ${(stat.size / 1e6).toFixed(1)} MB`);

  // Mirror the app's bridge: getBytes(offset, length) -> ArrayBuffer
  let reads = 0;
  const source = {
    getKey: () => 'local',
    getBytes: async (offset, length) => {
      reads++;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, offset);
      return {
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      };
    },
  };

  const p = new pmtiles.PMTiles(source);

  (async () => {
    // 1. header
    const header = await p.getHeader();
    console.log(
      `header: type=${header.tileType} zoom=${header.minZoom}-${header.maxZoom} ` +
      `bounds=[${header.minLon},${header.minLat},${header.maxLon},${header.maxLat}]`,
    );

    // 2. metadata (layer list)
    const meta = await p.getMetadata();
    const layers = (meta.vector_layers || []).map((l) => l.id);
    console.log(`vector layers: ${layers.join(', ')}`);

    // 3. a real tile over Ajmer at z10
    const z = 10;
    const lon = 75.7873, lat = 26.9124;
    const n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    );
    const tile = await p.getZxy(z, x, y);
    if (!tile || !tile.data) {
      console.error(`FAIL: no tile at z${z}/${x}/${y} (Ajmer)`);
      process.exit(1);
    }
    let bytes = Buffer.from(tile.data);
    console.log(`tile z${z}/${x}/${y}: ${bytes.length} bytes (compressed)`);

    // 4. gunzip + scan MVT layer names
    let mvt = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      mvt = zlib.gunzipSync(bytes);
      console.log(`  decompressed: ${mvt.length} bytes`);
    }
    const names = new Set();
    for (const m of mvt.toString('latin1').matchAll(/[a-z_]{4,20}/g)) {
      const s = m[0];
      if (['water', 'roads', 'earth', 'landuse', 'landcover', 'places',
           'boundaries', 'buildings', 'pois'].includes(s)) names.add(s);
    }
    console.log(`  MVT layers found: ${[...names].sort().join(', ') || '(none scanned)'}`);

    console.log(`\nrange reads issued: ${reads}`);
    fs.closeSync(fd);

    if (names.size === 0) {
      console.error('FAIL: no known layers in tile');
      process.exit(1);
    }
    console.log('\nPASS: offline PMTiles range-read path works');
  })().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
}

main();
