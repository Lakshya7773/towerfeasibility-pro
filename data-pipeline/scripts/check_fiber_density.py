import sqlite3
B = "/home/lakshya/company/towerfeasibility/data"
con = sqlite3.connect(f"{B}/fiber/processed/fiber_index.sqlite")
lat, lon = 26.9124, 75.7873  # Ajmer

print("BBNL fiber density around Ajmer (is it rural-only?):")
for km in (5, 10, 25, 50, 100, 200):
    d = km / 111.0
    n = con.execute(
        "SELECT COUNT(*) FROM fiber_rtree WHERE minx<=? AND maxx>=? AND miny<=? AND maxy>=?",
        (lon + d, lon - d, lat + d, lat - d),
    ).fetchone()[0]
    print(f"  within {km:>4} km: {n:>7,} segments")

print("\ntop states by segment count:")
for r in con.execute("SELECT st_code, COUNT(*) c FROM fiber GROUP BY 1 ORDER BY c DESC LIMIT 10"):
    print(f"   st_code={r[0]!r:>8}  {r[1]:>8,}")

print("\ntotal segments:", con.execute("SELECT COUNT(*) FROM fiber").fetchone()[0])
print("distinct st_code:", con.execute("SELECT COUNT(DISTINCT st_code) FROM fiber").fetchone()[0])
con.close()
