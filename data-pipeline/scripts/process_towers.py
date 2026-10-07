#!/usr/bin/env python3
"""
T0.2.2 — Tower Data Processor

Converts the acquired tower Parquet files (Tarang Sanchar / NIC) into the
per-region SQLite format the app reads at runtime, with lat/lon spatial indexes.

Input parquet schema (from ramSeraph/indian_communications):
    TS:  site_id, type (Ground/Roof/Wall), valid, geometry (WKB), bbox{xmin,ymin,xmax,ymax}
    NIC: objectid_1, objectid, geometry (WKB), bbox{...}

Output SQLite schema (per blueprint T0.2.2):
    towers(id, lat, lon, operator, installation_type, emf_status, technology)
    + indexes on lat, lon, (lat,lon)

Usage:
    python process_towers.py --input <parquet> --output-dir <dir> [--source ts|nic]
"""
import argparse
import os
import sqlite3
import sys

import pandas as pd


def load_towers(path: str, source: str) -> pd.DataFrame:
    df = pd.read_parquet(path)
    # bbox column carries the point coords as a struct/dict
    bb = df["bbox"]
    if isinstance(bb, pd.Series) and bb.dtype == object:
        lat = bb.apply(lambda d: d.get("ymin") if isinstance(d, dict) else None)
        lon = bb.apply(lambda d: d.get("xmin") if isinstance(d, dict) else None)
    else:
        lat = bb.apply(lambda d: d["ymin"] if isinstance(d, dict) else None)
        lon = bb.apply(lambda d: d["xmin"] if isinstance(d, dict) else None)

    out = pd.DataFrame({"lat": lat, "lon": lon})

    if source == "ts":
        out["operator"] = None                     # not published (PII-stripped)
        out["installation_type"] = df.get("type")  # Ground / Roof / Wall
        out["emf_status"] = df.get("valid")
        out["technology"] = None
        out["source_id"] = df.get("site_id")
    else:
        out["operator"] = None
        out["installation_type"] = None
        out["emf_status"] = None
        out["technology"] = None
        out["source_id"] = df.get("objectid")

    out["source"] = source
    out = out.dropna(subset=["lat", "lon"])
    out = out[(out.lat.between(-90, 90)) & (out.lon.between(-180, 180))]
    return out.reset_index(drop=True)


def write_sqlite(df: pd.DataFrame, out_path: str) -> int:
    if os.path.exists(out_path):
        os.remove(out_path)
    con = sqlite3.connect(out_path)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE towers (
            id INTEGER PRIMARY KEY,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            operator TEXT,
            installation_type TEXT,
            emf_status TEXT,
            technology TEXT,
            source TEXT,
            source_id TEXT
        )
    """)
    cur.executemany(
        "INSERT INTO towers (lat, lon, operator, installation_type, emf_status, "
        "technology, source, source_id) VALUES (?,?,?,?,?,?,?,?)",
        df[["lat", "lon", "operator", "installation_type", "emf_status",
            "technology", "source", "source_id"]].itertuples(index=False, name=None),
    )
    cur.execute("CREATE INDEX idx_towers_lat ON towers(lat)")
    cur.execute("CREATE INDEX idx_towers_lon ON towers(lon)")
    cur.execute("CREATE INDEX idx_towers_lat_lon ON towers(lat, lon)")
    con.commit()
    n = cur.execute("SELECT COUNT(*) FROM towers").fetchone()[0]
    con.close()
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="tower parquet file")
    ap.add_argument("--output-dir", required=True)
    ap.add_argument("--source", default="ts", choices=["ts", "nic"])
    ap.add_argument("--name", default=None, help="output basename (default: all-india)")
    args = ap.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    name = args.name or "all-india"

    df = load_towers(args.input, args.source)
    print(f"[{args.source}] parsed {len(df):,} towers")

    out_path = os.path.join(args.output_dir, f"{name}_{args.source}.sqlite")
    n = write_sqlite(df, out_path)
    size = os.path.getsize(out_path) / 1e6
    print(f"[{args.source}] wrote {out_path}  ({n:,} rows, {size:.1f} MB)")

    # quick spatial query sanity check (Ajmer bbox)
    con = sqlite3.connect(out_path)
    q = ("SELECT COUNT(*) FROM towers WHERE lat BETWEEN 26.0 AND 27.0 "
         "AND lon BETWEEN 74.0 AND 75.0")
    print(f"[{args.source}] towers in Ajmer bbox: {con.execute(q).fetchone()[0]:,}")
    con.close()


if __name__ == "__main__":
    main()
