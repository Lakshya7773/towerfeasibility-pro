import pandas as pd, geopandas as gpd, os

B = "/home/lakshya/company/towerfeasibility/data"

print("=== TOWERS: Tarang Sanchar (TS) ===")
df = pd.read_parquet(f"{B}/towers/TS_towers.parquet")
print("rows:", len(df))
print("cols:", list(df.columns))
print(df.head(3).to_string()[:900])

print("\n=== TOWERS: NIC ===")
df2 = pd.read_parquet(f"{B}/towers/NIC_towers.parquet")
print("rows:", len(df2))
print("cols:", list(df2.columns))
print(df2.head(2).to_string()[:600])

print("\n=== SOIL: India FAO map ===")
g = gpd.read_file(f"{B}/soil/INDIA_SOIL_MAP_FAO.geojson")
print("features:", len(g))
print("cols:", list(g.columns))
print("CRS:", g.crs)
print("FAOSOIL classes:", sorted(g['FAOSOIL'].dropna().unique())[:25])
print("total distinct classes:", g['FAOSOIL'].nunique())
print("bounds:", g.total_bounds)

print("\n=== FIBER (partial, still downloading) ===")
for f in ["BBNL_OFCs.parquet", "BBNL_OLTs.parquet", "BBNL_ONTs.parquet"]:
    p = f"{B}/fiber/{f}"
    if os.path.exists(p):
        try:
            d = pd.read_parquet(p)
            print(f"{f}: {len(d)} rows, cols={list(d.columns)[:12]}")
        except Exception as e:
            print(f"{f}: exists {os.path.getsize(p)/1e6:.1f}MB but unreadable ({type(e).__name__}) - likely partial")
    else:
        print(f"{f}: not yet")
