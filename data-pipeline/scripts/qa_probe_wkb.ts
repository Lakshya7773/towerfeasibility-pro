/**
 * ADVERSARIAL PROBE B — WKB decoder endianness on REAL pack geometry.
 *
 * The app's Reader.uint32() infers endianness from the byte immediately
 * BEFORE the field (`getUint8(this.pos - 1)`). For the first field that is the
 * byte-order marker (correct); for the point-count field it is the last byte of
 * the geometry-type word — 0x00 for a plain little-endian LineString — so the
 * count is read as BIG-endian.
 *
 * Decodes real fiber geometry with (a) the app decoder and (b) a correct
 * little-endian parser, and compares.
 */
import { DatabaseSync } from 'node:sqlite';
import { decodeWkbLine } from '../../app/src/utils/wkb';

const PACK = '/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan';
const db = new DatabaseSync(`${PACK}/vectors/fiber.sqlite`);

/** node:sqlite returns BLOBs as a latin-1 string; normalise to bytes. */
function toBytes(v: any): Uint8Array | null {
  if (v == null) return null;
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (typeof v === 'string') return new Uint8Array(Buffer.from(v, 'latin1'));
  return null;
}

/** Independent, obviously-correct WKB LineString parser. */
function refDecode(buf: Uint8Array | null): [number, number][] | null {
  if (!buf || buf.length < 9) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const le = dv.getUint8(0) === 1;
  const type = dv.getUint32(1, le) & 0xffff;
  let off = 5;
  if (type !== 2) return null;
  const n = dv.getUint32(off, le); off += 4;
  if (n < 0 || n > 1_000_000) return null;
  if (off + n * 16 > buf.length) return null;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    out.push([dv.getFloat64(off, le), dv.getFloat64(off + 8, le)]);
    off += 16;
  }
  return out;
}

const rows = db.prepare(`SELECT id, geom FROM fiber LIMIT 40`).all() as any[];
console.log(`sampled ${rows.length} fiber geometries from the pack\n`);

let appOk = 0, appNull = 0, refOk = 0, mismatch = 0;
const examples: string[] = [];

for (const r of rows) {
  const buf = toBytes(r.geom)!;
  const app = decodeWkbLine(buf);
  const ref = refDecode(buf);
  if (app) appOk++; else appNull++;
  if (ref) refOk++;
  if (JSON.stringify(app) !== JSON.stringify(ref)) {
    mismatch++;
    if (examples.length < 6) {
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      examples.push(
        `  id=${r.id} ${buf.length}B byteOrder=${dv.getUint8(0)} ` +
        `typeWord=0x${dv.getUint32(1, true).toString(16)} ` +
        `countLE=${dv.getUint32(5, true)} countBE=${dv.getUint32(5, false)} | ` +
        `app=${app ? app.length + 'pts' : 'null'} ref=${ref ? ref.length + 'pts' : 'null'}`,
      );
    }
  }
}

console.log(`app decoder : ${appOk} decoded, ${appNull} returned null`);
console.log(`reference   : ${refOk} decoded`);
console.log(`mismatches  : ${mismatch}/${rows.length}\n`);
if (examples.length) { console.log('divergence examples:'); examples.forEach((e) => console.log(e)); }

const first = toBytes(rows[0].geom)!;
const dv0 = new DataView(first.buffer, first.byteOffset, first.byteLength);
console.log(`\nfirst geometry header: ${Array.from(first.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
console.log(`  byteOrder         = ${dv0.getUint8(0)}  (1 = little-endian)`);
console.log(`  geometryType (LE) = ${dv0.getUint32(1, true) & 0xffff}`);
console.log(`  pointCount (LE)   = ${dv0.getUint32(5, true)}`);
console.log(`  pointCount (BE)   = ${dv0.getUint32(5, false)}  <- what the app's uint32() reads`);
console.log(`  coord[0] (LE)     = [${dv0.getFloat64(9, true)}, ${dv0.getFloat64(17, true)}]`);
db.close();
