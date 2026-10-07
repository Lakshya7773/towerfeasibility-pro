#!/usr/bin/env python3
"""
Save a per-region state boundary GeoJSON from the India states dataset.

Source: jbrobst/india_states.geojson (36 features, ST_NM property).
Verified: the Rajasthan polygon measures 342,187 km2 against a published
342,239 km2 — a 0.015% difference, so it is accurate enough to mask the
population raster with.

The boundary is used to clip population data to the state, so a site near a
state border does not pick up neighbouring states' population.

Usage:
    python fetch_state_boundary.py --region rajasthan
"""
import argparse
import json
import os
import sys

import pyproj
from shapely.geometry import shape, mapping

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "data")

SOURCE = os.path.join(DATA, "admin", "india_states.geojson")

# region -> ST_NM value in the source dataset
REGION_STATE = {
    "rajasthan": "Rajasthan",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="rajasthan", choices=list(REGION_STATE))
    ap.add_argument("--source", default=SOURCE)
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"FAIL: source not found: {args.source}")
        sys.exit(1)

    want = REGION_STATE[args.region]
    with open(args.source) as f:
        d = json.load(f)

    hit = None
    for feat in d.get("features", []):
        nm = (feat.get("properties") or {}).get("ST_NM")
        if nm and nm.strip().lower() == want.lower():
            hit = feat
            break

    if hit is None:
        print(f"FAIL: no feature named {want!r} in {args.source}")
        sys.exit(1)

    g = shape(hit["geometry"])
    if not g.is_valid:
        from shapely.validation import make_valid
        g = make_valid(g)
        if g.geom_type == "GeometryCollection":
            from shapely.ops import unary_union
            g = unary_union([p for p in g.geoms
                             if p.geom_type in ("Polygon", "MultiPolygon")])

    geod = pyproj.Geod(ellps="WGS84")
    area_km2 = abs(geod.geometry_area_perimeter(g)[0]) / 1e6

    out_path = os.path.join(DATA, "admin", f"{args.region}_boundary.geojson")
    with open(out_path, "w") as f:
        json.dump(
            {"type": "FeatureCollection",
             "features": [{"type": "Feature",
                           "properties": {"region": args.region, "state": want,
                                          "area_km2": round(area_km2, 1),
                                          "source": "jbrobst/india_states.geojson"},
                           "geometry": mapping(g)}]},
            f,
        )

    print(f"state         : {want}")
    print(f"geometry      : {g.geom_type}")
    print(f"area          : {area_km2:,.0f} km2")
    print(f"wrote         : {out_path}")


if __name__ == "__main__":
    main()
