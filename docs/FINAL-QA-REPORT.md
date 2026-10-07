# Final QA & Release-Gate Report — TowerFeasibility Pro

**Role:** HERMES — Autonomous QA, Validation, Reliability & Release Engineer
**Test date:** 2026-10-06
**Auditor stance:** adversarial. The objective was to *disprove* release-readiness.

---

## 1. Application

| Field | Value |
|---|---|
| Name | TowerFeasibility Pro |
| Package | `com.digitalshift.towerfeasibility` |
| Version | 1.0.0 (versionCode 1) |
| Build identifier | `release` variant, `assembleRelease` |
| Artifact | `dist/TowerFeasibilityPro-rajasthan-release.apk` |
| Size | 228,042,453 bytes (217.5 MiB) |
| SHA-256 | `2ba62bf03f2061a7ef0e3f4c046079b489cc47e8b8722db8d8bb42f8128c9d47` |
| Architecture | React Native / Expo (SDK 57), Hermes engine |
| ABI | `arm64-v8a` only |
| minSdk / targetSdk | 24 / 36 |
| Offline design | build-time Python pipeline → per-region data pack → app; zero runtime API calls |

### System map (discovered)

```
app/src/
  app/App.tsx                 navigation + bootstrap retry
  data/
    bootstrap.ts              first-run pack copy + size/MD5 verification
    DataPackManager.ts        pack discovery, integrity re-check, storage
    PackLoader.ts             loads towers.sqlite, fiber.sqlite, soil.geojson, rasters
    RasterSampler.ts          GeoTIFF decode (full + windowed/banded)
    windowPlan.ts             pure memory-bounding logic for raster windows
  analysis/
    towerEngine.ts            competitor density (bbox pre-filter + haversine)
    populationEngine.ts       WorldPop disc integration
    resourceEngine.ts         nearest fiber (R*Tree + geometry decode)
    losEngine.ts              LoS / Fresnel / curvature / FSPL / RSRP
    soilEngine.ts             FAO polygon point-in-polygon
    rowEngine.ts              Right-of-Way rules (DoT 2024)
    adminEngine.ts            state/district authority lookup
    runAnalysis.ts            orchestrator (7 dimensions)
  report/
    ReportBuilder.ts          weighted scoring + assembly
    reportHtml.ts             pure HTML renderer (+ terrain SVG)
  utils/
    geo.ts                    haversine, bbox, Fresnel, FSPL, curvature
    wkb.ts                    geometry decoding (WKT + WKB)
  components/map/MapView.tsx  MapLibre GL JS in a WebView (PMTiles via local protocol)
  screens/                    Home, DataPack, Map, Analysis, Report
data-pipeline/scripts/        build_pack.py, bundle_pack.py, process_*, test_*, qa_*
```

**Entry point:** `App.tsx` → bootstrap → Home → Map (pick site) → runAnalysis → Analysis → Report → export.

---

## 2. Environment

| Field | Value |
|---|---|
| OS | Linux 7.0.0-31-generic |
| CPU | 2 cores |
| RAM | 3.3 GB (hard constraint; Gradle OOM-kills easily) |
| Storage | ~68 GB |
| Node | v24.21.0 |
| TypeScript | project tsc, `--noEmit` clean |
| Python | 3.12.14 (venv `.venv`) |
| Android SDK | build-tools 34/35/36; compileSdk 36 |
| Gradle | 9.3.1, isolated `GRADLE_USER_HOME=~/.gradle-tf` |
| Independent verifiers | pyproj 3.8.0 (PROJ geodesic), rasterio, numpy |
| **Device / emulator** | **NONE — no adb device, no emulator binary, no system image** |

---

## 3. Test Summary

| Suite | Checks | Pass | Fail |
|---|---|---|---|
| Unit — engines (`test_engines.ts`) | 40 | 40 | 0 |
| Physics (`test_physics.ts`) | 19 | 19 | 0 |
| Rasters (`test_rasters.js`) | 9 | 9 | 0 |
| Window cap (`test_window_cap.js`) | 6 | 6 | 0 |
| **Core adversarial (`qa_suite_core.ts`)** | 169 | 169 | 0 |
| **Defect regression (`qa_regression.ts`)** | 37 | 37 | 0 |
| **Adversarial / negative (`qa_adversarial.ts`)** | 71 | 71 | 0 |
| Accuracy (`test_accuracy.py`) | 28 | 28 | 0 |
| Trustworthiness (`test_trustworthiness.py`) | 34 | 34 | 0 |
| Usefulness (`test_usefulness.py`) | 76 | 75 | 1 |
| Bundle integrity (`verify_bundle.py`) | 8 | 8 | 0 |
| **Data integrity (`qa_data_integrity.py`)** | 37 | 37 | 0 |
| **TOTAL** | **534** | **533** | **1** |

The single failure is a **documented, pre-existing v1.1 item** ("Report includes
map snippet" — the report intentionally contains no map image). It is not a
regression and is not release-blocking; see §6.

Build: `assembleRelease` **SUCCESSFUL**, 4m53s, 389 tasks, 0 errors.
`tsc --noEmit`: **clean**.

---

## 4. Defects Found and Fixed

Six defects were reproduced with independent evidence, root-caused, fixed, and
locked into `qa_regression.ts`. Three were **CRITICAL/HIGH** and each produced a
materially misleading feasibility result.

### D1 — CRITICAL — Fiber analysis was 100% broken

- **Symptom:** every site reported *"No BharatNet fiber within 50 km"*.
- **Evidence:** `fiber.geom` is declared `BLOB` but all **57,349 rows store WKT
  text**. The WKB-only parser returned `null` for every row; `nearestFiber()`
  treated `null` as "no feature". Probe: **7/7 sites failed** — Ajmer reported
  no fiber while fiber was **3.742 km** away.
- **Impact:** fiber accessibility always `Poor`, resource score always 1/5, and
  a false "backhaul will need a new build" issue raised for every site — costing
  2 of 10 score points and changing every recommendation.
- **Fix:** `utils/wkb.ts` now sniffs and parses **WKT and WKB**, and accepts the
  JS **string** that `expo-sqlite` returns for that column.
- **After:** 7/7 sites match SQL ground truth; engine 3.742 km vs vertex-truth
  3.738 km.

### D2 — HIGH — WKB point count read with the wrong endianness

- **Evidence:** `Reader.uint32()` inferred endianness from the byte *before* the
  field (`getUint8(pos-1)`), so a little-endian LineString's point count was read
  big-endian.
- **Fix:** byte-order flag is passed through explicitly.
- **After:** little- and big-endian WKB both decode; regression-tested.

### D3 — HIGH — Tower counts used a square bbox as a disc

- **Evidence:** density = (bbox row count) / πr². A bbox is 4r², not πr², so
  density was over-counted by up to **4/π (27%)**. Worst observed **2.0×**
  (7 towers reported in a 1 km radius where the disc holds 4). This
  **misclassified Jodhpur** (Medium instead of Low) and flipped its score.
- **Fix:** bbox pre-filter in SQL, then an exact haversine filter in JS.
- **After:** engine 1 km count == independent disc count at every site
  (Jaipur 58 vs bbox 76; Ajmer 41 vs bbox 51).

### D4 — HIGH — "Nearest tower" was not the nearest

- **Evidence:** the 5 km neighbour query had `LIMIT 400` with **no `ORDER BY`**.
  Jaipur has ~1,283 towers within 5 km, so SQLite returned an arbitrary 400.
  The reported nearest was **#44480 at 1.639 km**; the true nearest was
  **#44516 at 0.177 km** — a **9.3×** error.
- **Fix:** removed the `LIMIT`; sort by true distance in JS.
- **After:** Jaipur reports #44516 @0.177 km — the true nearest.

### D5 — HIGH — LoS height recommendation was insufficient

- **Evidence (two bugs):**
  1. the far endpoint of the sight line was computed from the terrain at the
     *current* sample, so the "straight line" bent to follow the ground;
  2. the recommendation was `currentHeight + deficit`, ignoring that raising the
     antenna lifts the line by only `(1 − t)`.
  On a flat 11 km path the engine recommended **40 m**; re-running at 40 m
  returned **Marginal** — the path does not clear until **105 m**.
- **Fix:** the line now runs between the two antenna tips; the required height is
  solved directly with a 5 m margin (capped at 120 m).
- **After:** recommends **110 m**, and re-running at 110 m returns **Clear**
  (true clearance height 104.9 m). Regression-tested by re-evaluation.

### D6 — MEDIUM — Population integration ignored the raster origin

- **Evidence:** the grid walk used `cellLat = (iy+0.5)*step`, assuming origin
  (0°,0°). The raster origin is lat **30.2996**, an offset of **3,636 rows** —
  it summed one set of cells while sampling a different part of the map.
  Divergence vs independent integration: **up to 6.23%** (Ajmer 98,598 vs 92,815).
- **Fix:** the sampler exposes its true origin; latitude decreases with row for
  north-up rasters.
- **After:** **0.000–0.001%** divergence at all 7 sites.

### D7 — MEDIUM — NaN fell through to the worst/best classification

- **Evidence:** every `if (x < t)` is false for NaN, so `classifySaturation(NaN)`
  returned **Saturated** (worst) and `classifyDensity(NaN)` returned **Dense
  urban** (most favourable) — silently inflating or deflating the score from
  unknown data. `fsplDb(d, 0)` returned `-Infinity`.
- **Fix:** all classifiers guard with `Number.isFinite`; the score builder emits
  an explicit "density unavailable" finding instead of "NaN/km²".

### D8 — MEDIUM — A corrupt pack could crash the analysis

- **Evidence:** a fiber store missing `fiber_rtree` threw out of
  `analyzeResources`, taking down the whole analysis.
- **Fix:** falls back to an unindexed bbox scan, then to "no fiber" — never a
  false "fiber available" claim.

### D9 — MEDIUM (release process) — Shipped APKs contained pre-fix code and were debug-signed

- **Evidence:** `dist/*.apk` (Oct 5 23:46) predated the fixes (Oct 6 10:20–10:44).
  Bundle probe: `decodeLineGeom`, `originLat`, and the NaN-guard strings were
  **absent**. `apksigner --print-certs` showed **`CN=Android Debug`**.
- **Fix:** forced a clean rebundle (Metro had cached a stale JS bundle — the
  build reported SUCCESS while packaging old code), rebuilt, and shipped.
  The stale Lite APK was **withdrawn** to `dist/_withdrawn/` because it contains
  the defect-laden code and cannot be rebuilt (its pack assets were replaced).

### D10 — LOW — WKT parser silently dropped malformed vertices

- **Fix:** a geometry containing any non-finite vertex is now rejected entirely
  rather than silently returning a shorter (wrong) line.

---

## 5. Validation

### 5.1 Mathematical correctness — PASS (independently verified)

Verified against **external** implementations, not the app's own code:

| Quantity | Independent reference | Result |
|---|---|---|
| Haversine distance | **PROJ / pyproj 3.8.0** `Geod.inv` (10 cases incl. antimeridian, poles, equator) | max **0.371%** error — within the 0.6% spherical-vs-ellipsoid bound |
| Population disc integral | independent grid walk + **rasterio** | **0.000–0.001%** at 7 sites |
| Fresnel radius, FSPL | closed-form / ITU-R P.525 | exact (19 physics tests) |
| RSRP | independent link budget | exact |
| Tower disc count | independent haversine count | exact at every site |
| Uniform-raster integral | analytic density × πr² | 0.08% (grid discretisation only) |

> The suite's original "Vincenty" reference was itself **wrong** (it returned
> 635 km for a 125 km leg). It was replaced with PROJ output; the app was right.

### 5.2 Data integrity — PASS

All 37 checks pass on the shipped pack: schema, uniqueness, nulls, WGS84 bounds,
Rajasthan envelope, bbox ordering, R*Tree population, ring closure, raster CRS,
nodata masking, plausible aggregates (population total **80,212,216**), PMTiles
magic header. The `geom`-declared-BLOB-but-actually-TEXT condition is now
**detected and documented**, not silent.

### 5.3 Engineering / RF logic — ASSUMPTION-BASED

Correctly implements documented assumptions; **not** validated against measured
telecom data. Full register in `docs/ASSUMPTIONS.md` (36 entries). Key ones:
tower height 30 m, target 1.5 m, 2.1 GHz, Tx 46 dBm, antenna gain 18 dBi,
60% Fresnel, refractive k=1 (conservative). RSRP ignores feeder/body loss,
interference and clutter — it is a **free-space estimate**.

### 5.4 Commercial / financial logic — **NOT APPLICABLE**

The codebase contains **no** CAPEX, OPEX, revenue, ARPU, ROI, payback, NPV or
subscriber model. The report makes **no financial claims**. There is nothing to
validate. (Section 10/27 of the brief does not apply to this product as built.)

### 5.5 Offline operation — PASS (static) / **UNTESTED at runtime**

- Hand-written app source contains **zero** `fetch`, `XMLHttpRequest`, `axios`,
  `WebSocket`, or absolute `http(s)` URLs.
- Map tile and glyph sources use local protocols (`pmtiles://local`,
  `localglyph://`) with in-memory handlers — no remote fallback.
- All 9 pack files ship inside the APK (Gradle-hashed names) and are served from
  app storage.
- **The release APK declares `android.permission.INTERNET`** (React Native
  default). The app is *designed* not to use it, but the permission is present.
- **Not verified on a device** — no emulator/device available (see §7).

### 5.6 Security — PASS

| Check | Result |
|---|---|
| Network calls in app source | none |
| Hardcoded secrets / keys / tokens | none |
| `eval` / `new Function` / dynamic `require` | none |
| SQL injection | all queries parameterised; no string-built SQL |
| XSS in report | all values HTML-escaped; `<script>` in a site name is escaped |
| Path traversal | `region` comes only from the bundled generated map; no user-controlled path |
| Malicious import | no file-import / document-picker surface exists |
| Malformed geometry | fuzzed (500 random buffers) — never throws, returns `null` |
| Corrupt pack | degrades gracefully, never claims false availability |

### 5.7 Performance — PASS (bounded by design)

Measured on the real pack (desktop Node; on-device will differ):

| Operation | Time | Peak RSS |
|---|---|---|
| `analyzeTowers` (Jaipur, dense) | 47 ms | +1.5 MB |
| `analyzeResources` (fiber) | 6 ms | +0.0 MB |
| `analyzePopulation` (2/5/10 km) | 4 ms | +0.0 MB |
| `lookupSoil` (40 polygons) | 5 ms | +0.0 MB |
| `buildReport` + HTML | 163 ms | +5.4 MB |
| Decode population raster (1068×876) | 824 ms | +24 MB |

Raster window bounding works as designed: a **200 km** LoS path decodes a
**4.6 MB** window (stride 2) instead of the ~270 MB an unbounded read would need.

### 5.8 Regression — PASS

All 12 suites green; 534 checks, 1 documented non-blocking failure.
`tsc --noEmit` clean. Every fix has a permanent regression test
(`qa_regression.ts`, 37 checks against the **real** pack).

---

## 6. Known Limitations (explicitly NOT validated)

1. **No real-world telecom validation.** No professionally validated feasibility
   report, drive-test, or field measurement exists. All classifications and the
   overall score are **model outputs**.
2. **No on-device / runtime testing.** No device or emulator was available. The
   APK was verified structurally (signature, alignment, permissions, bundle
   contents, asset presence) but **never executed**.
3. **Release-signed with the debug keystore** (`CN=Android Debug`). Fine for
   sideloading; **not** suitable for Play Store distribution — it cannot be
   updated later under a different key.
4. **`INTERNET` permission is declared** although the app does not use it.
5. **Tower registry completeness unknown.** Tarang Sanchar (2022 vintage) may
   undercount recent builds; ~9,941 sub-30 m near-duplicate pairs exist.
6. **Fiber completeness unknown.** Only BharatNet/BBNL public OFC; urban private
   fiber is absent, so urban fiber distance is an over-estimate.
7. **Soil is a 1:5M FAO screening map**, not a geotechnical survey. The report
   carries the required "borehole required" disclaimer.
8. **RoW fees/timelines** are encoded from DoT 2024 rules; state variations are
   not modelled and were not verified against a live portal.
9. **Scoring weights** (pop 3 / saturation 3 / resources 2 / soil 1 / LoS 1) are
   a **product judgement**, not a published standard.
10. **No financial model exists** — the product makes no ROI/payback claim.
11. **One usability test fails** ("Report includes map snippet") — a documented
    v1.1 item; the report intentionally has no map image.
12. **Rajasthan only.** No other state pack was built or tested in this audit.

---

## 7. Release Decision

# GO — with mandatory conditions

### Justification

The release criteria are met on the axes that can be verified in this
environment:

| Criterion | Status |
|---|---|
| Build | **PASS** — clean `assembleRelease`, 0 errors |
| Unit tests | **PASS** — 40/40 |
| Integration / E2E (engine level) | **PASS** — real pack driven through all 7 engines + report |
| Data integrity | **PASS** — 37/37 |
| Calculation QA | **PASS** — verified against PROJ, rasterio, closed forms |
| RF / domain logic | **PASS** (implements documented assumptions) |
| Commercial logic | **N/A** — no financial model exists |
| Offline operation | **PASS** (static) — no network surface; **untested at runtime** |
| Security | **PASS** |
| Performance | **PASS** — bounded, measured |
| Stress / adversarial | **PASS** — 71/71 |
| Regression | **PASS** — 534 checks |
| Report validation | **PASS** — values identical to the engine model |
| Critical bugs | **0** |
| Blocking high bugs | **0** |

**All 6 defects that would have blocked release were found and fixed**, and the
shipped APK was rebuilt from clean so it actually contains the fixes. The
previous `dist/` artifact **did not** — that was itself a release blocker.

### Why GO and not NO-GO

No unresolved critical or blocking-high defect remains. The critical fiber
defect, the density misclassification, the nearest-tower error and the LoS
height error are all fixed and regression-locked. Nothing found in this audit
leaves a *materially misleading feasibility result* in the shipped build.

### Mandatory conditions attached to this GO

1. **Runtime smoke test on a physical arm64 device is REQUIRED before any
   external release.** This audit could not execute the APK. Install it, run the
   full workflow (bootstrap → pick Ajmer → analysis → report → export) with
   **airplane mode ON**, and confirm no network request and no crash. Treat the
   GO as *conditional on that result*.
2. **Do not publish to the Play Store with this artifact** — it is debug-signed.
   Generate a real release keystore first.
3. **Remove `android.permission.INTERNET`** (and the storage permissions, if
   unused) before shipping, so the manifest matches the offline claim.
4. **The Lite APK must be rebuilt** from the fixed source before distribution;
   the current one is withdrawn.
5. **Every threshold in `docs/ASSUMPTIONS.md` marked ASSUMPTION-BASED / LOW
   must be reviewed by a telecom domain engineer** before output is used for a
   real investment decision.

### Explicit non-claims

This GO does **not** assert that the feasibility results are *real-world
accurate*. It asserts that the software correctly and reliably computes what it
claims to compute, from verified data, without the defects found here — and that
the underlying assumptions remain unvalidated against measured telecom data.

---

## 8. Artifacts

| Path | Description |
|---|---|
| `dist/TowerFeasibilityPro-rajasthan-release.apk` | Corrected Full build (SHA-256 `2ba62bf0…`) |
| `dist/_withdrawn/TowerFeasibilityPro-rajasthan-lite.apk` | Withdrawn — contains pre-fix code |
| `docs/ASSUMPTIONS.md` | 36-entry assumptions & thresholds register |
| `docs/FINAL-QA-REPORT.md` | This report |
| `data-pipeline/scripts/qa_suite_core.ts` | 169-check adversarial core suite |
| `data-pipeline/scripts/qa_regression.ts` | 37-check defect regression suite |
| `data-pipeline/scripts/qa_adversarial.ts` | 71-check negative/degenerate suite |
| `data-pipeline/scripts/qa_data_integrity.py` | 37-check dataset audit |
| `data-pipeline/scripts/qa_perf.ts` | performance measurement |
| `data-pipeline/scripts/qa_probe_*.{ts,py}` | the evidence probes for D1–D8 |

### Reproduce

```bash
cd /home/lakshya/company/towerfeasibility
. .venv/bin/activate
npx tsx data-pipeline/scripts/qa_suite_core.ts
npx tsx data-pipeline/scripts/qa_regression.ts
npx tsx data-pipeline/scripts/qa_adversarial.ts
npx tsx data-pipeline/scripts/test_engines.ts && npx tsx data-pipeline/scripts/test_physics.ts
node data-pipeline/scripts/test_rasters.js && node data-pipeline/scripts/test_window_cap.js
python data-pipeline/scripts/test_accuracy.py
python data-pipeline/scripts/test_trustworthiness.py
python data-pipeline/scripts/test_usefulness.py
python data-pipeline/scripts/verify_bundle.py
python data-pipeline/scripts/qa_data_integrity.py
(cd app && npx tsc --noEmit)
```
