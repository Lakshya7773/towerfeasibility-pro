/**
 * Feature 6 — Soil Analysis.
 *
 * Soil type + foundation suitability come from the pack's soil.geojson
 * (FAO DSMW mapped to Indian soil classes at build time).
 */
import type { SoilResult } from '../models';

export interface SoilPolygon {
  faoCode: string | null;
  soilType: string;
  foundationSuitability: string;
  foundationNote: string;
  /** bbox for a cheap pre-filter */
  minLon: number; minLat: number; maxLon: number; maxLat: number;
  /**
   * Rings grouped by polygon: `polygons[i]` is one Polygon as
   * [outerRing, ...holeRings]. A GeoJSON MultiPolygon has several entries.
   * Keeping the grouping matters — flattening a MultiPolygon into one ring
   * list makes the engine treat sibling polygons as holes and discard valid
   * hits.
   */
  polygons: number[][][][];
}

/** Ray-casting point-in-polygon. */
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function lookupSoil(
  polygons: SoilPolygon[], lat: number, lon: number,
): SoilResult | null {
  for (const p of polygons) {
    if (lon < p.minLon || lon > p.maxLon || lat < p.minLat || lat > p.maxLat) continue;
    for (const poly of p.polygons) {
      const outer = poly[0];
      if (!outer || !outer.length) continue;
      if (!pointInRing(lon, lat, outer)) continue;
      // Ring 0 is the outer boundary; the rest are holes in THIS polygon.
      let inHole = false;
      for (let k = 1; k < poly.length; k++) {
        if (pointInRing(lon, lat, poly[k])) { inHole = true; break; }
      }
      if (inHole) continue;
      return {
        faoCode: p.faoCode,
        soilType: p.soilType,
        foundationSuitability: p.foundationSuitability,
        foundationNote: p.foundationNote,
      };
    }
  }
  return null;
}
