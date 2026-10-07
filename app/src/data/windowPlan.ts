/**
 * Pure window-planning for windowed raster reads.
 *
 * Kept free of React Native / expo-file-system imports so it can be unit
 * tested in plain Node — this is the logic that decides how much memory a
 * line-of-sight decode will cost, and it must not be able to allocate
 * unboundedly.
 */

export interface RasterMeta {
  width: number;
  height: number;
  originX: number;
  originY: number;
  resX: number;
  resY: number;
}

export interface WindowPlan {
  /** source pixel window actually read */
  x0: number; y0: number; x1: number; y1: number;
  /** size of the source window */
  w: number; h: number;
  /** decimation applied to the source window */
  stride: number;
  /** size of the retained (post-stride) array */
  outW: number; outH: number;
  /** number of rows decoded per readRasters call */
  rowsPerBand: number;
}

/** Upper bound on cells retained after a windowed decode (~8 MB float32). */
export const MAX_WINDOW_CELLS = 2_000_000;
/** Cap on cells decoded in a single band, bounding peak transient memory. */
export const BAND_CELLS = 1_500_000;

export function pixelIndex(
  m: RasterMeta,
  lat: number,
  lon: number,
): [number, number] | null {
  const col = Math.floor((lon - m.originX) / m.resX);
  const row = Math.floor((lat - m.originY) / m.resY);
  if (row < 0 || col < 0 || row >= m.height || col >= m.width) return null;
  return [row, col];
}

/**
 * Work out the window covering `points`, decimated so the retained array never
 * exceeds `maxCells`.
 *
 * Returns null when no point falls inside the raster.
 */
export function planWindow(
  m: RasterMeta,
  points: { lat: number; lon: number }[],
  padPx = 8,
  maxCells = MAX_WINDOW_CELLS,
  bandCells = BAND_CELLS,
): WindowPlan | null {
  let minRow = Infinity, minCol = Infinity, maxRow = -Infinity, maxCol = -Infinity;
  for (const p of points) {
    const idx = pixelIndex(m, p.lat, p.lon);
    if (!idx) continue;
    minRow = Math.min(minRow, idx[0]); maxRow = Math.max(maxRow, idx[0]);
    minCol = Math.min(minCol, idx[1]); maxCol = Math.max(maxCol, idx[1]);
  }
  if (!Number.isFinite(minRow)) return null;

  const x0 = Math.max(0, minCol - padPx);
  const y0 = Math.max(0, minRow - padPx);
  const x1 = Math.min(m.width, maxCol + padPx + 1);
  const y1 = Math.min(m.height, maxRow + padPx + 1);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;

  const stride = w * h > maxCells
    ? Math.ceil(Math.sqrt((w * h) / maxCells))
    : 1;
  const outW = Math.ceil(w / stride);
  const outH = Math.ceil(h / stride);
  const rowsPerBand = Math.max(1, Math.floor(bandCells / Math.max(1, w)));

  return { x0, y0, x1, y1, w, h, stride, outW, outH, rowsPerBand };
}
