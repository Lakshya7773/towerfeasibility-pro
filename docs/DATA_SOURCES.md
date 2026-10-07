# TowerFeasibility Pro — Acquired Datasets

**Date:** 2026-10-04
**Scope:** Full India
**Status:** Acquired & verified

All paths relative to `/home/lakshya/company/towerfeasibility/data/`.

---

## 1. TOWERS (Feature 2 — Competitor Tower Density)

### Primary — Tarang Sanchar (DoT registry)
| File | Size | Format |
|---|---|---|
| `towers/TS_towers.parquet` | 20.1 MB | Parquet |
| `towers/TS_towers.pmtiles` | 12.5 MB | PMTiles (z/x/y vector) |

- **Source:** `https://tarangsanchar.gov.in` (DoT EMF portal)
- **Acquired via:** `ramSeraph/indian_communications` release tag `cell-towers`
- **License:** CC0 1.0 (attribute DataMeet + original govt source)
- **Coverage:** All India cell tower locations
- **Caveat:** Data from **2022**; may be incomplete. The DoT portal itself has no bulk export — this is the community extraction.

### Secondary — NIC / BharatMaps
| File | Size | Format |
|---|---|---|
| `towers/NIC_towers.parquet` | 6.1 MB | Parquet |
| `towers/NIC_towers.pmtiles` | 3.8 MB | PMTiles |

- **Source:** `https://bharatmaps.gov.in` (NIC), ArcGIS layer `Street/StreetMap/MapServer/1056`
- **License:** CC0 1.0
- **Caveat:** **Incomplete in urban areas**; some fields removed as PII. Use as a cross-check, not the primary.

### Tile endpoints (for reference)
- Tarang: `https://indianopenmaps.com/not-so-open/cell-towers/tarangsanchar/{z}/{x}/{y}.pbf`
- NIC: `https://indianopenmaps.com/not-so-open/cell-towers/nic/{z}/{x}/{y}.pbf`

---

## 2. FIBER (Feature 3 — Nearby Resources)

### Primary — BharatNet / BBNL OFC (national) — ✅ VERIFIED
| File | Size | Rows | Notes |
|---|---|---|---|
| `fiber/BBNL_OFCs.parquet` | 221 MB | **370,878 segments** | **National OFC routes** — core fiber layer |
| `fiber/BBNL_OFCs.pmtiles` | 6.9 MB | — | Upstream vector tiles |
| `fiber/processed/fiber_india.geojsonl` | 309 MB | 370,878 | For tippecanoe / custom tiling |
| `fiber/processed/fiber_index.sqlite` | — | 370,878 | **R*Tree index for offline nearest-fiber queries** |

**Verified schema** (BBNL_OFCs.parquet):
`objectid, cs, name, type, asset_code, olt_code, blk_code, dt_code, st_code,`
`seg_length, start_node, s_coil_len, end_node, e_coil_len, traverse, phase, owner, geometry, bbox`

- **`dt_code` = district code, `st_code` = state code** → lets us split fiber per district/state pack directly
- **`olt_code`** → links each segment to its Optical Line Terminal (exchange)
- **`owner`** → operator (BBNL etc.)
- **`phase`**, **`seg_length`** → build phase and segment length
- **Source:** Bharat Broadband Network Ltd (BBNL) / BharatNet
- **Acquired via:** `ramSeraph/indian_communications` release tag `bharatnet`
- **License:** Govt open data (attribute DataMeet + BBNL)

### Supplementary — state fiber networks
| File | Coverage |
|---|---|
| `fiber/GatiShakti_PMWANI_Hotspots.parquet` | PM-WANI public WiFi hotspots |
| `fiber/TNGIS_TANFINET_Links/Nodes.parquet` | Tamil Nadu state fiber |
| `fiber/APSFL_BBNL_Phase2_OFCs.parquet` | Andhra Pradesh state fiber |

### Supplementary — OpenStreetMap
- Extract from the India PBF with tag **`telecom:medium=fibre`**
- ⚠️ **The blueprint's tag `cable=telecom` is WRONG** — OSM telecom cables are tagged `telecom:medium=fibre` / `telecom=exchange` / `man_made=mast`. Correct in T0.2.3.
- License: ODbL

**Gap noted:** BBNL is rural/backbone-heavy. **Urban private fiber (Jio/Airtel/Vi) is not publicly available** — no open dataset exists. The app must treat fiber as "nearest known route" and allow manual field entry.

---

## 3. SOIL (Feature 6 — Soil Analysis)

### Primary — Soil TYPE (Indian classification)
| File | Size | Notes |
|---|---|---|
| `soil/INDIA_SOIL_MAP_FAO.geojson` | 2.65 MB | **634 soil mapping units**, FAO DSMW 1:5M |

- **Properties:** `FAOSOIL` (FAO class code), `DOMSOI` (dominant soil), `PHASE1`/`PHASE2`, `SQKM` (area)
- **License:** FAO-Open
- **This is the soil *type* layer** → maps to Red/Black/Alluvial etc. for the blueprint's classification.

### Primary — Soil PROPERTIES (engineering)
- **Source:** ISRIC SoilGrids (global, 250 m, 6 depths)
- **Files:** `https://files.isric.org/soilgrids/latest/data/{property}/{property}_{depth}_mean/`
- **Properties:** clay, sand, silt, phh2o (pH), soc (organic carbon), bdod (bulk density), nitrogen
- **License:** CC-BY-4.0
- **Fallback soil type:** `https://files.isric.org/soilgrids/latest/data/wrb/<Class>/` (WRB classes)

> ⚠️ **DO NOT use the SoilGrids REST point API** — it returns `null` for all India coordinates (verified: Ajmer/Delhi/Mumbai/Chennai all null; Netherlands returns 475). Use the bulk GeoTIFF tiles or WCS.

> ⚠️ **Report disclaimer required:** SoilGrids is a 250 m global *model* — screening input only. A borehole / plate-load test is required before foundation design. State this in the PDF.

---

## 4. Also acquired / available

| Layer | Source | Size |
|---|---|---|
| Population | WorldPop 2020 1 km `ind_pd_2020_1km.tif` | 18 MB (all India) |
| Elevation | Copernicus GLO-30 DEM (AWS, open) | 38 MB / 1° tile |
| Admin boundaries | india-geodata `data/administrative/` (states→habitations) | varies |
| Power | OSM `power=line` + india-geodata `data/energy/` | varies |
| Roads | OSM + india-geodata `data/infrastructure/` (PMGSY, NH, SOI) | varies |

---

## Licensing summary

| Dataset | License | Commercial use | Attribution |
|---|---|---|---|
| Tarang towers (TS) | CC0 1.0 | ✅ | DataMeet + DoT |
| NIC towers | CC0 1.0 | ✅ | DataMeet + NIC |
| BBNL fiber | Govt open | ✅ | BBNL + DataMeet |
| FAO soil map | FAO-Open | ✅ | FAO/UNESCO |
| SoilGrids | CC-BY-4.0 | ✅ | ISRIC |
| OSM | ODbL | ✅ | © OpenStreetMap contributors |
| WorldPop | CC-BY-4.0 | ✅ | WorldPop |
| Copernicus DEM | Open (ESA) | ✅ | ESA |

**All datasets permit commercial use with attribution.** No share-alike contamination in the primary stack (OpenCelliD CC-BY-SA was avoided).

---

## Known gaps

1. **Urban private fiber** (Jio/Airtel/Vi) — not publicly available anywhere. Manual entry required.
2. **Tower data is 2022-vintage** — will undercount recent 5G rollout. Deep-link to Tarang portal for verification.
3. **Soil is screening-grade** — not a geotechnical survey.
4. **NIC towers incomplete in cities** — use TS as primary.
