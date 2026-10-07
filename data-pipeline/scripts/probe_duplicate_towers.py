#!/usr/bin/env python3
"""Accuracy probe: are there duplicate towers between the Tarang and NIC sources?"""
import math
import os
import sqlite3
from collections import defaultdict

PACK = "/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan"

con = sqlite3.connect(os.path.join(PACK, "vectors", "towers.sqlite"))
cur = con.cursor()

cur.execute("SELECT source, COUNT(*) FROM towers GROUP BY source")
print("by source:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM towers")
print("total:", cur.fetchone()[0])

# Grid-bucket near-duplicate detection (O(n) instead of O(n^2)).
# Cell ~0.001 deg (~110 m); compare within the cell and its neighbours.
CELL = 0.001
buckets = defaultdict(list)
rows = cur.execute("SELECT id, lat, lon, source, source_id FROM towers").fetchall()
for tid, lat, lon, src, sid in rows:
    buckets[(int(math.floor(lat / CELL)), int(math.floor(lon / CELL)))].append(
        (tid, lat, lon, src, sid))

# threshold ~30 m
DLAT = 30 / 111320.0
def dlon_at(lat):
    return 30 / (111320.0 * math.cos(math.radians(lat)))

exact = 0
near30 = 0
near100 = 0
cross_source = 0
same_source = 0
examples = []

for (gy, gx), items in buckets.items():
    if len(items) < 2:
        continue
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i], items[j]
            dlat = abs(a[1] - b[1])
            dlon = abs(a[2] - b[2])
            if dlat > 0.0015 or dlon > 0.0015:
                continue
            # metres
            my = dlat * 111320.0
            mx = dlon * 111320.0 * math.cos(math.radians(a[1]))
            d = math.hypot(mx, my)
            if d == 0:
                exact += 1
            if d <= 30:
                near30 += 1
                if a[3] != b[3]:
                    cross_source += 1
                    if len(examples) < 5:
                        examples.append((a[1], a[2], a[3], a[4], b[3], b[4], round(d, 1)))
                else:
                    same_source += 1
            if d <= 100:
                near100 += 1

print(f"exact coordinate duplicates: {exact}")
print(f"pairs within  30 m: {near30}  (cross-source {cross_source}, same-source {same_source})")
print(f"pairs within 100 m: {near100}")
print(f"\nper 2km disc at Ajmer this would inflate density by at most "
      f"{near30 / (math.pi * 4):.1f}/km2")
if examples:
    print("\nexample cross-source near-duplicates (lat, lon, srcA, idA, srcB, idB, metres):")
    for e in examples:
        print("  ", e)
con.close()
