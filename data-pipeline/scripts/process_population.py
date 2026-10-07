#!/usr/bin/env python3
"""
T0.2.1 — Population Data Processor

Builds a per-region population-density raster for the app.

Source: WorldPop 2020, India, 1 km, unadjusted ("Aggregated") GeoTIFF.
    https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/2020/IND/
        ind_ppp_2020_1km_Aggregated_UNadj.tif

WorldPop 1 km "Aggregated" stores people per cell (not per km2), so a cell
value is already a population count. We keep the raster as float32 people/cell
and record the cell area in the pack config; the app converts to density.

Usage:
    python process_population.py --region rajasthan
"""
import argparse
import json
import os
import sys

import numpy as np
import rasterio
from rasterio.mask import mask
from rasterio.warp import calculate_default_transform, reproject, Resampling
from shapely.geometry import shape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "data")

REGIONS = {
    "rajasthan": {"min_lat": 23.0, "max_lat": 30.3, "min_lon": 69.4, "max_lon": 78.3},
    "all-india": {"min_lat": 6.5, "max_lat": 37.5, "min_lon": 68.0, "max_lon": 97.5},
}

DEFAULT_SRC = os.path.join(DATA, "population", "ind_ppp_2020_1km.tif")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="rajasthan", choices=list(REGIONS))
    ap.add_argument("--input", default=DEFAULT_SRC)
    ap.add_argument("--out-dir", default=os.path.join(DATA, "population", "processed"))
    args = ap.parse_args()

    if not os.path.exists(args.input):
        print(f"FAIL: source not found: {args.input}")
        sys.exit(1)

    b = REGIONS[args.region]
    os.makedirs(args.out_dir, exist_ok=True)

    # Optional state-boundary mask. Without it the raster is a plain bbox
    # crop, so a site near a state border picks up neighbouring states'
    # population. With it, out-of-state cells are set to nodata.
    mask_geom = None
    mask_path = os.path.join(DATA, "admin", f"{args.region}_boundary.geojson")
    if os.path.exists(mask_path):
        with open(mask_path) as f:
            gj = json.load(f)
        if gj.get("features"):
            mask_geom = [shape(gj["features"][0]["geometry"])]
            print(f"mask: {mask_path} ({len(mask_geom)} polygon)")
    else:
        print(f"mask: none ({mask_path} missing) — raster will be a bbox crop")

    with rasterio.open(args.input) as src:
        print(f"source: {src.width}x{src.height} crs={src.crs} dtype={src.dtypes[0]}")

        # clip to region bbox (in the source CRS; WorldPop India is EPSG:4326)
        from rasterio.windows import from_bounds
        win = from_bounds(b["min_lon"], b["min_lat"], b["max_lon"], b["max_lat"],
                          transform=src.transform)
        win = win.round_offsets().round_lengths()
        data = src.read(1, window=win)
        transform = src.window_transform(win)
        crs = src.crs

        # ensure WGS84
        if crs is not None and str(crs).upper() not in ("EPSG:4326",):
            dst_crs = "EPSG:4326"
            t, w, h = calculate_default_transform(
                crs, dst_crs, data.shape[1], data.shape[0],
                *rasterio.transform.array_bounds(data.shape[0], data.shape[1], transform),
            )
            out = np.zeros((h, w), dtype=data.dtype)
            reproject(source=data, destination=out,
                      src_transform=transform, src_crs=crs,
                      dst_transform=t, dst_crs=dst_crs, resampling=Resampling.bilinear)
            data, transform, crs = out, t, dst_crs

    # cell area in km2 from the transform (deg -> km at the region's mid-lat)
    px = abs(transform.a)
    py = abs(transform.e)
    mid_lat = (b["min_lat"] + b["max_lat"]) / 2
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * np.cos(np.radians(mid_lat))
    cell_km2 = (px * km_per_deg_lon) * (py * km_per_deg_lat)

    out_path = os.path.join(args.out_dir, f"{args.region}_population.tif")
    profile = {
        "driver": "GTiff", "height": data.shape[0], "width": data.shape[1],
        "count": 1, "dtype": "float32", "crs": crs, "transform": transform,
        "compress": "deflate", "predictor": 3, "nodata": -99999.0,
        "tiled": True, "blockxsize": 256, "blockysize": 256,
    }
    arr = np.where(np.isnan(data), -99999.0, data).astype(np.float32)

    # Apply the state mask: anything outside the state becomes nodata, so
    # border sites cannot pull in neighbouring states' population.
    if mask_geom is not None:
        from rasterio.features import geometry_mask
        outside = geometry_mask(
            mask_geom, out_shape=arr.shape, transform=transform,
            invert=False, all_touched=False,
        )
        arr[outside] = -99999.0

    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(arr, 1)

    valid = arr[arr > -99999.0]
    print(f"\nwrote {out_path}")
    print(f"  size        : {os.path.getsize(out_path)/1e6:.1f} MB")
    print(f"  grid        : {data.shape[1]}x{data.shape[0]}")
    print(f"  cell area   : {cell_km2:.4f} km2")
    print(f"  people/cell : min={valid.min():.1f} max={valid.max():.1f} "
          f"mean={valid.mean():.2f} sum={valid.sum():,.0f}")
    print(f"  max density : {valid.max()/cell_km2:,.0f} people/km2")

    # sidecar config so the app knows how to interpret the raster
    cfg = {
        "source": "WorldPop 2020 1km unadjusted (Aggregated)",
        "units": "people_per_cell",
        "year": 2020,
        "cell_area_km2": round(float(cell_km2), 6),
        "nodata": -99999.0,
        "region": args.region,
        "bounds": b,
        "masked_to_state": mask_geom is not None,
        "note": "divide cell value by cell_area_km2 for people/km2",
    }
    cfg_path = os.path.join(args.out_dir, f"{args.region}_population.json")
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"  config      : {cfg_path}")


if __name__ == "__main__":
    main()
