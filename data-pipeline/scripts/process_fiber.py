#!/usr/bin/env python3
"""
T0.2.3 (fiber part) — Fiber Data Processor

Turns the national BBNL/BharatNet OFC parquet into runtime artifacts:
  1. fiber_india.pmtiles      - vector tile layer for the map
  2. fiber_index.sqlite       - R*Tree spatial index for fast
                                "distance to nearest fiber route" offline queries

Runtime query (Feature 3): given a site lat/lon, find the nearest OFC segment
without scanning the whole national dataset.

Usage:
    python process_fiber.py --input <parquet> --output-dir <dir>
"""
import argparse
import os
import sqlite3
import subprocess
import sys

import pandas as pd
from shapely import wkb
from shapely.geometry import mapping

TIPPECANOE = os.path.expanduser("~/.local/tippecanoe/usr/bin/tippecanoe")


def load_fiber(path: str) -> pd.DataFrame:
    df = pd.read_parquet(path)
    print(f"  raw rows: {len(df):,}  cols: {list(df.columns)}")
    return df


def to_geojsonl(df: pd.DataFrame, out_path: str) -> int:
    """Write GeoJSONL for tippecanoe, keeping useful attributes."""
    import json
    n = 0
    with open(out_path, "w") as f:
        for rec in df.itertuples(index=False):
            d = rec._asdict() if hasattr(rec, "_asdict") else dict(zip(df.columns, rec))
            geom = d.get("geometry")
            if geom is None:
                continue
            try:
                g = wkb.loads(geom) if isinstance(geom, (bytes, bytearray)) else geom
            except Exception:
                continue
            if g.is_empty:
                continue
            props = {k: (v if isinstance(v, (str, int, float, bool)) or v is None else str(v))
                     for k, v in d.items() if k != "geometry"}
            f.write(json.dumps({"type": "Feature", "geometry": mapping(g),
                                "properties": props}, default=str) + "\n")
            n += 1
    return n


def build_pmtiles(geojsonl: str, out_pmtiles: str, layer: str) -> bool:
    if not os.path.exists(TIPPECANOE):
        print(f"  !! tippecanoe not found at {TIPPECANOE}; skipping tiles")
        return False
    cmd = [TIPPECANOE, "-o", out_pmtiles, "-zg", "--drop-densest-as-needed",
           "--force", "--layer", layer, geojsonl]
    print(f"  running tippecanoe -> {out_pmtiles}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("  tippecanoe failed:", r.stderr[-500:])
        return False
    return True


def build_rtree(df: pd.DataFrame, out_sqlite: str) -> int:
    """SQLite with R*Tree index over fiber segment bounding boxes."""
    if os.path.exists(out_sqlite):
        os.remove(out_sqlite)
    con = sqlite3.connect(out_sqlite)
    cur = con.cursor()
    cur.execute("""CREATE TABLE fiber (
        id INTEGER PRIMARY KEY, name TEXT, owner TEXT,
        st_code TEXT, dt_code TEXT, olt_code TEXT, seg_length REAL,
        minx REAL, miny REAL, maxx REAL, maxy REAL, geom TEXT)""")
    cur.execute("""CREATE VIRTUAL TABLE fiber_rtree USING rtree(
        id, minx, maxx, miny, maxy)""")

    rows, idx = [], []
    for i, rec in enumerate(df.itertuples(index=False), start=1):
        d = dict(zip(df.columns, rec))
        geom = d.get("geometry")
        if geom is None:
            continue
        try:
            g = wkb.loads(geom) if isinstance(geom, (bytes, bytearray)) else geom
        except Exception:
            continue
        if g.is_empty:
            continue
        minx, miny, maxx, maxy = g.bounds
        def s(v):
            return None if v is None else str(v)
        rows.append((i, s(d.get("name")), s(d.get("owner")), s(d.get("st_code")),
                     s(d.get("dt_code")), s(d.get("olt_code")),
                     d.get("seg_length"), minx, miny, maxx, maxy, g.wkt))
        idx.append((i, minx, maxx, miny, maxy))

    cur.executemany("INSERT INTO fiber VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    cur.executemany("INSERT INTO fiber_rtree VALUES (?,?,?,?,?)", idx)
    con.commit()
    n = cur.execute("SELECT COUNT(*) FROM fiber").fetchone()[0]
    con.close()
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output-dir", required=True)
    ap.add_argument("--skip-tiles", action="store_true")
    args = ap.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    df = load_fiber(args.input)

    # GeoJSONL (for tiles)
    gjl = os.path.join(args.output_dir, "fiber_india.geojsonl")
    n = to_geojsonl(df, gjl)
    print(f"  wrote {n:,} features -> {gjl} ({os.path.getsize(gjl)/1e6:.1f} MB)")

    if not args.skip_tiles:
        build_pmtiles(gjl, os.path.join(args.output_dir, "fiber_india.pmtiles"), "fiber")

    # R*Tree index for offline nearest queries
    sq = os.path.join(args.output_dir, "fiber_index.sqlite")
    m = build_rtree(df, sq)
    print(f"  wrote {sq} ({m:,} segments, {os.path.getsize(sq)/1e6:.1f} MB)")

    # sanity: nearest fiber to Ajmer
    con = sqlite3.connect(sq)
    q = """SELECT f.name, f.owner, f.st_code, f.dt_code, f.seg_length
           FROM fiber_rtree r JOIN fiber f ON f.id=r.id
           WHERE r.minx <= 75.9 AND r.maxx >= 75.7
             AND r.miny <= 27.0 AND r.maxy >= 26.8
           LIMIT 3"""
    try:
        for row in con.execute(q):
            print("  nearest fiber near Ajmer:", row)
    except Exception as e:
        print("  query error:", e)
    con.close()


if __name__ == "__main__":
    main()
