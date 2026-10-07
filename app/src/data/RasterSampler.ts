/**
 * GeoTIFF-backed samplers for the elevation and population rasters.
 *
 * The pack ships two rasters:
 *   population/population.tif   WorldPop 1 km, people per cell
 *   elevation/elevation.tif     terrain, metres
 *
 * Both are read with the `geotiff` package.
 *
 * Population is small (Rajasthan 1068x876) so it is decoded once into a typed
 * array; per-sample lookup is then a plain index.
 *
 * Elevation at z11 is 13824x12800 (177 M cells) — far too large to decode on a
 * phone. The analysis engines, however, only need a thin corridor along the
 * LoS path, so we decode ONE window covering the path's bounding box and
 * sample that synchronously. Peak memory is proportional to the corridor, not
 * the region.
 */
import { File } from 'expo-file-system';
import { fromArrayBuffer, GeoTIFFImage, GeoTIFF } from 'geotiff';
import { packDir } from './DataPackManager';
import {
  planWindow, pixelIndex as planPixelIndex,
  MAX_WINDOW_CELLS, BAND_CELLS,
} from './windowPlan';

export interface RasterSampler {
  sample: (lat: number, lon: number) => number | null;
  width: number;
  height: number;
  bounds: [number, number, number, number]; // west, south, east, north
  /** native cell size in degrees, so callers can walk the real grid */
  cellDegLat: number;
  cellDegLon: number;
  /**
   * North-west corner of the raster in degrees. Callers that walk the grid
   * (rather than sampling point-by-point) need this: assuming an origin of
   * (0°, 0°) offsets every cell centre by the raster's true origin.
   */
  originLat?: number;
  originLon?: number;
}

/** A windowed raster that can be sampled synchronously after load. */
export interface WindowSampler extends RasterSampler {
  /** the window actually decoded, in source pixel coords */
  window: [number, number, number, number];
}

interface GeoMeta {
  width: number;
  height: number;
  bounds: [number, number, number, number];
  originX: number;
  originY: number;
  resX: number;
  resY: number;
  nodata: number | null;
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  const f = new File(uri);
  if (!f.exists) throw new Error(`raster not found: ${uri}`);
  return f.arrayBuffer();
}

function metaFromImage(img: GeoTIFFImage, nodata: number | null): GeoMeta {
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const res = img.getResolution();
  const origin = img.getOrigin();
  return {
    width: img.getWidth(),
    height: img.getHeight(),
    bounds: [minX, minY, maxX, maxY],
    originX: origin[0],
    originY: origin[1],
    resX: res[0],
    resY: res[1],
    nodata,
  };
}

/** Pixel row/col for a lat/lon, or null if outside the raster. */
function pixelIndex(meta: GeoMeta, lat: number, lon: number): [number, number] | null {
  const col = Math.floor((lon - meta.originX) / meta.resX);
  const row = Math.floor((lat - meta.originY) / meta.resY);
  if (row < 0 || col < 0 || row >= meta.height || col >= meta.width) return null;
  return [row, col];
}

async function openImage(uri: string): Promise<{ img: GeoTIFFImage; tiff: GeoTIFF }> {
  const buf = await readBytes(uri);
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  return { img, tiff };
}

function nodataOf(img: GeoTIFFImage, fallback: number | null): number | null {
  const v = img.getGDALNoData();
  return v != null ? Number(v) : fallback;
}

/**
 * Decode an entire raster into memory. Use for small rasters (population).
 */
export async function loadRaster(
  uri: string,
  nodataOverride?: number,
): Promise<RasterSampler | null> {
  try {
    const { img } = await openImage(uri);
    const nodata = nodataOverride ?? nodataOf(img, null);
    const meta = metaFromImage(img, nodata);
    const rasters = await img.readRasters({ interleave: false });
    const band = rasters[0] as ArrayLike<number>;

    const sample = (lat: number, lon: number): number | null => {
      const idx = pixelIndex(meta, lat, lon);
      if (!idx) return null;
      const v = band[idx[0] * meta.width + idx[1]];
      if (v == null || !Number.isFinite(v)) return null;
      if (nodata != null && v === nodata) return null;
      return v;
    };

    return {
      sample,
      width: meta.width,
      height: meta.height,
      bounds: meta.bounds,
      cellDegLat: Math.abs(meta.resY),
      cellDegLon: Math.abs(meta.resX),
      originLat: meta.originY,
      originLon: meta.originX,
    };
  } catch (e) {
    console.warn('loadRaster failed', uri, e);
    return null;
  }
}

/**
 * Decode only the window covering the given points, and return a sampler over
 * it. Used for elevation, where decoding the whole region is not feasible.
 *
 * `padPx` widens the window so sampling near the corridor edge still resolves.
 * Very large windows are decoded in bands and strided down to MAX_WINDOW_CELLS
 * (see windowPlan.ts) so peak memory does not scale with path length.
 */
export async function loadWindowSampler(
  uri: string,
  points: { lat: number; lon: number }[],
  padPx = 8,
): Promise<WindowSampler | null> {
  try {
    const { img } = await openImage(uri);
    const nodata = nodataOf(img, -32768);
    const meta = metaFromImage(img, nodata);

    const plan = planWindow(
      {
        width: meta.width, height: meta.height,
        originX: meta.originX, originY: meta.originY,
        resX: meta.resX, resY: meta.resY,
      },
      points,
      padPx,
    );
    if (!plan) return null;

    const { x0, y0, w, h, stride, outW, outH, rowsPerBand } = plan;
    const band = new Float32Array(outW * outH).fill(NaN);

    // Decode in row-bands; within each band keep every `stride`-th cell.
    for (let by = 0; by < h; by += rowsPerBand) {
      const bh = Math.min(rowsPerBand, h - by);
      const rasters = await img.readRasters({
        window: [x0, y0 + by, x0 + w, y0 + by + bh],
        interleave: false,
        width: w,
        height: bh,
      } as any);
      const src = rasters[0] as unknown as ArrayLike<number>;
      for (let ly = 0; ly < bh; ly++) {
        // Stride on the ABSOLUTE source row: bands start at a non-zero offset,
        // so `ly % stride` would make every band rewrite output rows 0..n.
        const absRow = by + ly;
        if (absRow % stride !== 0) continue;
        const oy = absRow / stride;
        if (oy >= outH) continue;
        const srcRow = ly * w;
        const dstRow = oy * outW;
        for (let lx = 0; lx < w; lx += stride) {
          const ox = lx / stride;
          if (ox >= outW) break;
          band[dstRow + ox] = src[srcRow + lx];
        }
      }
    }

    const sample = (lat: number, lon: number): number | null => {
      const idx = pixelIndex(meta, lat, lon);
      if (!idx) return null;
      const lx = Math.floor((idx[1] - x0) / stride);
      const ly = Math.floor((idx[0] - y0) / stride);
      if (lx < 0 || ly < 0 || lx >= outW || ly >= outH) return null;
      const v = band[ly * outW + lx];
      if (v == null || !Number.isFinite(v) || v === nodata) return null;
      return v;
    };

    return {
      sample,
      width: outW,
      height: outH,
      bounds: meta.bounds,
      window: [x0, y0, plan.x1, plan.y1],
      cellDegLat: Math.abs(meta.resY) * stride,
      cellDegLon: Math.abs(meta.resX) * stride,
      originLat: meta.originY,
      originLon: meta.originX,
    };
  } catch (e) {
    console.warn('loadWindowSampler failed', uri, e);
    return null;
  }
}

/** Paths inside an installed pack. */
export function packPopulationPath(region: string): string {
  return `${packDir(region).uri}/population/population.tif`;
}

export function packElevationPath(region: string): string {
  return `${packDir(region).uri}/elevation/elevation.tif`;
}

export function packPopulationConfigPath(region: string): string {
  return `${packDir(region).uri}/config/population.json`;
}
