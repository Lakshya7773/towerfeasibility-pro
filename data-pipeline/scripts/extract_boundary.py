#!/usr/bin/env python3
"""
Extract a state polygon for a region by polygonizing the boundary LINES that
the pack's basemap already ships.

The basemap `boundaries` layer stores state/country borders as LineStrings
(kind='region'), not filled polygons. Unioning the lines covering a region and
running shapely's polygonize() reconstructs the enclosed state ring — no
network, and consistent with the geometry the map draws.

Output: data/admin/<region>_boundary.geojson
"""
import argparse
import gzip
import json
import math
import os
import sys

from pmtiles.reader import Reader, MmapSource
import mapbox_vector_tile
from shapely.geometry import shape, mapping, Point, box
from shapely.ops import unary_union, polygonize
from shapely.validation import make_valid
import pyproj

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "data")

REGIONS = {
    "rajasthan": {
        "bbox": (69.4, 23.0, 78.3, 30.3),
        "anchor": (26.9124, 75.7873),   # Jaipur, (lat, lon)
        "area_km2": 342239,
    },
}


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return x, y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="rajasthan", choices=list(REGIONS))
    ap.add_argument("--zoom", type=int, default=7)
    ap.add_argument("--basemap", default=None)
    args = ap.parse_args()

    cfg = REGIONS[args.region]
    bm = args.basemap or os.path.join(DATA, "basemap", f"{args.region}.pmtiles")
    if not os.path.exists(bm):
        print(f"FAIL: basemap not found: {bm}")
        sys.exit(1)

    z = args.zoom
    minx, miny, maxx, maxy = cfg["bbox"]
    x0, y0 = tile_xy(minx, maxy, z)
    x1, y1 = tile_xy(maxx, miny, z)

    lines = []
    n_tiles = 0
    with open(bm, "rb") as f:
        reader = Reader(MmapSource(f))
        for tx in range(x0, x1 + 1):
            for ty in range(y0, y1 + 1):
                data = reader.get(z, tx, ty)
                if not data:
                    continue
                n_tiles += 1
                # MVT payloads are commonly gzip-compressed inside PMTiles.
                if data[:2] == b"\x1f\x8b":
                    try:
                        data = gzip.decompress(data)
                    except Exception:
                        continue
                try:
                    layer = mapbox_vector_tile.decode(data)
                except Exception:
                    continue
                bnd = layer.get("boundaries")
                if not bnd:
                    continue
                for feat in bnd.get("features", []):
                    geom = feat.get("geometry")
                    if not geom:
                        continue
                    try:
                        g = shape(geom)
                    except Exception:
                        continue
                    if g.geom_type in ("LineString", "MultiLineString"):
                        lines.append(g)

    if not lines:
        print("FAIL: no boundary lines found")
        sys.exit(1)

    merged = unary_union(lines)
    print(f"tiles scanned : {n_tiles}")
    print(f"line parts    : {len(lines)}")

    polys = []
    for p in polygonize(merged):
        if not p.is_valid:
            p = make_valid(p)
        for part in (p.geoms if p.geom_type == "GeometryCollection" else [p]):
            if part.geom_type in ("Polygon", "MultiPolygon") and not part.is_empty:
                polys.append(part)
    print(f"polygonized   : {len(polys)} rings")

    anchor = Point(cfg["anchor"][1], cfg["anchor"][0])  # (lon, lat)
    region_box = box(minx, miny, maxx, maxy)
    geod = pyproj.Geod(ellps="WGS84")

    # Candidate: ring containing the anchor and not absurdly larger than the
    # state (the outermost ring would enclose the whole subcontinent).
    best, best_area = None, None
    for p in polys:
        if not p.contains(anchor):
            continue
        area_km2 = abs(geod.geometry_area_perimeter(p)[0]) / 1e6
        if area_km2 <= cfg["area_km2"] * 3:
            if best is None or area_km2 < best_area:
                best, best_area = p, area_km2

    if best is None:
        print("FAIL: no polygon ring contains the anchor within a sane area")
        for p in sorted(polys, key=lambda q: -q.area)[:5]:
            a = abs(geod.geometry_area_perimeter(p)[0]) / 1e6
            print(f"   ring area={a:,.0f} km2 contains_anchor={p.contains(anchor)}")
        sys.exit(1)

    best = best.intersection(region_box)

    out_dir = os.path.join(DATA, "admin")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.region}_boundary.geojson")
    with open(out_path, "w") as f:
        json.dump(
            {"type": "FeatureCollection",
             "features": [{"type": "Feature",
                           "properties": {"region": args.region,
                                          "source": f"basemap boundaries z{z} polygonized"},
                           "geometry": mapping(best)}]},
            f,
        )

    print(f"geometry      : {best.geom_type}")
    print(f"area          : {best_area:,.0f} km2  (Rajasthan is 342,239 km2)")
    print(f"wrote         : {out_path}")


if __name__ == "__main__":
    main()
