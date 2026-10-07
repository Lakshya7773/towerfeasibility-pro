#!/usr/bin/env python3
"""
Accuracy impact probe: does the source registry's near-duplicate tower
population change the saturation classification a user sees?

Tarang Sanchar is site-based (site_id, type, valid) with no operator column, so
the source is already de-duplicated per site. But it still contains 9,941 pairs
of DISTINCT site_ids within 30 m of each other. If those are co-located masts
counted per-operator, density is inflated; if they are genuinely separate
structures, the count is honest. This measures the worst-case effect on the
classification bands the app reports.
"""
import math
import os
import sqlite3
from collections import defaultdict

PACK = "/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan"
CELL = 0.001

con = sqlite3.connect(os.path.join(PACK, "vectors", "towers.sqlite"))
rows = con.execute("SELECT id, lat, lon FROM towers").fetchall()
con.close()

# Build grid
buckets = defaultdict(list)
for tid, la, lo in rows:
    buckets[(int(math.floor(la / CELL)), int(math.floor(lo / CELL)))].append((tid, la, lo))

# Mark near-duplicate pairs (<30 m) and keep the first of each cluster
DLAT = 30 / 111320.0
dup_ids = set()
for (gy, gx), items in buckets.items():
    if len(items) < 2:
        continue
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i], items[j]
            dlat = abs(a[1] - b[1]); dlon = abs(a[2] - b[2])
            if dlat > DLAT or dlon > DLAT:
                continue
            my = dlat * 111320.0
            mx = dlon * 111320.0 * math.cos(math.radians(a[1]))
            if math.hypot(mx, my) <= 30:
                dup_ids.add(b[0])   # drop the later one

kept = [r for r in rows if r[0] not in dup_ids]
print(f"towers total          : {len(rows):,}")
print(f"collapsed as near-dup : {len(dup_ids):,}  ({len(dup_ids)/len(rows)*100:.1f}%)")
print(f"remaining             : {len(kept):,}")


def sat_class(density):
    """Mirror towerEngine.classifySaturation."""
    if density < 2: return "Low"
    if density < 8: return "Moderate"
    if density < 20: return "High"
    return "Saturated"


def density_at(pts, lat, lon, r_km):
    dla = r_km / 111.32
    dlo = r_km / (111.32 * math.cos(math.radians(lat)))
    n = sum(1 for _, la, lo in pts if abs(la - lat) <= dla and abs(lo - lon) <= dlo)
    return n / (math.pi * r_km * r_km)


SITES = [
    ("Ajmer",   26.4499, 74.6399),
    ("Jaipur",  26.9124, 75.7873),
    ("Jodhpur", 26.2389, 73.0243),
    ("Kota",    25.2138, 75.8648),
    ("Bikaner", 28.0229, 73.3119),
    ("Jaisalmer", 26.9157, 70.9083),
    ("Udaipur", 24.5854, 73.7125),
    ("Alwar",   27.5530, 76.6346),
]

print(f"\n{'site':<11} {'dens(all)':>10} {'class(all)':>11} {'dens(dedup)':>12} {'class(dedup)':>13} {'Δ':>6}")
changed = 0
for name, la, lo in SITES:
    d1 = density_at(rows, la, lo, 2)
    d2 = density_at(kept, la, lo, 2)
    c1, c2 = sat_class(d1), sat_class(d2)
    flag = "CHANGED" if c1 != c2 else ""
    if c1 != c2:
        changed += 1
    print(f"{name:<11} {d1:>10.2f} {c1:>11} {d2:>12.2f} {c2:>13} {flag:>6}")

print(f"\nclassifications changed by de-duplication: {changed}/{len(SITES)}")
print("\nNOTE: this bounds the worst case. The source is site-based, so these are")
print("most likely genuinely distinct registered sites (e.g. adjacent rooftops),")
print("not the same mast counted per operator.")
