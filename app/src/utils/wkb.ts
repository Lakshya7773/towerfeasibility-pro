/**
 * Geometry decoding for the fiber store.
 *
 * The pack's `fiber.geom` column is declared BLOB but the upstream dataset
 * (ramSeraph/indian_communications, scraped from BharatNet/BBNL) stores
 * **WKT text**, not WKB binary. Both forms must be supported: WKT is what the
 * shipped packs contain, and WKB is what a corrected pipeline can emit.
 *
 * This module therefore:
 *   - sniffs the payload and parses WKT when it is text
 *   - parses WKB (little- or big-endian) otherwise
 * and returns a flat list of [lon, lat] coordinates for distance work.
 *
 * Two defects in the previous implementation are fixed here:
 *   1. it only understood WKB, so every WKT row decoded to null and fiber
 *      analysis silently reported "no fiber within 50 km" everywhere;
 *   2. its uint32() inferred endianness from the byte BEFORE the field, so the
 *      point count of a little-endian LineString was read as big-endian.
 */

type Coord = [lon: number, lat: number];

const LITTLE = 1;

// ---------------------------------------------------------------------------
// WKT
// ---------------------------------------------------------------------------

/**
 * Parse a WKT LINESTRING / MULTILINESTRING into coordinates.
 * Returns null if the text is not one of those geometries.
 */
function decodeWkt(text: string): Coord[] | null {
  const t = text.trim();
  const m = /^(MULTI)?LINESTRING\s*(?:Z|M|ZM)?\s*\((.*)\)$/is.exec(t);
  if (!m) return null;
  const isMulti = !!m[1];
  const body = m[2];

  const parsePairs = (chunk: string): Coord[] | null => {
    const out: Coord[] = [];
    for (const raw of chunk.split(',')) {
      const pair = raw.trim();
      if (!pair) continue;
      const nums = pair.trim().split(/\s+/);
      if (nums.length < 2) return null;
      const lon = Number(nums[0]);
      const lat = Number(nums[1]);
      // Reject the whole geometry on a malformed vertex rather than silently
      // dropping it: a line with vertices removed would give a wrong distance.
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      out.push([lon, lat]);
    }
    return out.length ? out : null;
  };

  if (!isMulti) return parsePairs(body);

  // MULTILINESTRING ((...),(...)) — concatenate the parentheses groups.
  const out: Coord[] = [];
  const groupRe = /\(([^()]*)\)/g;
  let g: RegExpExecArray | null;
  let sawGroup = false;
  while ((g = groupRe.exec(body)) !== null) {
    sawGroup = true;
    const part = parsePairs(g[1]);
    if (!part) return null;
    out.push(...part);
  }
  if (!sawGroup) return parsePairs(body);
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------
// WKB
// ---------------------------------------------------------------------------

class Reader {
  private view: DataView;
  pos = 0;
  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  byteOrder(): number {
    const b = this.view.getUint8(this.pos);
    this.pos += 1;
    return b;
  }
  /** Endianness is passed in explicitly — never inferred from a stray byte. */
  uint32(le: boolean): number {
    const v = this.view.getUint32(this.pos, le);
    this.pos += 4;
    return v;
  }
  double(le: boolean): number {
    const v = this.view.getFloat64(this.pos, le);
    this.pos += 8;
    return v;
  }
  get remaining(): number {
    return this.buf.length - this.pos;
  }
}

function readLine(r: Reader, le: boolean): Coord[] {
  const n = r.uint32(le);
  // Guard against a corrupt or absurd count before allocating.
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return [];
  if (r.remaining < n * 16) return [];
  const out: Coord[] = [];
  for (let i = 0; i < n; i++) {
    const x = r.double(le);
    const y = r.double(le);
    out.push([x, y]);
  }
  return out;
}

function decodeWkb(buf: Uint8Array): Coord[] | null {
  if (buf.length < 9) return null;
  try {
    const r = new Reader(buf);
    const bo = r.byteOrder();
    if (bo !== 0 && bo !== 1) return null; // not a WKB byte-order marker
    const le = bo === LITTLE;
    // EWKB sets flag bits above 16; mask to the geometry type.
    const type = r.uint32(le) & 0xffff;

    if (type === 2) {
      const line = readLine(r, le);
      return line.length ? line : null;
    }
    if (type === 5) {
      const parts = r.uint32(le);
      if (!Number.isFinite(parts) || parts < 0 || parts > 100_000) return null;
      const all: Coord[] = [];
      for (let i = 0; i < parts; i++) {
        const subBo = r.byteOrder();
        const subLe = subBo === LITTLE;
        const t2 = r.uint32(subLe) & 0xffff;
        if (t2 !== 2) break;
        all.push(...readLine(r, subLe));
      }
      return all.length ? all : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** True when the payload looks like WKT text rather than binary WKB. */
function looksLikeWkt(buf: Uint8Array): boolean {
  // Text geometries start with a letter; WKB starts with 0x00 or 0x01.
  const b0 = buf[0];
  return b0 === 0x4c /* L */ || b0 === 0x4d /* M */ || b0 === 0x50 /* P */ ||
    b0 === 0x47 /* G */ || b0 === 0x43 /* C */;
}

/**
 * Decode a fiber geometry into [lon, lat] pairs.
 *
 * Accepts a JS string (what expo-sqlite returns for a TEXT column), a
 * Uint8Array (a real BLOB, or a byte view of WKT), or null. Returns null when
 * the payload is neither WKT nor WKB, or is malformed.
 */
export function decodeLineGeom(
  buf: Uint8Array | string | null | undefined,
): Coord[] | null {
  if (buf == null) return null;

  // expo-sqlite hands back a plain string for a TEXT column; SQLite's type
  // affinity does not coerce it just because the column is declared BLOB.
  if (typeof buf === 'string') {
    if (buf.length < 9) return null;
    const pts = decodeWkt(buf);
    // decodeWkt returns null for unparseable text, but a syntactically valid
    // ring of NaN/blank pairs yields []; treat that as undecodable too so
    // callers never treat an empty geometry as a real one.
    return pts && pts.length ? pts : null;
  }

  if (buf.length < 9) return null;
  if (looksLikeWkt(buf)) {
    // latin-1 keeps every byte; WKT is ASCII in practice.
    let text = '';
    for (let i = 0; i < buf.length; i++) text += String.fromCharCode(buf[i]);
    return decodeWkt(text);
  }
  return decodeWkb(buf);
}

/**
 * Backwards-compatible alias. Prefer `decodeLineGeom`, which also handles WKT
 * text and string input.
 */
export function decodeWkbLine(
  buf: Uint8Array | string | null | undefined,
): Coord[] | null {
  return decodeLineGeom(buf);
}
