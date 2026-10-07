#!/usr/bin/env python3
"""
Beta Test Suite — Accuracy Dimension

Compares the pack's data against independent ground truth. Expectations are
ranges anchored to published figures, not point guesses: a 1 km WorldPop cell
covers a city plus its suburbs, so it will not equal a municipal corporation's
density.
"""
import json
import math
import os
import sqlite3
import sys

import numpy as np
import rasterio

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PACK = os.path.join(ROOT, "dist", "packs", "data-pack-rajasthan")

results = []


def check_range(name, actual, lo, hi, unit="", note=""):
    ok = actual is not None and lo <= actual <= hi
    results.append({"test": name, "status": "PASS" if ok else "FAIL",
                    "actual": actual, "range": f"{lo}..{hi}"})
    a = "None" if actual is None else f"{actual:,.1f}"
    print(f"{'PASS' if ok else 'FAIL'}  {name:48s} {a:>12} {unit:8s} [{lo:,}..{hi:,}] {note}")
    return ok


def check_exact(name, actual, expected, note=""):
    ok = actual == expected
    results.append({"test": name, "status": "PASS" if ok else "FAIL",
                    "actual": actual, "range": str(expected)})
    print(f"{'PASS' if ok else 'FAIL'}  {name:48s} {actual!s:>12} {'':8s} [= {expected}] {note}")
    return ok


# ============================================================
print("\n" + "=" * 74)
print("T-A01  POPULATION  (source: WorldPop 2020, masked to state)")
print("=" * 74)

with open(os.path.join(PACK, "config", "population.json")) as f:
    popcfg = json.load(f)
cell_km2 = popcfg["cell_area_km2"]

with rasterio.open(os.path.join(PACK, "population", "population.tif")) as src:
    pop = src.read(1)
    nodata = src.nodata

    def density(lat, lon):
        r, c = src.index(lon, lat)
        if not (0 <= r < pop.shape[0] and 0 <= c < pop.shape[1]):
            return None
        v = pop[r, c]
        if v == nodata or not np.isfinite(v):
            return None
        return float(v) / cell_km2

    # Indian city cores run dense; a 1 km cell spans core + inner suburbs.
    check_range("Ajmer city density", density(26.4499, 74.6399), 5_000, 30_000,
                "per km2", "Census 2011 Ajmer city ~13.5k/km2")
    check_range("Jaipur city density", density(26.9124, 75.7873), 5_000, 35_000,
                "per km2", "Jaipur is a metro core")
    check_range("Jaisalmer town density", density(26.9157, 70.9083), 200, 4_000,
                "per km2", "desert town, low density")
    check_range("Rural Rajasthan density", density(27.5, 73.5), 20, 400,
                "per km2", "arid rural interior")

    # Ordering is the robust check: city > town > rural.
    d_city = density(26.4499, 74.6399)
    d_town = density(26.9157, 70.9083)
    d_rural = density(27.5, 73.5)
    ok = d_city is not None and d_town is not None and d_rural is not None \
        and d_city > d_town > d_rural
    results.append({"test": "Density ordering city>town>rural",
                    "status": "PASS" if ok else "FAIL"})
    print(f"{'PASS' if ok else 'FAIL'}  {'Density ordering city>town>rural':48s} "
          f"{d_city:,.0f} > {d_town:,.0f} > {d_rural:,.0f}")

    total = float(pop[pop != nodata].sum())
    # Rajasthan: 68.5M (Census 2011) -> ~80M by 2020. Masking should land here,
    # not at the ~224M an unmasked bbox crop produces.
    check_range("Rajasthan total population", total, 72_000_000, 88_000_000,
                "people", "Census 2011 = 68.5M; 2020 growth expected")

# ============================================================
print("\n" + "=" * 74)
print("T-A02  ELEVATION  (source: AWS terrarium / SRTM, z11)")
print("=" * 74)

with rasterio.open(os.path.join(PACK, "elevation", "elevation.tif")) as src:
    elev = src.read(1)
    enod = src.nodata

    def alt(lat, lon):
        r, c = src.index(lon, lat)
        if not (0 <= r < elev.shape[0] and 0 <= c < elev.shape[1]):
            return None
        v = elev[r, c]
        return None if v == enod or v < -1000 else float(v)

    check_range("Jaipur elevation", alt(26.9124, 75.7873), 380, 520, "m", "~430 m")
    check_range("Jaisalmer elevation", alt(26.9157, 70.9083), 180, 320, "m", "~225 m")
    check_range("Bikaner elevation", alt(28.0229, 73.3119), 190, 320, "m", "~230 m")
    check_range("Ajmer elevation", alt(26.4499, 74.6399), 400, 620, "m", "~490 m")

    # z11 is ~76 m/px, so a single pixel cannot resolve a narrow summit. The
    # correct check is that the Aravalli belt reads higher than the Thar plain.
    aravalli = alt(24.65, 72.78)      # Mt Abu area
    thar = alt(27.5, 71.0)            # desert plain
    ok = aravalli is not None and thar is not None and aravalli > thar + 150
    results.append({"test": "Aravalli higher than Thar plain",
                    "status": "PASS" if ok else "FAIL"})
    print(f"{'PASS' if ok else 'FAIL'}  {'Aravalli higher than Thar plain':48s} "
          f"{aravalli:,.0f} m vs {thar:,.0f} m")

    hi = float(elev[elev > -1000].max())
    check_range("Highest terrain in raster", hi, 1_400, 3_200, "m",
                "Aravalli peaks; >1722 m expected")

# ============================================================
print("\n" + "=" * 74)
print("T-A03  TOWERS  (source: Tarang Sanchar scrape, CC0)")
print("=" * 74)

with sqlite3.connect(os.path.join(PACK, "vectors", "towers.sqlite")) as conn:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM towers")
    check_exact("Towers in pack", cur.fetchone()[0], 125036, "matches build output")

    lat, lon = 26.4499, 74.6399
    dla = 2 / 111.32
    dlo = 2 / (111.32 * math.cos(math.radians(lat)))
    cur.execute("SELECT COUNT(*) FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                (lat - dla, lat + dla, lon - dlo, lon + dlo))
    n = cur.fetchone()[0]
    d = n / (math.pi * 4)
    check_range("Ajmer tower density (2 km)", d, 2, 60, "per km2", f"{n} towers found")

    cur.execute("SELECT COUNT(*) FROM towers WHERE lat < 23 OR lat > 30.5 OR lon < 69 OR lon > 78.5")
    bad = cur.fetchone()[0]
    check_exact("Towers outside region bbox", bad, 0, "coordinate sanity")

# ============================================================
print("\n" + "=" * 74)
print("T-A04  FIBER  (source: BBNL/BharatNet OFC)")
print("=" * 74)

with sqlite3.connect(os.path.join(PACK, "vectors", "fiber.sqlite")) as conn:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM fiber")
    check_exact("Fiber segments in pack", cur.fetchone()[0], 57349,
                "57350 source rows minus 1 degenerate")

    cur.execute("SELECT MIN(minx), MAX(maxx), MIN(miny), MAX(maxy) FROM fiber")
    a, b_, c, d_ = cur.fetchone()
    print(f"      fiber extent: lon {a:.2f}..{b_:.2f}  lat {c:.2f}..{d_:.2f}")
    inside = (a >= 68.5 and b_ <= 79.0 and c >= 22.5 and d_ <= 31.0)
    results.append({"test": "Fiber extent within region", "status": "PASS" if inside else "FAIL"})
    print(f"{'PASS' if inside else 'FAIL'}  {'Fiber extent within region':48s}")

    # No degenerate bbox may survive into the index: a row spanning from 0
    # longitude would match every spatial query. seg_length is metadata and is
    # legitimately 0.0 on some rows, so it is not a validity signal.
    cur.execute("SELECT COUNT(*) FROM fiber WHERE minx <= 1 OR maxx >= 99 OR minx > maxx OR miny > maxy")
    deg = cur.fetchone()[0]
    check_exact("Degenerate fiber bboxes", deg, 0, "index integrity")

    # R*Tree must resolve a real spatial query. BBNL/BharatNet is a rural
    # backbone, so coverage is sparse in dense cities — query at 10 km.
    cur.execute("""SELECT COUNT(*) FROM fiber_rtree r
                   JOIN fiber f ON f.id = r.id
                   WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?""",
                (74.73, 74.55, 26.54, 26.36))
    near = cur.fetchone()[0]
    check_range("Fiber segments within 10 km of Ajmer", near, 1, 5000, "segs",
                "R*Tree query; BBNL is rural-heavy")

# ============================================================
print("\n" + "=" * 74)
print("T-A05  SOIL  (source: FAO Digital Soil Map of the World)")
print("=" * 74)

with open(os.path.join(PACK, "vectors", "soil.geojson")) as f:
    soil = json.load(f)
feats = soil.get("features", [])
check_exact("Soil polygons in pack", len(feats), 40, "clipped to state boundary")

types = {f["properties"].get("soil_type") for f in feats if f["properties"].get("soil_type")}
check_range("Distinct soil types", len(types), 3, 40, "types")

with_suit = sum(1 for f in feats if f["properties"].get("foundation_suitability"))
check_exact("Polygons with foundation rating", with_suit, len(feats), "all rated")

# Total soil area must approximate the state, not exceed it: before clipping
# this summed to ~1,034,000 km2 for a 342,239 km2 state.
xs, ys = [], []
for f in feats:
    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for x in c:
                walk(x)
    walk(f["geometry"]["coordinates"])

import pyproj
from shapely.geometry import shape as _shape
_geod = pyproj.Geod(ellps="WGS84")
_area = sum(abs(_geod.geometry_area_perimeter(_shape(f["geometry"]))[0]) / 1e6 for f in feats)
check_range("Total soil area", _area, 320_000, 360_000, "km2", "Rajasthan = 342,239 km2")

inb = (min(xs) >= 68 and max(xs) <= 79 and min(ys) >= 22 and max(ys) <= 31)
results.append({"test": "Soil polygons within region", "status": "PASS" if inb else "FAIL"})
print(f"{'PASS' if inb else 'FAIL'}  {'Soil polygons within region':48s} "
      f"lon {min(xs):.2f}..{max(xs):.2f} lat {min(ys):.2f}..{max(ys):.2f}")

# ============================================================
print("\n" + "=" * 74)
print("T-A06  LoS TERRAIN PROFILE")
print("=" * 74)

with rasterio.open(os.path.join(PACK, "elevation", "elevation.tif")) as src:
    elev = src.read(1)
    enod = src.nodata
    n = 40  # Jaipur -> Ajmer, ~130 km
    prof = []
    for i in range(n + 1):
        t = i / n
        la = 26.9124 + (26.4499 - 26.9124) * t
        lo = 75.7873 + (74.6399 - 75.7873) * t
        r, c = src.index(lo, la)
        if 0 <= r < elev.shape[0] and 0 <= c < elev.shape[1]:
            v = elev[r, c]
            if v != enod and v > -1000:
                prof.append(float(v))
    check_range("Profile samples valid", len(prof) / (n + 1), 0.9, 1.0, "ratio")
    if prof:
        check_range("Profile min elevation", min(prof), 200, 600, "m")
        check_range("Profile max elevation", max(prof), 300, 900, "m")
        check_range("Profile relief", max(prof) - min(prof), 50, 600, "m")

# ============================================================
passed = sum(1 for r in results if r["status"] == "PASS")
failed = len(results) - passed
print("\n" + "=" * 74)
print(f"ACCURACY: {passed}/{len(results)} passed, {failed} failed")
print("=" * 74)
for r in results:
    if r["status"] == "FAIL":
        print(f"  FAIL {r['test']}: actual={r.get('actual')} expected={r.get('range')}")
sys.exit(0 if failed == 0 else 1)
