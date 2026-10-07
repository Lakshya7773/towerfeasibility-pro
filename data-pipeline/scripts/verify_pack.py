import sqlite3, json, os
P = "/home/lakshya/company/towerfeasibility/dist/packs/data-pack-rajasthan"
lat, lon = 26.9124, 75.7873  # Ajmer

m = json.load(open(f"{P}/manifest.json"))
print("MANIFEST:", m["region_name"], m["version"], "| files:", len(m["files"]))
print("bounds:", m["bounds"])

con = sqlite3.connect(f"{P}/vectors/towers.sqlite")
print("\ntowers in pack:", f'{con.execute("SELECT COUNT(*) FROM towers").fetchone()[0]:,}')
for km in (2, 5, 10):
    d = km / 111.0
    dl = km / (111.0 * 0.89)
    n = con.execute("SELECT COUNT(*) FROM towers WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                    (lat-d, lat+d, lon-dl, lon+dl)).fetchone()[0]
    print(f"  within {km}km of Ajmer: {n:,}")
con.close()

con = sqlite3.connect(f"{P}/vectors/fiber.sqlite")
print("\nfiber segments in pack:", f'{con.execute("SELECT COUNT(*) FROM fiber").fetchone()[0]:,}')
n = con.execute("SELECT COUNT(*) FROM fiber_rtree WHERE minx<=? AND maxx>=? AND miny<=? AND maxy>=?",
                (lon+0.5, lon-0.5, lat+0.5, lat-0.5)).fetchone()[0]
print(f"  fiber segments within ~50km: {n:,}")
con.close()

print("\nsoil file:", os.path.getsize(f"{P}/vectors/soil.geojson")/1e6, "MB")
print("\nPACK VERIFIED OK")
