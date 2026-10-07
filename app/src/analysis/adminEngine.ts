/**
 * Feature 7 — Administration Boundaries & governing authority.
 */
import type { AdminResult } from '../models';

export interface AdminBoundary {
  state: string;
  district: string | null;
  minLon: number; minLat: number; maxLon: number; maxLat: number;
  rings: number[][][];
}

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

export function lookupAdmin(
  boundaries: AdminBoundary[], lat: number, lon: number,
): AdminResult | null {
  for (const b of boundaries) {
    if (lon < b.minLon || lon > b.maxLon || lat < b.minLat || lat > b.maxLat) continue;
    for (const ring of b.rings) {
      if (pointInRing(lon, lat, ring)) {
        return buildAdminResult(b.state, b.district);
      }
    }
  }
  return null;
}

export function buildAdminResult(state: string, district: string | null): AdminResult {
  return {
    state,
    district,
    governingAuthority: `DoT Licensed Service Area + ${state} State RoW Portal`,
    complianceRequirements: [
      'DoT / WPC site clearance for spectrum use',
      `${state} State Right of Way (RoW) permission`,
      'Local municipal / Gram Panchayat No-Objection Certificate',
      'EMF self-certification and periodic audit (DoT norms)',
      'Structural stability certificate for the tower',
      district ? `District Collector intimation (${district})` : 'District Collector intimation',
    ],
  };
}
