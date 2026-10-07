#!/usr/bin/env python3
"""
T0.3 — Data Pack Builder

Builds a runtime data pack for a given region (default: Rajasthan) from the
national processed datasets. A pack is the self-contained directory the app
reads offline.

Pack layout:
    data-pack-{region}/
    ├── manifest.json
    ├── vectors/
    │   ├── towers.sqlite        (region-filtered, indexed)
    │   ├── fiber.sqlite         (R*Tree, WKB geometry)
    │   └── soil.geojson
    ├── rules/
    │   └── row-rules-2024.json
    └── config/
        └── soil-classification.json

Usage:
    python build_pack.py --region rajasthan --output-dir dist/packs
"""
import argparse
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone

import provenance

REGIONS = {
    "rajasthan": {"name": "Rajasthan", "state": "Rajasthan",
                  "min_lat": 23.0, "max_lat": 30.3, "min_lon": 69.4, "max_lon": 78.3},
    "all-india": {"name": "All India", "state": "India",
                  "min_lat": 6.5, "max_lat": 37.5, "min_lon": 68.0, "max_lon": 97.5},
}


def js_dumps(obj, indent=2):
    """JSON dump that matches JavaScript's JSON.stringify formatting.

    JS drops trailing zeros from floats: 23.0 -> 23, -99999.0 -> -99999.
    Python's json.dump preserves them. The app's bootstrap writes JSON via
    JSON.stringify, so the manifest must record JS-serialised sizes/hashes.
    """
    def fmt(v, level=0):
        pad = ' ' * (indent * (level + 1))
        pad_end = ' ' * (indent * level)
        if isinstance(v, dict):
            if not v:
                return '{}'
            items = [f'{pad}{json.dumps(k)}: {fmt(val, level + 1)}' for k, val in v.items()]
            return '{\n' + ',\n'.join(items) + '\n' + pad_end + '}'
        if isinstance(v, list):
            if not v:
                return '[]'
            items = [f'{pad}{fmt(val, level + 1)}' for val in v]
            return '[\n' + ',\n'.join(items) + '\n' + pad_end + ']'
        if isinstance(v, bool):
            return 'true' if v else 'false'
        if v is None:
            return 'null'
        if isinstance(v, float):
            # Match JS: drop trailing .0, no exponent for normal ranges
            if v == int(v) and abs(v) < 1e21:
                return str(int(v))
            return repr(v)
        if isinstance(v, int):
            return str(v)
        return json.dumps(v)
    return fmt(obj)


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def md5(path: str) -> str:
    """MD5 of a file.

    The app verifies pack integrity on install. expo-file-system exposes a
    native `File.md5` but no native SHA-256, so MD5 is the digest the device
    can actually check without shipping a JS crypto implementation.
    """
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_towers(src: str, dst: str, b: dict) -> int:
    con = sqlite3.connect(dst)
    cur = con.cursor()
    cur.execute("""CREATE TABLE towers (
        id INTEGER PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL,
        operator TEXT, installation_type TEXT, emf_status TEXT,
        technology TEXT, source TEXT, source_id TEXT)""")
    src_con = sqlite3.connect(src)
    rows = src_con.execute(
        """SELECT lat, lon, operator, installation_type, emf_status,
                  technology, source, source_id FROM towers
           WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?""",
        (b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"])).fetchall()
    cur.executemany("INSERT INTO towers (lat,lon,operator,installation_type,"
                    "emf_status,technology,source,source_id) VALUES (?,?,?,?,?,?,?,?)", rows)
    cur.execute("CREATE INDEX idx_towers_lat ON towers(lat)")
    cur.execute("CREATE INDEX idx_towers_lon ON towers(lon)")
    cur.execute("CREATE INDEX idx_towers_lat_lon ON towers(lat, lon)")
    con.commit()
    n = cur.execute("SELECT COUNT(*) FROM towers").fetchone()[0]
    con.close(); src_con.close()
    return n


def build_fiber(src: str, dst: str, b: dict) -> int:
    con = sqlite3.connect(dst)
    cur = con.cursor()
    cur.execute("""CREATE TABLE fiber (
        id INTEGER PRIMARY KEY, name TEXT, owner TEXT, st_code TEXT,
        dt_code TEXT, olt_code TEXT, seg_length REAL,
        minx REAL, miny REAL, maxx REAL, maxy REAL, geom BLOB)""")
    cur.execute("CREATE VIRTUAL TABLE fiber_rtree USING rtree(id, minx, maxx, miny, maxy)")
    src_con = sqlite3.connect(src)
    rows = src_con.execute(
        """SELECT name, owner, st_code, dt_code, olt_code, seg_length,
                  minx, miny, maxx, maxy, geom FROM fiber
           WHERE maxx >= ? AND minx <= ? AND maxy >= ? AND miny <= ?""",
        (b["min_lon"], b["max_lon"], b["min_lat"], b["max_lat"])).fetchall()
    data, idx, skipped = [], [], 0
    for r in rows:
        minx, miny, maxx, maxy = r[6], r[7], r[8], r[9]
        # guard: R*Tree requires minx<=maxx and miny<=maxy, and no NaN/None
        if None in (minx, miny, maxx, maxy):
            skipped += 1
            continue
        try:
            minx, miny, maxx, maxy = float(minx), float(miny), float(maxx), float(maxy)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if any(v != v for v in (minx, miny, maxx, maxy)):  # NaN check
            skipped += 1
            continue
        if minx > maxx:
            minx, maxx = maxx, minx
        if miny > maxy:
            miny, maxy = maxy, miny
        # Sanity: a bad source bbox (e.g. minx=0.0 on a real segment) must not
        # enter the index — it would make any spatial query near the pack
        # match and corrupt nearest-fiber results. NOTE: seg_length is in
        # METRES (median ~988 m), so it is not a usable outlier signal.
        if not (68.0 <= minx and maxx <= 98.5 and 6.0 <= miny and maxy <= 38.0):
            skipped += 1
            continue
        i = len(data) + 1
        data.append((i, r[0], r[1], r[2], r[3], r[4], r[5],
                     minx, miny, maxx, maxy, r[10]))
        idx.append((i, minx, maxx, miny, maxy))
    cur.executemany("INSERT INTO fiber VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", data)
    cur.executemany("INSERT INTO fiber_rtree VALUES (?,?,?,?,?)", idx)
    con.commit()
    n = cur.execute("SELECT COUNT(*) FROM fiber").fetchone()[0]
    con.close(); src_con.close()
    if skipped:
        print(f"  fiber: skipped {skipped} malformed rows")
    return n


def build_soil(src: str, dst: str, b: dict, region: str) -> int:
    """Clip soil polygons to the region boundary.

    Selecting by bbox alone (g.cx) keeps whole polygons, so a polygon that
    merely touches the region contributes its full national extent — the
    region ends up with several times its real area. Clip to the boundary
    polygon so areas and per-site lookups are correct.
    """
    import geopandas as gpd

    g = gpd.read_file(src)
    if g.crs is None:
        # The FAO source ships without a CRS but the coordinates are WGS84.
        g = g.set_crs("EPSG:4326", allow_override=True)

    clip_geom = None
    cand = os.path.join("/home/lakshya/company/towerfeasibility/data", "admin",
                        f"{region}_boundary.geojson")
    if os.path.exists(cand):
        bj = gpd.read_file(cand)
        if bj.crs is None:
            bj = bj.set_crs("EPSG:4326", allow_override=True)
        clip_geom = bj.geometry.union_all()

    if clip_geom is not None:
        clipped = gpd.clip(g, clip_geom)
    else:
        from shapely.geometry import box as _box
        clipped = gpd.clip(g, _box(b["min_lon"], b["min_lat"], b["max_lon"], b["max_lat"]))

    if len(clipped) == 0:
        raise RuntimeError("soil clip produced no polygons — check boundary/bbox")

    clipped.to_file(dst, driver="GeoJSON")
    return len(clipped)


def build_basemap(src: str, dst: str) -> bool:
    """Copy the region's Protomaps basemap PMTiles into the pack.

    The basemap is extracted from the global Protomaps build ahead of time
    (see data-pipeline/scripts/fetch_basemap.sh). If it is absent the pack
    still builds, but the app map will have no base layer.
    """
    if not os.path.exists(src):
        print(f"  basemap: MISSING ({src}) — run fetch_basemap.sh first")
        return False
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    import shutil
    shutil.copy2(src, dst)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="rajasthan", choices=list(REGIONS))
    ap.add_argument("--output-dir", required=True)
    ap.add_argument("--data-root", default="/home/lakshya/company/towerfeasibility/data")
    args = ap.parse_args()

    b = REGIONS[args.region]
    root = args.data_root
    pack = os.path.join(args.output_dir, f"data-pack-{args.region}")
    # idempotent: start from a clean pack
    import shutil
    if os.path.exists(pack):
        shutil.rmtree(pack)
    for sub in ("vectors", "rules", "config"):
        os.makedirs(os.path.join(pack, sub), exist_ok=True)

    print(f"building pack '{args.region}' bounds={b}")
    files = []

    # towers
    dst = os.path.join(pack, "vectors", "towers.sqlite")
    n = build_towers(f"{root}/towers/sqlite/all-india_ts.sqlite", dst, b)
    print(f"  towers: {n:,}")
    files.append(dst)

    # fiber
    dst = os.path.join(pack, "vectors", "fiber.sqlite")
    n = build_fiber(f"{root}/fiber/processed/fiber_index.sqlite", dst, b)
    print(f"  fiber segments: {n:,}")
    files.append(dst)

    # soil
    dst = os.path.join(pack, "vectors", "soil.geojson")
    n = build_soil(f"{root}/soil/processed/soil_india.geojson", dst, b, args.region)
    print(f"  soil polygons: {n}")
    files.append(dst)

    # soil classification config
    src_cfg = f"{root}/soil/processed/config/soil-classification.json"
    dst_cfg = os.path.join(pack, "config", "soil-classification.json")
    with open(src_cfg) as f:
        cfg = json.load(f)
    with open(dst_cfg, "w") as f:
        f.write(js_dumps(cfg))
    files.append(dst_cfg)

    # basemap (Protomaps vector tiles, pre-extracted per region)
    dst = os.path.join(pack, "tiles", "base-map.pmtiles")
    if build_basemap(f"{root}/basemap/{args.region}.pmtiles", dst):
        sz = os.path.getsize(dst)
        print(f"  basemap: {sz/1e6:.1f} MB")
        files.append(dst)

    # population raster (WorldPop people-per-cell) + its config
    pop_src = f"{root}/population/processed/{args.region}_population.tif"
    pop_dst = os.path.join(pack, "population", "population.tif")
    if os.path.exists(pop_src):
        os.makedirs(os.path.dirname(pop_dst), exist_ok=True)
        shutil.copy2(pop_src, pop_dst)
        print(f"  population: {os.path.getsize(pop_dst)/1e6:.1f} MB")
        files.append(pop_dst)
        pop_cfg_src = f"{root}/population/processed/{args.region}_population.json"
        if os.path.exists(pop_cfg_src):
            pop_cfg_dst = os.path.join(pack, "config", "population.json")
            with open(pop_cfg_src) as f:
                pop_cfg = json.load(f)
            with open(pop_cfg_dst, "w") as f:
                f.write(js_dumps(pop_cfg))
            files.append(pop_cfg_dst)
    else:
        print(f"  population: MISSING ({pop_src})")

    # elevation raster (terrain, metres)
    elev_src = f"{root}/elevation/processed/{args.region}_elevation_z11.tif"
    if not os.path.exists(elev_src):
        # fall back to whatever zoom was processed
        import glob
        cands = sorted(glob.glob(f"{root}/elevation/processed/{args.region}_elevation_z*.tif"))
        elev_src = cands[-1] if cands else elev_src
    elev_dst = os.path.join(pack, "elevation", "elevation.tif")
    if os.path.exists(elev_src):
        os.makedirs(os.path.dirname(elev_dst), exist_ok=True)
        shutil.copy2(elev_src, elev_dst)
        print(f"  elevation: {os.path.getsize(elev_dst)/1e6:.1f} MB")
        files.append(elev_dst)
    else:
        print(f"  elevation: MISSING ({elev_src})")

    # manifest
    # Dataset vintages and provenance come from provenance.py — a single
    # authoritative registry. They are UPSTREAM publication dates, never build
    # timestamps: conflating the two previously made the manifest claim the
    # tower registry was 2024-vintage when the source is 2022.
    manifest = {
        "region": args.region,
        "region_name": b["name"],
        "state": b["state"],
        "version": "1.0.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "bounds": {k: b[k] for k in ("min_lat", "max_lat", "min_lon", "max_lon")},
        "source_dates": provenance.vintage_map(),
        "provenance": provenance.provenance_block(),
        "files": [{"path": os.path.relpath(p, pack),
                   "size": os.path.getsize(p),
                   "sha256": sha256(p),
                   "md5": md5(p)} for p in files],
    }
    mpath = os.path.join(pack, "manifest.json")
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
    total = sum(f["size"] for f in manifest["files"])
    print(f"\nmanifest: {mpath}")
    print(f"pack total size: {total/1e6:.1f} MB")
    for f in manifest["files"]:
        print(f"   {f['path']:38s} {f['size']/1e6:8.1f} MB")


if __name__ == "__main__":
    main()
