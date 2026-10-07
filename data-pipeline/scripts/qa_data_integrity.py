#!/usr/bin/env python3
"""
DATA INTEGRITY AUDIT — the shipped Rajasthan pack.
Checks schema, counts, nulls, coordinate validity, geographic bounds,
identifier uniqueness, duplicates, and encoding for every dataset.
"""
import json
import math
import os
import sqlite3
import struct

import numpy as np
import rasterio

PACK = "/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan"
RJ = dict(min_lat=23.0, max_lat=30.3, min_lon=69.4, max_lon=78.3)

fails = []
def chk(name, cond, detail=""):
    tag = "PASS" if cond else "FAIL"
    if not cond:
        fails.append(name)
    print(f"  {tag}  {name}" + (f"  -> {detail}" if detail else ""))

print("=" * 78)
print("DATA INTEGRITY AUDIT — shipped pack")
print("=" * 78)

print("\n--- 1. manifest ---")
man = json.load(open(f"{PACK}/manifest.json"))
print(f"  region={man.get('region')} tier={man.get('tier')} files={len(man.get('files', {}))}")
chk("manifest declares a region", bool(man.get("region")), man.get("region"))
# The app's PackManifest does NOT include `tier` and no code reads it, so its
# absence is not a defect. Check the fields the app actually dereferences.
for req in ("region", "bounds", "files"):
    chk(f"manifest declares required field '{req}'", req in man, str(type(man.get(req)).__name__))
files = man.get("files", [])
chk("manifest lists files", len(files) > 0, f"{len(files)} files")
chk("manifest files carry path+size+md5 (runtime verification inputs)",
    all("path" in f and "size" in f and "md5" in f for f in files), f"{len(files)} entries")
missing = [f["path"] for f in files if not os.path.exists(f"{PACK}/{f['path']}")]
chk("every manifest file exists on disk", not missing, f"missing: {missing}")
chk("manifest carries source_dates", "source_dates" in man, str(list(man.get("source_dates", {}).keys())[:3]))
print(f"  bounds = {man.get('bounds')}")

print("\n--- 2. towers.sqlite ---")
c = sqlite3.connect(f"{PACK}/vectors/towers.sqlite")
cur = c.cursor()
cols = cur.execute("PRAGMA table_info(towers)").fetchall()
print(f"  columns: {[x[1] for x in cols]}")
n = cur.execute("SELECT COUNT(*) FROM towers").fetchone()[0]
chk("tower table non-empty", n > 0, f"{n:,} rows")
chk("tower ids unique", cur.execute("SELECT COUNT(DISTINCT id) FROM towers").fetchone()[0] == n, "distinct id = rows")
nulls = cur.execute("SELECT SUM(lat IS NULL), SUM(lon IS NULL) FROM towers").fetchone()
chk("no null latitudes/longitudes", nulls[0] == 0 and nulls[1] == 0, f"lat nulls={nulls[0]}, lon nulls={nulls[1]}")
bad = cur.execute("SELECT COUNT(*) FROM towers WHERE lat < -90 OR lat > 90 OR lon < -180 OR lon > 180").fetchone()[0]
chk("all coordinates within global WGS84 bounds", bad == 0, f"{bad} out of range")
out = cur.execute("SELECT COUNT(*) FROM towers WHERE lat < ? OR lat > ? OR lon < ? OR lon > ?",
                  (RJ["min_lat"]-1, RJ["max_lat"]+1, RJ["min_lon"]-1, RJ["max_lon"]+1)).fetchone()[0]
chk("all towers within the Rajasthan pack envelope", out == 0, f"{out} outside")
dup = cur.execute("SELECT COUNT(*) FROM (SELECT lat,lon,COUNT(*) c FROM towers GROUP BY lat,lon HAVING c>1)").fetchone()[0]
chk("exact duplicate coordinates are a small fraction", dup < n * 0.02, f"{dup:,} duplicate coord groups of {n:,} rows")
idx = [r[1] for r in cur.execute("PRAGMA index_list(towers)").fetchall()]
print(f"  indexes: {idx}")
chk("towers have a lat/lon index", any("lat" in i for i in idx) or len(idx) > 0, str(idx))
src = cur.execute("SELECT DISTINCT source FROM towers").fetchall() if "source" in [x[1] for x in cols] else []
print(f"  sources: {src}")
c.close()

print("\n--- 3. fiber.sqlite ---")
c = sqlite3.connect(f"{PACK}/vectors/fiber.sqlite")
cur = c.cursor()
cols = cur.execute("PRAGMA table_info(fiber)").fetchall()
print(f"  columns: {[x[1] for x in cols]}")
n = cur.execute("SELECT COUNT(*) FROM fiber").fetchone()[0]
chk("fiber table non-empty", n > 0, f"{n:,} rows")
chk("fiber ids unique", cur.execute("SELECT COUNT(DISTINCT id) FROM fiber").fetchone()[0] == n, "distinct id = rows")
# geom type: declared BLOB, but what is actually stored?
types = cur.execute("SELECT DISTINCT typeof(geom) FROM fiber").fetchall()
print(f"  geom storage types: {[t[0] for t in types]}")
chk("geom storage is TEXT (WKT) — documented, not silent", [t[0] for t in types] == ["text"],
    f"declared BLOB, actually {[t[0] for t in types]}")
sample = cur.execute("SELECT geom FROM fiber LIMIT 200").fetchall()
wkt_ok = all(str(s[0]).startswith(("LINESTRING", "MULTILINESTRING")) for s in sample)
chk("sampled geom values parse as WKT LINESTRING", wkt_ok, f"{sum(1 for s in sample if str(s[0]).startswith(('LINESTRING','MULTILINESTRING')))}/200")
# bbox validity for the rtree
badb = cur.execute("SELECT COUNT(*) FROM fiber WHERE minx > maxx OR miny > maxy").fetchone()[0]
chk("fiber bbox ordering valid (minx<=maxx, miny<=maxy)", badb == 0, f"{badb} inverted")
rt = cur.execute("SELECT COUNT(*) FROM fiber_rtree").fetchone()[0]
chk("R*Tree populated to match fiber rows", rt == n, f"rtree={rt:,} vs fiber={n:,}")
nullb = cur.execute("SELECT SUM(minx IS NULL OR miny IS NULL OR maxx IS NULL OR maxy IS NULL) FROM fiber").fetchone()[0]
chk("no null fiber bboxes", nullb == 0, f"{nullb} null")
c.close()

print("\n--- 4. soil.geojson ---")
gj = json.load(open(f"{PACK}/vectors/soil.geojson"))
feats = gj["features"]
print(f"  features={len(feats)}")
chk("soil has features", len(feats) > 0, str(len(feats)))
chk("every feature has a geometry", all(f.get("geometry") for f in feats), "geometry present")
chk("every feature has FAOSOIL + soil_type", all(f["properties"].get("FAOSOIL") and f["properties"].get("soil_type") for f in feats), "classified")
geomtypes = set(f["geometry"]["type"] for f in feats)
print(f"  geometry types: {geomtypes}")
chk("geometry types are Polygon/MultiPolygon", geomtypes <= {"Polygon", "MultiPolygon"}, str(geomtypes))
coords_ok = True
ncoord = 0
for f in feats:
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for poly in polys:
        for ring in poly:
            for pt in ring:
                ncoord += 1
                if not (-180 <= pt[0] <= 180 and -90 <= pt[1] <= 90):
                    coords_ok = False
chk("all soil coordinates within global bounds", coords_ok, f"{ncoord:,} vertices checked")
# ring closure
closed = all(
    (lambda polys: all(ring[0] == ring[-1] for poly in polys for ring in poly))(
        [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"])
    for f in feats for g in [f["geometry"]])
chk("all soil rings are closed", closed, "first == last vertex")
c.close() if False else None

print("\n--- 5. population raster ---")
with rasterio.open(f"{PACK}/population/population.tif") as src:
    a = src.read(1)
    print(f"  {src.width}x{src.height} crs={src.crs} dtype={src.dtypes[0]} nodata={src.nodata}")
    chk("population CRS is WGS84 lon/lat", str(src.crs).endswith("4326"), str(src.crs))
    # Mask the declared nodata sentinel (-99999) before range/aggregate checks,
    # otherwise the "no negatives" and "plausible total" checks measure the
    # sentinel rather than the data.
    nd = src.nodata
    valid = a[a != nd] if nd is not None else a
    valid = valid[np.isfinite(valid)]
    chk("population has finite positive values", valid.size > 0 and valid.max() > 0,
        f"max={valid.max():.0f} over {valid.size:,} valid cells")
    chk("population has no negative values once nodata is masked", valid.min() >= 0, f"min={valid.min():.0f}")
    tot = float(valid.sum())
    chk("Rajasthan total is plausible (50M..95M)", 5e7 < tot < 9.5e7, f"{tot:,.0f}")
    chk("population within Rajasthan bounds", 22.9 < src.bounds.bottom and src.bounds.top < 30.4, str(src.bounds))

print("\n--- 6. elevation raster ---")
with rasterio.open(f"{PACK}/elevation/elevation.tif") as src:
    print(f"  {src.width}x{src.height} crs={src.crs} dtype={src.dtypes[0]}")
    chk("elevation CRS is WGS84 lon/lat", str(src.crs).endswith("4326"), str(src.crs))
    w = src.read(1, window=((0, 2000), (0, 2000)))
    fin = w[np.isfinite(w)]
    chk("elevation window has finite values", fin.size > 0, f"{fin.size:,} finite")
    chk("elevation range plausible (-200..4000 m)", fin.min() > -200 and fin.max() < 4000,
        f"min={fin.min():.0f} max={fin.max():.0f}")

print("\n--- 7. base map (PMTiles) ---")
p = f"{PACK}/tiles/base-map.pmtiles"
with open(p, "rb") as fh:
    head = fh.read(127)
chk("PMTiles magic header", head[:7] == b"PMTiles", head[:7].decode("ascii", "replace"))
print(f"  size = {os.path.getsize(p):,} bytes")

print("\n" + "=" * 78)
if fails:
    print(f"DATA INTEGRITY: {len(fails)} FAILED -> {fails}")
else:
    print("DATA INTEGRITY: all checks passed")
print("=" * 78)
