// Desktop validation of the PMTiles range-read fix.
// Simulates the app's bridge: PMTiles asks for byte ranges, we read ONLY those
// bytes from disk (as the app now does via readAsStringAsync base64), and feed
// them back. If the file parses and a real tile decodes, the fix path is sound.
const fs = require('fs');
const path = require('path');

const PMTILES_PATH = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan/tiles/base-map.pmtiles';

// Mirror of the app's readRange: read exactly [offset, offset+length).
function readRange(uri, offset, length) {
  const fd = fs.openSync(uri, 'r');
  try {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, offset);
    const view = buf.subarray(0, n);
    // pmtiles expects a real ArrayBuffer
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  } finally {
    fs.closeSync(fd);
  }
}

(async () => {
  const { PMTiles } = require('/home/lakshya/company/towerfeasibility/app/node_modules/pmtiles');

  const stat = fs.statSync(PMTILES_PATH);
  console.log('file:', PMTILES_PATH);
  console.log('size:', stat.size, 'bytes');

  // Count range requests the way the WebView bridge would issue them.
  let rangeCalls = 0;
  let bytesRead = 0;

  const source = {
    getKey: () => 'local',
    getBytes: async (offset, length) => {
      rangeCalls++;
      bytesRead += length;
      return { data: readRange(PMTILES_PATH, offset, length) };
    },
  };

  const p = new PMTiles(source);

  const header = await p.getHeader();
  console.log('\n--- header ---');
  console.log('tileType :', header.tileType, '(1=mvt/pbf)');
  console.log('tileCompression:', header.tileCompression, '(1=gzip,2=brotli)');
  console.log('minZoom  :', header.minZoom, 'maxZoom:', header.maxZoom);
  console.log('bounds   :', header.minLon, header.minLat, header.maxLon, header.maxLat);
  console.log('addressedTilesCount:', header.addressedTilesCount);

  const meta = await p.getMetadata();
  console.log('\n--- metadata ---');
  console.log(JSON.stringify(meta).slice(0, 400));

  // Pull a real tile near the sample site (Ajmer, Rajasthan ~ z11).
  const z = 11;
  const lon = 75.7873, lat = 26.9124;
  const n = 2 ** z;
  const xt = Math.floor((lon + 180) / 360 * n);
  const yt = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  console.log(`\n--- tile z${z}/${xt}/${yt} (Ajmer) ---`);
  const tile = await p.getZxy(z, xt, yt);
  if (tile && tile.data) {
    console.log('tile bytes:', tile.data.byteLength);
    const u8 = new Uint8Array(tile.data);
    console.log('first 4 bytes:', Array.from(u8.slice(0, 4)));
    // gzip magic 1f 8b => compressed vector tile (normal for PMTiles)
    const isGzip = u8[0] === 0x1f && u8[1] === 0x8b;
    console.log('is gzip-compressed:', isGzip);
  } else {
    console.log('NO TILE at that coordinate');
  }

  console.log('\n--- bridge stats ---');
  console.log('range requests issued:', rangeCalls);
  console.log('total bytes over the wire:', bytesRead, `(${(bytesRead / stat.size * 100).toFixed(2)}% of file)`);
  console.log('\nRESULT:', header.tileType > 0 && rangeCalls > 0 ? 'PASS - PMTiles parses via ranged reads' : 'FAIL');
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
