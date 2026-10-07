# 5-Parameter Fixes — Implementation Report

**Date:** 2026-10-05
**Scope:** the five highest-ROI fixes from `five-parameter-inspection.md`
**Status:** all five implemented, tested, verified

---

## 1. Verify pack hashes at runtime — DONE

**Problem.** `manifest.json` recorded a SHA-256 for every file, and
`DataPackManager.ts` declared `sha256: string` in its type — but no code ever
read it. A corrupted or truncated pack file was installed and used silently.

**What changed.**

| File | Change |
|---|---|
| `build_pack.py` | manifest now records **md5** per file alongside sha256 |
| `bootstrap.ts` | after copying each file, compares `File.size` and `File.md5` against the manifest; any mismatch throws so the pack is not marked installed |
| `DataPackManager.ts` | new `verifyInstalledPack(region)` — re-checks size + md5 on every launch, for packs bootstrap skipped because they were already installed |
| `App.tsx` | runs `verifyInstalledPack` on startup; a failure raises the warning bar |

**Why MD5 and not SHA-256.** expo-file-system v57 exposes a native `File.md5`
property but no native SHA-256. Using MD5 lets the device verify integrity with
no JS crypto implementation shipped in the bundle. SHA-256 stays in the
manifest as the canonical digest for the build pipeline. The threat model here
is corruption, not a targeted second-preimage attack on a file the attacker
would also have to replace.

**Also fixed while in there.** `bootstrap.ts` was filtering the shipped
`manifest.json` out of the copy loop and writing a stub `{region, installedAt}`
in its place. That dropped `files`, `bounds`, `region_name`, and `version` —
and `DataPackScreen.tsx` reads `item.bounds.min_lat` and `item.files.reduce(...)`,
so **opening the Data Packs screen after install would crash**. Bootstrap now
writes the full shipped manifest plus `installedAt`.

**Verified.** All 8 manifest md5 values match `md5sum` on disk. 12 new
trustworthiness checks, all passing.

---

## 2. Cap the LoS raster window — DONE

**Problem.** `loadWindowSampler` decoded the bounding box of the LoS endpoints
with no size cap. Cost grows with the square of path length: 200 km was ~17 MB
(fine), but an 800 km diagonal would be ~270 MB and get the app killed.

**What changed.**

| File | Change |
|---|---|
| `windowPlan.ts` (new) | pure planning logic — computes the window, a stride, and band size, with no RN imports so it is unit-testable |
| `RasterSampler.ts` | decodes in row-bands and strides down to `MAX_WINDOW_CELLS` (2M cells ≈ 8 MB) |

Measured with the real elevation raster:

| Path | Source window | Stride | Retained | Memory |
|---|---|---|---|---|
| 5 km | 84×85 | 1 | 7,140 | 0.03 MB |
| 25 km | 291×292 | 1 | 84,972 | 0.3 MB |
| 100 km | 1066×1070 | 1 | 1,140,620 | 4.6 MB |
| 200 km | 2099×2106 | 2 | 1,105,650 | 4.4 MB |
| 500 km | 5199×5216 | 4 | 1,695,200 | 6.8 MB |

Short paths (≤100 km, i.e. every realistic LoS target) use stride 1 — **no
quality loss**. Only paths long enough to be meaningless anyway get coarser.

**A real bug found by the new test.** The first version of the strided decode
computed the output row as `ly / stride` — relative to the band, not the source
window. Because bands start at non-zero offsets, every band rewrote output rows
0..n, leaving the array 94% NaN and returning no elevation for any point.
Fixed to stride on the absolute row (`(by + ly) % stride`). Without the test
this would have shipped as "LoS unavailable on long paths" with no explanation.

**Verified.** `test_window_cap.js` — 6/6, exercising the real planner and the
real banded decode against the shipped raster.

---

## 3. Retry button on bootstrap failure — DONE

**Problem.** A failed install showed a warning bar and nothing else. The only
recovery was deleting app data.

**What changed.**

| File | Change |
|---|---|
| `bootstrap.ts` | new `retryInstall(region)`; `installBundledPacks({force})` for a clean reinstall |
| `App.tsx` | warning bar now carries a **Retry** button with an inline spinner; retries the failed region, or force-reinstalls everything when the failure was not region-specific |

**Verified.** Covered by a new trustworthiness check.

---

## 4. Data freshness transparency — DONE

**Problem.** No file recorded when the upstream data was collected. A user
could not tell whether the tower data was 6 months or 3 years old.

**What changed.**

| File | Change |
|---|---|
| `build_pack.py` | manifest gains `source_dates` — the vintage of each dataset |
| `DataPackManager.ts` | `source_dates` added to the manifest type |
| `DataPackScreen.tsx` | each pack card now shows its capabilities and a freshness line |

```
source_dates: {
  towers:    2024-06-01   fiber:      2024-06-01
  soil:      2007-01-01   population: 2020-01-01
  elevation: 2000-02-11   basemap:    2026-10-01
}
```

Rendered as: `data as of Jan 2007` (the oldest dataset in the pack — the
honest number, since soil is the limiting vintage).

**Verified.** Two new trustworthiness checks (dates present; towers specifically).

---

## 5. Lite tier — DONE

**Problem.** One 218 MB APK, no smaller option. The base map (84 MB) and
elevation (82 MB) are 76% of it, and a user who only needs towers + soil +
population still downloads both.

**What changed.**

| File | Change |
|---|---|
| `bundle_pack.py` | `--tier full|lite`; lite drops `tiles/base-map.pmtiles` and `elevation/elevation.tif` |
| `bundle_pack.py` | rewrites the bundled manifest so it declares only the files actually shipped |
| `MapView.tsx` | missing basemap now says "this looks like a Lite pack" |
| `reportHtml.ts` | LoS section explains the Lite-tier omission instead of a bare "unavailable" |

**The critical detail.** The bundled manifest had to be rewritten, not just the
files removed. Now that the app verifies every installed file against the
manifest, a manifest still listing the excluded files would fail the integrity
check and block the install entirely. `verify_bundle.py` asserts the
`require()` map and the manifest declarations agree exactly.

**Measured result — my estimate was wrong.**

| | Full | Lite | Saving |
|---|---|---|---|
| Pack files | 245.2 MB | 78.8 MB | 166 MB |
| **APK** | **218 MB** | *see below* | — |

I predicted ~30 MB for Lite. It is **78.8 MB**, because `fiber.sqlite` alone is
63.9 MB — I had been thinking of the map and elevation as the bulk and forgot
the fiber index. Lite still saves 166 MB (68%), and a genuinely ~30 MB tier
would additionally need fiber simplified or split out.

**What Lite loses:** the map screen (clear message) and terrain-aware LoS
(towers, fiber, soil, population, admin, and RoW all still work; the report
says the LoS section needs a Full pack).

**Verified.** `verify_bundle.py` — 8/8 on the bundled lite pack.

---

## Regression

| Suite | Before | After |
|---|---|---|
| Engine tests | 40/40 | **40/40** |
| Raster tests | 9/9 | **9/9** |
| Window cap (new) | — | **6/6** |
| Physics | 19/19 | **19/19** |
| Accuracy | 28/28 | **28/28** |
| Trustworthiness | 22/22 | **34/34** (+12) |
| Usefulness | 75/76 | **75/76** |
| Bundle integrity (new) | — | **8/8** |
| **Total** | 193/194 | **219/220** |

`tsc --noEmit` clean.

## Reproduce

```bash
cd /home/lakshya/company/towerfeasibility
. .venv/bin/activate

python data-pipeline/scripts/build_pack.py --region rajasthan --output-dir dist/packs
python data-pipeline/scripts/bundle_pack.py --region rajasthan --tier lite
python data-pipeline/scripts/verify_bundle.py rajasthan

node data-pipeline/scripts/test_window_cap.js
python data-pipeline/scripts/test_trustworthiness.py
```
