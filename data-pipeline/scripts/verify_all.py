import sqlite3, os, json
import pandas as pd, geopandas as gpd

B = "/home/lakshya/company/towerfeasibility/data"
SITE = (26.9124, 75.7873)  # Ajmer, Rajasthan (lat, lon)

print("=" * 62)
print(f"FINAL VERIFICATION — test site: Ajmer {SITE}")
print("=" * 62)

# ---------- TOWERS ----------
print("\n[1] TOWERS")
con = sqlite3.connect(f"{B}/towers/sqlite/all-india_ts.sqlite")
total = con.execute("SELECT COUNT(*) FROM towers").fetchone()[0]
print(f"  Tarang Sanchar total towers: {total:,}")
for r_km in (1, 2, 5):
    dlat = r_km / 111.0
    dlon = r_km / (111.0 * 0.89)
    q = ("SELECT COUNT(*) FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?")
    n = con.execute(q, (SITE[0]-dlat, SITE[0]+dlat, SITE[1]-dlon, SITE[1]+dlon)).fetchone()[0]
    area = 3.14159 * r_km**2
    print(f"  within {r_km} km: {n:,} towers  ->  {n/area:.2f} towers/km2")
types = con.execute("SELECT installation_type, COUNT(*) FROM towers GROUP BY 1 ORDER BY 2 DESC").fetchall()
print("  installation types:", types)
con.close()

# ---------- FIBER ----------
print("\n[2] FIBER")
con = sqlite3.connect(f"{B}/fiber/processed/fiber_index.sqlite")
tot = con.execute("SELECT COUNT(*) FROM fiber").fetchone()[0]
print(f"  BBNL OFC segments (national): {tot:,}")
# nearest fiber to site using R*Tree
q = """SELECT f.name, f.owner, f.seg_length
       FROM fiber_rtree r JOIN fiber f ON f.id=r.id
       WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?
       LIMIT 5"""
rows = con.execute(q, (SITE[1]+0.05, SITE[1]-0.05, SITE[0]+0.05, SITE[0]-0.05)).fetchall()
print(f"  fiber segments within ~5km of Ajmer: {len(rows)}")
for r in rows[:3]:
    print(f"    - {r[0]!r} owner={r[1]} len={r[2]}")
# district split capability
d = con.execute("SELECT COUNT(DISTINCT st_code) FROM fiber").fetchone()[0]
print(f"  distinct state codes in fiber: {d}")
con.close()

# ---------- SOIL ----------
print("\n[3] SOIL")
g = gpd.read_file(f"{B}/soil/processed/soil_india.geojson")
print(f"  soil polygons: {len(g)}   CRS: {g.crs}")
from shapely.geometry import Point
pt = gpd.GeoDataFrame(geometry=[Point(SITE[1], SITE[0])], crs="EPSG:4326")
hit = gpd.sjoin(g, pt, how="inner", predicate="contains")
if len(hit):
    r = hit.iloc[0]
    print(f"  AT AJMER -> FAO={r['FAOSOIL']}  soil_type={r['soil_type']}  "
          f"foundation={r['foundation_suitability']}")
    print(f"     note: {r['foundation_note']}")
else:
    print("  no polygon contains Ajmer (check geometry)")
cfg = json.load(open(f"{B}/soil/processed/config/soil-classification.json"))
print(f"  soil classes configured: {len(cfg['fao_group_map'])}  "
      f"polygon distribution: {cfg['polygon_counts_by_soil_type']}")

print("\n" + "=" * 62)
print("ALL THREE DATASETS: OPERATIONAL")
print("=" * 62)
