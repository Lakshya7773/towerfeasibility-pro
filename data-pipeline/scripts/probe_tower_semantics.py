#!/usr/bin/env python3
"""
Accuracy probe: is the pack's tower count an honest count of distinct physical
locations, or does it double-count?

The Tarang Sanchar source is site-based: columns are site_id, type, valid,
geometry, bbox — there is no operator column. So we check:
  1. are site_ids unique in the source?
  2. do near-duplicate coordinate pairs carry distinct site_ids?
  3. did the pack preserve site_id into source_id?
"""
import math
import os
import sqlite3
from collections import defaultdict

import pandas as pd

ROOT = "/home/lakshya/company/towerfeasibility"
PACK = os.path.join(ROOT, "dist", "packs", "data-pack-rajasthan")

# ---------- source ----------
df = pd.read_parquet(os.path.join(ROOT, "data", "towers", "TS_towers.parquet"))
print(f"source rows: {len(df):,}")
print(f"unique site_id: {df['site_id'].nunique():,}")
print(f"site_id duplicated rows: {len(df) - df['site_id'].nunique():,}")
print(f"'valid' values: {df['valid'].value_counts().to_dict()}")
print(f"'type' values: {df['type'].value_counts().to_dict()}")

# Rajasthan bbox subset, matching the pack
b = dict(min_lat=23.0, max_lat=30.3, min_lon=69.4, max_lon=78.3)
sub = df[
    (df["bbox"].apply(lambda g: g["ymin"]) >= b["min_lat"])
    & (df["bbox"].apply(lambda g: g["ymax"]) <= b["max_lat"])
    & (df["bbox"].apply(lambda g: g["xmin"]) >= b["min_lon"])
    & (df["bbox"].apply(lambda g: g["xmax"]) <= b["max_lon"])
].copy()
print(f"\nrows in Rajasthan bbox: {len(sub):,}")
print(f"unique site_id in bbox: {sub['site_id'].nunique():,}")

sub["lat"] = sub["bbox"].apply(lambda g: g["ymin"])
sub["lon"] = sub["bbox"].apply(lambda g: g["xmin"])

# ---------- near-duplicate analysis on the source ----------
CELL = 0.001
buckets = defaultdict(list)
for sid, la, lo in zip(sub["site_id"], sub["lat"], sub["lon"]):
    buckets[(int(math.floor(la / CELL)), int(math.floor(lo / CELL)))].append((sid, la, lo))

same_id_pairs = 0
diff_id_30 = 0
diff_id_exact = 0
examples = []
for items in buckets.values():
    if len(items) < 2:
        continue
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, c = items[i], items[j]
            dlat = abs(a[1] - c[1]); dlon = abs(a[2] - c[2])
            if dlat > 0.0015 or dlon > 0.0015:
                continue
            my = dlat * 111320.0
            mx = dlon * 111320.0 * math.cos(math.radians(a[1]))
            d = math.hypot(mx, my)
            if d == 0:
                if a[0] == c[0]:
                    same_id_pairs += 1
                else:
                    diff_id_exact += 1
                    if len(examples) < 5:
                        examples.append((a[1], a[2], a[0], c[0]))
            if d <= 30 and a[0] != c[0]:
                diff_id_30 += 1

print(f"\nnear-duplicate pairs on SOURCE data:")
print(f"  same site_id, identical coords : {same_id_pairs}")
print(f"  DIFFERENT site_id, identical coords: {diff_id_exact}")
print(f"  DIFFERENT site_id, within 30 m : {diff_id_30}")
if examples:
    print("  examples (lat, lon, site_id A, site_id B):")
    for e in examples:
        print("   ", e)

# ---------- pack ----------
con = sqlite3.connect(os.path.join(PACK, "vectors", "towers.sqlite"))
cur = con.cursor()
cur.execute("SELECT COUNT(*) FROM towers")
print(f"\npack rows: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(DISTINCT source_id) FROM towers")
print(f"pack distinct source_id: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM towers WHERE source_id IS NULL")
print(f"pack rows with null source_id: {cur.fetchone()[0]:,}")
con.close()
