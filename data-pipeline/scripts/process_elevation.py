#!/usr/bin/env python3
"""
T0.2.4 — Elevation Data Processor (streaming)

Builds a per-region elevation raster for LoS / terrain analysis.

Source: AWS Open Data terrain tiles (SRTM-derived), no auth required:
    https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
Terrarium decode:  elevation_m = (R*256 + G + B/256) - 32768

Memory: a full mosaic at z12 for Rajasthan is 26624x24576 px (~2.6 GB float32),
which does not fit this host. So we write the GeoTIFF first and stream one tile
ROW at a time into it, keeping only a single tile-row band in memory
(ny_tiles * 256 px tall, a few hundred MB at most). Peak memory is therefore
bounded by the region width, not the area.

Zoom guide for Rajasthan:
    z10  728 tiles   ~153 m/px   ~25 MB output
    z11 2700 tiles    ~76 m/px   ~90 MB output
    z12 9984 tiles    ~38 m/px  ~300 MB output

Usage:
    python process_elevation.py --region rajasthan --zoom 11
"""
import argparse
import io
import math
import os
import sys
import time

import numpy as np
import requests
import rasterio
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.windows import Window

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "data")

REGIONS = {
    "rajasthan": {"min_lat": 23.0, "max_lat": 30.3, "min_lon": 69.4, "max_lon": 78.3},
    "all-india": {"min_lat": 6.5, "max_lat": 37.5, "min_lon": 68.0, "max_lon": 97.5},
}

TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
NODATA = -32768


def deg2num(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return x, y


def num2lon(x, z):
    return x / (2 ** z) * 360.0 - 180.0


def num2lat(y, z):
    n = math.pi - 2.0 * math.pi * y / (2 ** z)
    return math.degrees(math.atan(math.sinh(n)))


def decode_terrarium(img):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    return (a[:, :, 0] * 256.0 + a[:, :, 1] + a[:, :, 2] / 256.0) - 32768.0


def fetch_tile(z, x, y, session, retries=4):
    url = TERRARIUM.format(z=z, x=x, y=y)
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=45)
            if r.status_code == 200 and r.content:
                return Image.open(io.BytesIO(r.content))
        except Exception:
            pass
        time.sleep(0.5 + attempt)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="rajasthan", choices=list(REGIONS))
    ap.add_argument("--zoom", type=int, default=11)
    ap.add_argument("--out-dir", default=os.path.join(DATA, "elevation", "processed"))
    args = ap.parse_args()

    b = REGIONS[args.region]
    z = args.zoom
    os.makedirs(args.out_dir, exist_ok=True)

    x0, y0 = deg2num(b["max_lat"], b["min_lon"], z)   # top-left
    x1, y1 = deg2num(b["min_lat"], b["max_lon"], z)   # bottom-right
    x0, x1 = max(0, x0 - 1), x1 + 1
    y0, y1 = max(0, y0 - 1), y1 + 1
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    width, height = nx * 256, ny * 256
    print(f"region={args.region} z={z} tiles={nx}x{ny}={nx*ny} raster={width}x{height}")

    west, east = num2lon(x0, z), num2lon(x1 + 1, z)
    north, south = num2lat(y0, z), num2lat(y1 + 1, z)
    transform = from_bounds(west, south, east, north, width, height)

    out = os.path.join(args.out_dir, f"{args.region}_elevation_z{z}.tif")
    profile = {
        "driver": "GTiff", "height": height, "width": width, "count": 1,
        "dtype": "int16", "crs": "EPSG:4326", "transform": transform,
        "compress": "deflate", "predictor": 2, "nodata": NODATA,
        "tiled": True, "blockxsize": 256, "blockysize": 256,
    }

    session = requests.Session()
    ok = missing = 0
    vmin, vmax, vsum, vcount = 1e9, -1e9, 0.0, 0

    with rasterio.open(out, "w", **profile) as dst:
        for iy in range(ny):
            band = np.full((256, width), NODATA, dtype=np.int16)
            for ix in range(nx):
                img = fetch_tile(z, x0 + ix, y0 + iy, session)
                if img is None:
                    missing += 1
                    continue
                dem = decode_terrarium(img)
                band[:, ix * 256:(ix + 1) * 256] = np.round(dem).astype(np.int16)
                ok += 1
            dst.write(band, 1, window=Window(0, iy * 256, width, 256))
            valid = band[band != NODATA]
            if valid.size:
                vmin = min(vmin, int(valid.min()))
                vmax = max(vmax, int(valid.max()))
                vsum += float(valid.sum())
                vcount += int(valid.size)
            if (iy + 1) % 5 == 0 or iy == ny - 1:
                print(f"  row {iy+1}/{ny}  tiles ok={ok} missing={missing}")

    print(f"\nwrote {out}")
    print(f"  size      : {os.path.getsize(out)/1e6:.1f} MB")
    print(f"  grid      : {width}x{height}")
    print(f"  bounds    : {west:.3f},{south:.3f} .. {east:.3f},{north:.3f}")
    if vcount:
        print(f"  elevation : min={vmin}m max={vmax}m mean={vsum/vcount:.0f}m")
    print(f"  tiles     : ok={ok} missing={missing}")

    import json
    cfg = {
        "source": f"AWS Terrain Tiles (terrarium, SRTM-derived) z{z}",
        "units": "metres",
        "nodata": NODATA,
        "region": args.region,
        "zoom": z,
        "bounds": b,
    }
    cfg_path = os.path.join(args.out_dir, f"{args.region}_elevation.json")
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"  config    : {cfg_path}")

    if ok == 0:
        print("FAIL: no tiles fetched")
        sys.exit(1)


if __name__ == "__main__":
    main()
