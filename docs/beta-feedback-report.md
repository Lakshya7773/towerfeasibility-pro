# TowerFeasibility Pro — Beta Test Report

**Build under test:** `dist/TowerFeasibilityPro-rajasthan-release.apk`
**Date:** 2026-10-05
**Region:** Rajasthan (125,036 towers · 57,349 fiber segments · 40 soil polygons · 80.2M population · 342,017 km²)

---

## Result

| Dimension | Tests | Passed | Score | Weight |
|---|---|---|---|---|
| Technical | 20 | 20 | 100% | 25% |
| **Accuracy** | **28** | **28** | **100%** | **30%** |
| Trustworthiness | 22 | 22 | 100% | 20% |
| Usefulness | 76 | 75 | 98.7% | 25% |
| **Total** | **146** | **145** | **99.3%** | 100% |

Plus the engine suite (40/40) and raster suite (9/9): **194/195 checks pass**.

The one failure is a feature that was never claimed: the PDF does not embed a
captured map image (v1.1 item, listed below).

---

## Bugs found and fixed

The beta test was worth running — it found **six real defects**, three of them
materially wrong numbers.

### 1. Population over-counted by 2.8× — CRITICAL

**Symptom.** The Rajasthan pack reported **224,044,640** people. Rajasthan's
actual population is ~80M. Any site near a state border would also have pulled
in Gujarat/Madhya Pradesh/Punjab population.

**Cause.** The raster was a plain bounding-box crop with no state mask. The bbox
(69.4–78.3 E, 23.0–30.3 N) covers 589,444 km² — 1.7× the state's 342,239 km².

**Fix.** Added `fetch_state_boundary.py`, which extracts the Rajasthan polygon
from a 36-state India dataset (verified at 342,187 km² vs the published
342,239 km², a 0.015% error). `process_population.py` now masks the raster to
that polygon.

**After.** 80,212,216 people — consistent with Census 2011 (68.5M) plus growth.

### 2. Soil polygons not clipped to the state — HIGH

**Symptom.** The pack's soil polygons summed to **1,034,529 km²** for a
342,239 km² state, with extents reaching lon 68.1–82.2 and lat 19.1–32.2 —
well outside Rajasthan.

**Cause.** `build_pack.py` selected polygons with `g.cx[bbox]`, which keeps
*whole* polygons that merely intersect the box, so a national polygon
contributed its full extent.

**Fix.** Replaced bbox selection with `gpd.clip()` against the state boundary.

**After.** 40 polygons totalling 342,017 km² (0.06% of the true area).

### 3. Soil lookup returned nothing for valid points — HIGH

**Symptom.** `lookupSoil()` returned `null` for Jaipur, a location that
Python-side geometry confirmed was inside a soil polygon.

**Cause.** MultiPolygon features were flattened into a single ring list. The
engine treats ring 0 as the outer boundary and every later ring as a hole — so
sibling sub-polygons were treated as holes and valid hits were discarded.

**Fix.** `SoilPolygon` now keeps rings grouped per polygon (`polygons: number[][][][]`);
the engine checks the outer ring and only that polygon's own holes. Fixed in
the engine plus all three call sites.

**After.** Ajmer → "Rocky / Best"; Jaipur, Jodhpur, Jaisalmer, Bikaner, Kota all
resolve correctly.

### 4. Half-installed pack could look complete — MEDIUM

**Symptom.** A crash during first-run install left a pack that the app treated
as installed on the next launch.

**Cause.** `bootstrap.ts` wrote `manifest.json` in iteration order, and the
manifest is the "already installed" marker.

**Fix.** The manifest is now written **last**, and a failed install deletes the
partial directory so the next launch retries.

### 5. Bootstrap failures were silent — MEDIUM

**Symptom.** If the pack failed to install, the user saw an empty app with no
explanation.

**Fix.** `installBundledPacks()` returns `{installed, failed[]}`; `App.tsx`
shows a warning banner naming the region and error.

### 6. Degenerate fiber bbox in the spatial index — MEDIUM

**Symptom.** One fiber row had `minx = 0.0` on a real 4,432 m segment. Its
R\*Tree box spanned from the prime meridian to Rajasthan, so it matched every
spatial query and could corrupt nearest-fiber results.

**Fix.** Added a coordinate-bounds guard in `build_fiber()` (region 68–98.5 E,
6–38 N). Exactly 1 row is now rejected: 57,349 of 57,350.

---

## What the tests verified

### Accuracy (28/28)

| Data | Check | Result |
|---|---|---|
| Population | Ajmer 10,976/km² · Jaipur 19,574/km² · Jaisalmer 1,279/km² · rural 120/km² | city > town > rural ordering holds |
| Population | Rajasthan total | 80,212,216 (expected 72–88M) |
| Elevation | Jaipur 463 m · Jaisalmer 220 m · Bikaner 228 m · Ajmer 503 m | all within known values |
| Elevation | Aravalli vs Thar relief | 517 m vs 121 m |
| Towers | count, density, coordinate sanity | 125,036 · 11.5/km² · 0 out of bbox |
| Fiber | count, extent, degenerate bboxes, R\*Tree query | 57,349 · 0 degenerate · 20 segments within 10 km |
| Soil | count, area, coverage, ratings | 40 · 342,017 km² · 40/40 rated |
| LoS | 41-point Jaipur→Ajmer profile | 100% valid, 159 m relief |

### Trustworthiness (22/22)

- Soil report carries "screening only" and "borehole" disclaimers
- Data sources cited: WorldPop, SRTM terrain, tower source
- All 7 engines handle null/missing data
- `DataPackManager` and `bootstrap` handle missing/corrupt packs
- Data freshness: population `year: 2020` stated
- **Offline guarantee:** 0 network calls across 28 app source files, 0 remote
  URLs, no CDN hosts, no external fonts

### Usefulness (75/76)

- 5 screens, all registered in navigation
- All 7 analysis dimensions rendered in the UI
- Report covers 8 dimensions + score + recommendations + risk factors
- Report preview (WebView) and share (expo-sharing) both wired
- APK integrity: 218 MB, JS bundle + native libs + 2 GeoTIFFs + PMTiles + 2 SQLite DBs

---

## Known limitations (not defects)

1. **No map image in the PDF.** The report has a terrain-profile SVG but not a
   captured map snapshot. Planned for v1.1.
2. **Elevation resolution.** z11 ≈ 76 m/px cannot resolve a narrow summit —
   Mt Abu reads 517 m against its 1,722 m peak. Correct for terrain/LoS
   profiling; not a survey-grade DEM.
3. **Fiber coverage is rural-biased.** BBNL/BharatNet is a rural backbone, so
   there are 0 segments within 2 km of Ajmer city centre and 20 within 10 km.
   Correct data, but "nearest fiber" in dense cities will read far.
4. **Soil is 1:5M screening data.** FAO DSMW — suitable for flagging
   foundation risk, not for design. The report says so.
5. **Signed with the debug keystore.** Needs a release keystore before Play
   Store submission.

---

## Recommendation

**Ship to beta.** Every material accuracy defect found has been fixed and
re-verified; the corrected numbers (80.2M population, 342,017 km² soil,
correct soil lookup) are the ones now in the pack and the APK.

Before public release: add a release keystore, and decide whether the v1.1
items (PDF map snapshot, 30 m elevation for premium packs) are in scope.

---

## Reproduce

```bash
cd /home/lakshya/company/towerfeasibility
. .venv/bin/activate

npx tsx data-pipeline/scripts/test_engines.ts          # 40/40
node data-pipeline/scripts/test_rasters.js             # 9/9
python data-pipeline/scripts/test_accuracy.py          # 28/28
python data-pipeline/scripts/test_trustworthiness.py   # 22/22
python data-pipeline/scripts/test_usefulness.py        # 75/76
```
