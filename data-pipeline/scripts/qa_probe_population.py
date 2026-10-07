#!/usr/bin/env python3
"""
ADVERSARIAL PROBE G — independent verification of the population raster.

The app samples population.tif directly. This reads the SAME file with
rasterio (a completely independent implementation) and compares point samples
and disc integrals against the app's engine, to detect georeferencing offsets
or value-scaling errors.

Also tests genuinely remote locations, because the end-to-end run classified a
Barmer point as "Dense urban" (4795/km2).
"""
import math
import os
import sys

import numpy as np
import rasterio
from rasterio.windows import Window

PACK = "/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan"
TIF = os.path.join(PACK, "population", "population.tif")

KM_LAT = 111.32

with rasterio.open(TIF) as src:
    print(f"raster: {src.width}x{src.height} crs={src.crs} dtype={src.dtypes[0]}")
    print(f"bounds: {src.bounds}")
    print(f"transform: {src.transform}")
    print(f"nodata: {src.nodata}")
    arr = src.read(1)
    print(f"full-array stats: min={np.nanmin(arr):.1f} max={np.nanmax(arr):.1f} mean={np.nanmean(arr):.2f} sum={np.nansum(arr):,.0f}")
    print(f"people/cell -> Rajasthan total = {np.nansum(arr):,.0f}")
    print()

    def sample(lat, lon):
        """Point sample using rasterio's own indexing (independent path)."""
        row, col = src.index(lon, lat)
        if row < 0 or col < 0 or row >= src.height or col >= src.width:
            return None
        v = float(arr[row, col])
        if src.nodata is not None and v == src.nodata:
            return None
        return v

    def disc(lat, lon, radius_km):
        """Integrate a disc by walking the grid (same definition as the engine)."""
        res_x = abs(src.transform.a)
        res_y = abs(src.transform.e)
        d_lat = radius_km / KM_LAT
        cos_lat = math.cos(math.radians(lat))
        d_lon = radius_km / (KM_LAT * cos_lat)
        r0, c0 = src.index(lon - d_lon, lat + d_lat)
        r1, c1 = src.index(lon + d_lon, lat - d_lat)
        r0 = max(0, r0); c0 = max(0, c0)
        r1 = min(src.height - 1, r1); c1 = min(src.width - 1, c1)
        total = 0.0
        cells = 0
        for r in range(r0, r1 + 1):
            cell_lat = src.transform.f + (r + 0.5) * src.transform.e
            dy = (cell_lat - lat) * KM_LAT
            if abs(dy) > radius_km:
                continue
            for c in range(c0, c1 + 1):
                cell_lon = src.transform.c + (c + 0.5) * src.transform.a
                dx = (cell_lon - lon) * KM_LAT * cos_lat
                if math.hypot(dx, dy) > radius_km:
                    continue
                v = float(arr[r, c])
                if src.nodata is not None and v == src.nodata:
                    continue
                if not math.isfinite(v):
                    continue
                total += v
                cells += 1
        return total, cells

    POINTS = [
        ("Ajmer city centre", 26.4499, 74.6399),
        ("Jaipur city centre", 26.9124, 75.7873),
        ("Jodhpur city centre", 26.2389, 73.0243),
        ("Barmer town", 25.7521, 71.3967),
        ("'Rural Barmer' test point", 25.75, 71.4),
        ("Thar desert (remote)", 27.0, 70.5),
        ("Rann of Kutch edge (remote)", 24.5, 71.0),
        ("Aravalli forest (remote)", 24.9, 73.7),
        ("Jaisalmer desert (remote)", 27.5, 70.2),
        ("Mount Abu", 24.5925, 72.7156),
    ]

    print(f"{'point':<30} {'lat':>9} {'lon':>9} {'value':>12} {'2km people':>12} {'2km dens':>10}  class")
    for name, lat, lon in POINTS:
        v = sample(lat, lon)
        p2, cells = disc(lat, lon, 2)
        dens = p2 / (math.pi * 4)
        cls = ("Rural" if dens < 100 else "Semi-urban" if dens < 500
               else "Urban" if dens < 1500 else "Dense urban")
        vv = f"{v:.1f}" if v is not None else "nodata"
        print(f"{name:<30} {lat:>9.4f} {lon:>9.4f} {vv:>12} {p2:>12,.0f} {dens:>10.0f}  {cls}")

    print()
    # Sanity: whole-Rajasthan urban/rural split. If the mask/scale were wrong we
    # would see implausible totals.
    print(f"Rajasthan total from raster: {np.nansum(arr):,.0f}")
    print("(published: ~68.5M in Census 2011, ~80M projected 2020)")

    # Distribution of cell values: how many cells are urban-dense?
    flat = arr[np.isfinite(arr)]
    print(f"cells: {flat.size:,}")
    print(f"  cells with 0 people: {(flat == 0).sum():,} ({(flat == 0).mean()*100:.1f}%)")
    print(f"  cells >= 1000 people (>=1300/km2): {(flat >= 1000).sum():,} ({(flat >= 1000).mean()*100:.2f}%)")
    print(f"  max cell value: {flat.max():,.0f} people ({(flat.max()/0.769142):,.0f}/km2)")
