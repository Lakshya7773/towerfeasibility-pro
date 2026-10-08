# TowerFeasibility Pro — Master QA Report

**Date:** 2026-10-07  
**App Version:** 1.0.0 (versionCode 1)  
**Package:** com.digitalshift.towerfeasibility  
**Min SDK:** 24 (Android 7.0)  
**Target SDK:** 36 (Android 16)  
**ABI:** arm64-v8a  

> **See also:** `docs/PHASE-1-7-PROFESSIONAL-VALIDATION.md` — the professional/conceptual
> validation and remediation pass (defects D-1…D-10, deterministic decision object,
> provenance register, traceability matrix). Where the two documents differ on test counts,
> the Phase 1–7 report is the later measurement.

---

## 1. Executive Summary

TowerFeasibility Pro is a fully offline Android app for telecom tower site feasibility analysis. This QA mission covered functional test design, engineering calculation validation, regression testing, multi-device matrix design, and release artifact validation.

**Overall Verdict: READY WITH KNOWN LIMITATIONS**

### What was actually executed (evidence-backed)

| Phase | Status | Evidence |
|-------|--------|----------|
| 2 — Functional | ⚠️ **SPECIFIED, NOT TARGETED-EXECUTED** | 20 tests defined; only Robo smoke crawl has run |
| 3 — Engineering | ✅ **EXECUTED (locally + in CI)** | 83 golden + 40 engines + 19 physics; CI run 37649478219 logs `GOLDEN TEST RESULTS: 83 passed, 0 failed, 2 blocked` |
| 4 — Regression | ✅ **EXECUTED (locally + in CI)** | 572+ checks pass, 1 pre-existing non-blocking; CI job green |
| 5 — Device matrix | ⚠️ **SPECIFIED, NOT EXECUTED** | 5 devices defined; only SmallPhone.arm API 35 has run |
| 6 — Release | ✅ **ARTIFACT VALIDATED / ⚠️ RUNTIME UNVERIFIED** | APK **and** AAB built, signed, ABI/packaging/permissions/secrets verified; neither launched on a device |

### Honest limitations

Per the mission's final rule, production readiness requires functional tests + engineering validation + regression + device compatibility + release build validation. As of this report:

- Engineering validation and regression are **genuinely executed and green**.
- Functional tests exist as an executable specification (Robo directives) but have **not been run as targeted tests** — the passing Robo run was a smoke crawl, which is weaker evidence.
- The device matrix is **defined but not executed**; only one device has ever run the app.
- The release APK has been **statically validated** (signature, ABI, permissions, bundled assets) but **has never been launched on a device**. A release-validation path now exists (`docs/RELEASE-VALIDATION.md`) — Robo + targeted functional tests + the 5-device matrix against the signed release APK — but it needs the signing secrets before it can run.

The two domain-validation items (RSRP thresholds, commercial model) require telecom/business expert input and are not defects.

**This is not a "production ready" declaration.** It is: engineering core verified, release artifact sound on inspection, and the remaining validation steps (targeted functional, device matrix, release-on-device) identified and specified but not yet executed.

---

## 2. Test Environment

| Component | Value |
|-----------|-------|
| OS | Linux (x86_64) |
| Node.js | 24.x |
| Python | 3.12 |
| Gradle | 9.3.1 |
| Android SDK | 36.0.0 |
| NDK | 27.1.12297006 |
| Test Lab Device | SmallPhone.arm (API 35) |
| Data Pack | Rajasthan (125,036 towers, 57,349 fiber segments) |

---

## 3. Functional Test Results (Phase 2)

**Status:** SPECIFICATION COMPLETE — 20 functional tests defined

| Test ID | Name | Severity | Status |
|---------|------|----------|--------|
| FT-001 | App launch | P0 | ✅ Defined |
| FT-002 | Location selection | P0 | ✅ Defined |
| FT-003 | Coordinate input | P0 | ✅ Defined |
| FT-004 | Invalid coordinates | P1 | ✅ Defined |
| FT-005 | Rajasthan boundary | P1 | ✅ Defined |
| FT-006 | Run feasibility analysis | P0 | ✅ Defined |
| FT-007 | Tower information | P1 | ✅ Defined |
| FT-008 | Network opportunity | P1 | ✅ Defined |
| FT-009 | Report sections / scoring | P1 | ✅ Defined (scope corrected) |
| FT-010 | Report generation | P0 | ✅ Defined |
| FT-011 | PDF export | P1 | ✅ Defined |
| FT-012 | Back/navigation | P1 | ✅ Defined |
| FT-013 | Repeated analysis | P1 | ✅ Defined |
| FT-014 | Missing/empty data | P2 | ✅ Defined |
| FT-015 | Network/API failure | P0 | ✅ Defined |
| FT-016 | Offline behavior | P0 | ✅ Defined |
| FT-017 | Map behavior | P1 | ✅ Defined |
| FT-018 | Large dataset | P1 | ✅ Defined |
| FT-019 | Empty search/no result | P2 | ✅ Defined |
| FT-020 | Full end-to-end journey | P0 | ✅ Defined |

**Execution:** Tests are executed via Firebase Test Lab Robo tests. See `docs/FUNCTIONAL-TEST-SPEC.md`.

---

## 4. Engineering Calculation Results (Phase 3)

**Status:** 83 PASSED, 0 FAILED, 2 BLOCKED

### 4.1 Geo / Distance (17 tests)
- ✅ Haversine distance calculations
- ✅ Bounding box generation
- ✅ Circle area calculations
- ✅ Point-to-segment distance
- ✅ Earth curvature drop and bulge
- ✅ Fresnel zone radius
- ✅ Free-space path loss
- ✅ Invalid coordinate handling

### 4.2 Tower Density (14 tests)
- ✅ Saturation classification boundaries (Low/Medium/High/Saturated)
- ✅ NaN handling (safe fallback to Low)
- ✅ Real pack data validation (125,036 towers)
- ✅ Tower counts at Ajmer (76 within 1km, 264 within 2km, 1283 within 5km)
- ✅ Density calculation

### 4.3 RSRP / RF (9 tests)
- ✅ FSPL at various distances
- ✅ RSRP calculation
- ✅ Edge cases (zero distance, zero frequency, negative values)
- ⚠️ BLOCKED: RSRP strong/weak thresholds (no authoritative threshold in app source)

### 4.4 Network Opportunity (7 tests)
- ✅ Accessibility classification (Excellent/Good/Fair/Poor)
- ✅ NaN handling
- ✅ Real fiber data validation (57,349 segments)

### 4.5 Population (12 tests)
- ✅ Density classification boundaries (Rural/Semi-urban/Urban/Dense urban)
- ✅ NaN handling
- ✅ Synthetic raster integration
- ✅ Tower-proxy fallback

### 4.6 Elevation / LoS (7 tests)
- ✅ Flat terrain analysis
- ✅ Handheld target analysis
- ✅ Obstructed path detection
- ✅ Null sampler handling
- ✅ Profile generation (65 points)
- ✅ Path loss calculation
- ✅ Recommended tower height

### 4.7 Soil (3 tests)
- ✅ Soil polygon count (40)
- ✅ Soil lookup at Ajmer
- ✅ Ocean lookup returns null

### 4.8 RoW (3 tests)
- ✅ Application fee (₹10,000)
- ✅ Deemed approval timeline (67 days)
- ✅ Required documents list

### 4.9 Commercial Feasibility (8 tests)
- ✅ Good site scoring (9.5/10, Go)
- ✅ Bad site scoring (1.7/10, No-Go)
- ✅ Conditional site scoring (6.7/10, Conditional)
- ✅ NaN input handling
- ⚠️ BLOCKED: CAPEX/OPEX/revenue model (not in app source)

### 4.10 End-to-End Golden Cases (5 tests)
- ✅ Ajmer golden case (score 5, Conditional, saturated market flagged)
- ✅ Rural site golden case (score 6, no fiber flagged)

---

## 5. Regression Results (Phase 4)

**Status:** ALL PASSING

| Test Suite | Command | Tests | Result |
|------------|---------|-------|--------|
| qa_suite_core | `npx tsx` | 169 | ✅ PASS |
| qa_regression | `npx tsx` | 37 | ✅ PASS |
| qa_adversarial | `npx tsx` | 71 | ✅ PASS |
| test_engines | `npx tsx` | 40 | ✅ PASS |
| test_physics | `npx tsx` | 19 | ✅ PASS |
| test_golden | `npx tsx` | 83 | ✅ PASS (2 blocked) |
| test_rasters | `node` | 9 | ✅ PASS |
| test_window_cap | `node` | 6 | ✅ PASS |
| test_map_pmtiles | `node` | 1 | ✅ PASS |
| test_accuracy | `python` | 28 | ✅ PASS |
| test_trustworthiness | `python` | 34 | ✅ PASS |
| qa_data_integrity | `python` | all | ✅ PASS |
| test_usefulness | `python` | 75/76 | ⚠️ 1 non-blocking (headless map capture) |

**Total: 497 scripted checks + data-integrity + 75 usefulness = 572+, all passing (1 pre-existing non-blocking)**

All counts above were verified by running each suite locally and reading its actual summary line — not carried over from the report.

---

## 6. Device/API Compatibility Results (Phase 5)

**Status:** MATRIX DEFINED — 5 devices, 7 scenarios

| Device | Model | API | Resolution | Status |
|--------|-------|-----|------------|--------|
| DEV-001 | SmallPhone.arm | 35 | 1280x720 | ✅ Defined |
| DEV-002 | MediumPhone.arm | 35 | 2400x1080 | ✅ Defined |
| DEV-003 | Pixel2.arm | 33 | 1920x1080 | ✅ Defined |
| DEV-004 | MediumTablet.arm | 34 | 2560x1600 | ✅ Defined |
| DEV-005 | SmallPhone.arm | 30 | 1280x720 | ✅ Defined |

**Execution:** Tests are executed via Firebase Test Lab Robo tests. See `docs/DEVICE-TEST-MATRIX.md`.

---

## 7. Debug Build Results

**Status:** ✅ PASS

| Field | Value |
|-------|-------|
| Build Time | 13m 43s |
| APK Size | 218 MB |
| Test Lab Run | 37635634941 |
| Device | SmallPhone.arm (API 35) |
| Result | PASS |
| Exit Code | 0 |
| Duration | 15m 25s |

---

## 8. Release Build Results

**Status:** ✅ Artifact validated (APK + AAB) — ⚠️ runtime not verified

| Field | Value |
|-------|-------|
| APK Path | dist/TowerFeasibilityPro-rajasthan-release.apk |
| APK Size | 228,063,909 bytes (217.5 MB) |
| APK SHA-256 | 5ae63c24e06b2d45b3b5bf98e418b781375defe027f2f68f2676b4cc2e6cd27b |
| AAB Path | app/android/app/build/outputs/bundle/release/app-release.aab |
| AAB Size | 216,308,696 bytes (206 MB) |
| AAB SHA-256 | ab186f3c4b79e491e36474be4ea280ea41326e0d55ad5a0fe2769d1836c2f2f0 |
| Package | com.digitalshift.towerfeasibility |
| Version | 1.0.0 (versionCode 1) |
| Min SDK | 24 |
| Target SDK | 36 |
| ABI | arm64-v8a only |
| Signature | CN=TowerFeasibility Pro, OU=Engineering, O=DigitalShift, L=Jaipur, ST=Rajasthan, C=IN |
| Permissions | READ_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW, VIBRATE, WRITE_EXTERNAL_STORAGE |
| INTERNET | Removed (fully offline) |
| Debuggable | false |
| Minify | false |
| Shrink Resources | false |

### 8.1 Bundled Data Pack Verification

The data pack is packaged as Android resources (`res/`) with obfuscated names — this is normal AAPT2 behaviour for `require()`d Expo assets, and it means the pack **is** present. Verified entries:

| Pack file | APK entry | Size |
|-----------|-----------|------|
| base-map.pmtiles | `res/4L.pmtiles` | 84,198,164 B |
| elevation.tif | `res/iq.tif` | 82,182,295 B |
| fiber.sqlite | `res/kL.sqlite` | 63,852,544 B |
| towers.sqlite | `res/LC.sqlite` | 13,283,328 B |
| population.tif | `res/k-.tif` | 1,469,498 B |
| soil.geojson | `res/h6.geojson` | 202,284 B |
| JS bundle | `assets/index.android.bundle` | 5,230,792 B |

Runtime resolution path: `bundledPacks.generated.ts` → `require('../../assets/packs/...')` → `Asset.fromModule()` → `installFromAssets()` copies to `<document>/data-packs/data-pack-rajasthan/`. Verified that `DataPackManager.installFromAssets` handles this correctly.

### 8.2 Release Artifact Static Scan

| Check | Result |
|-------|--------|
| Package / application ID | ✅ `com.digitalshift.towerfeasibility` |
| versionCode / versionName | ✅ 1 / "1.0.0" |
| compileSdk / targetSdk | ✅ 36 / 36 |
| minSdk | ✅ 24 |
| ABI | ✅ `arm64-v8a` only (no x86) |
| Debuggable flag | ✅ Absent (not debuggable) |
| INTERNET permission | ✅ Absent (fully offline) |
| Embedded secrets (API keys, private keys, tokens) | ✅ None found |
| Dev-only endpoints | ✅ None active — `localhost:8081`/`metro`/`__DEV__` appear once each as library constants, not live endpoints |
| app.config | ✅ No dev plugins (no expo-dev-client) |
| Signing cert | ✅ CN=TowerFeasibility Pro, O=DigitalShift, valid |

Scan method: extracted `assets/index.android.bundle` and `assets/app.config` and grepped for `http(s)://` hosts, `__DEV__|localhost|127.0.0.1|10.0.2.2|metro|expo-dev`, and secret patterns (`AIza…`, `sk-…`, `ghp_…`, PEM private keys).

### 8.3 AAB (Play Store artifact) — built and validated

The mission's Phase 6 asks for the Play Store artifact. The existing
`release.yml` workflow builds **only an APK**; no `bundleRelease` step exists.
An AAB was therefore built locally with the production keystore and validated:

| Field | Value |
|-------|-------|
| Path | `app/android/app/build/outputs/bundle/release/app-release.aab` |
| Size | 216,308,696 bytes (206 MB) |
| SHA-256 | `ab186f3c4b79e491e36474be4ea280ea41326e0d55ad5a0fe2769d1836c2f2f0` |
| Signature | ✅ `jar verified.` — CN=TowerFeasibility Pro, O=DigitalShift |
| ABI | ✅ `base/lib/arm64-v8a/` only — **zero** x86 entries |
| Entries | 1,193 files, 315 MB uncompressed |
| Data packs | ✅ present in readable form under `base/res/raw/` |

Data packs inside the AAB (readable names, unlike the APK's obfuscated `res/*`):

| Pack file | AAB entry | Size |
|-----------|-----------|------|
| base-map.pmtiles | `base/res/raw/assets_packs_datapackrajasthan_tiles_basemap.pmtiles` | 84,198,164 B |
| elevation.tif | `base/res/raw/assets_packs_datapackrajasthan_elevation_elevation.tif` | 82,182,295 B |
| fiber.sqlite | `base/res/raw/assets_packs_datapackrajasthan_vectors_fiber.sqlite` | 63,852,544 B |
| towers.sqlite | `base/res/raw/assets_packs_datapackrajasthan_vectors_towers.sqlite` | 13,283,328 B |
| population.tif | `base/res/raw/assets_packs_datapackrajasthan_population_population.tif` | 1,469,498 B |
| soil.geojson | `base/res/raw/assets_packs_datapackrajasthan_vectors_soil.geojson` | 202,284 B |
| JS bundle | `base/assets/index.android.bundle` | 5,230,792 B |

**Build note (test-environment defect, resolved):** the first `bundleRelease`
attempt failed with `java.lang.OutOfMemoryError: Java heap space` in
`AabFlinger` (the bundle packager holds all ~294 MB of entries in memory).
The `-Xmx512m` heap used for APK builds is too small for AAB packaging;
`-Xmx1400m` succeeded in 8m 30s. This is a build-environment constraint, not an
app defect — CI runners have ample RAM and are unaffected.

### 8.4 Not Yet Validated

Neither the release APK nor the AAB has been **installed or launched on any
device**. Static inspection confirms both are well-formed, correctly signed, and
correctly packaged, but runtime release behaviour (launch, analysis, report, PDF
export) is **unverified**, and therefore the **debug-vs-release behavioural
comparison cannot be made**. This is the single largest remaining gap.

### 8.5 CI Workflow Gap — release pipeline is non-functional

`release.yml` produces only an APK, and **it cannot run at all** in CI. A manual
dispatch (run `37654787377`) was executed to test it:

```
✓ Set up job
✓ Run actions/checkout@v4
✓ Run actions/setup-node@v4
✓ Run actions/setup-java@v4
✓ Set up Android SDK / NDK
✓ Install JS dependencies
X Decode release keystore          ← ##[error]KEYSTORE_BASE64 secret is not set
- Build release APK                (skipped)
```

**Root cause:** the four repository secrets the workflow requires are not set:
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
The workflow's own header documents how to create the first one:

```bash
base64 -w0 ~/.keystore/towerfeasibility-release.keystore | gh secret set KEYSTORE_BASE64
```

**Impact:** there is no automated path to a signed release artifact. The release
APK and AAB in §8 were produced **locally**, where the keystore is available.
Anyone else — or any future CI run — cannot reproduce them until the secrets are
set.

**Also missing:** no `bundleRelease` step, so CI would produce only an APK even
once the secrets exist.

**Not fixed in this pass:** setting signing secrets is a credential operation and
requires explicit approval (mission stop-condition: "a signing/release credential
is required"). See §13.

---

## 9. Known Defects

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| DEF-001 | P3 | test_usefulness: headless map capture fails | Pre-existing, non-blocking |

### 9.1 Product Scope Gap (not a defect)

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| GAP-001 | — | **No commercial feasibility module.** The mission brief's Phase 3 section I and FT-009 call for CAPEX / OPEX / revenue / ROI / payback validation. Grep of `app/src/` finds **no** such implementation — the only "revenue" reference is a scoring rationale comment in `ReportBuilder.ts:26`. The product ships a 5-dimension *technical* score (population max 3, saturation max 3, resources max 2, soil max 1, LoS max 1) and an 8-section report. | Confirmed absent from source |

This is a **scope gap, not a failing test**. The functional test FT-009 was
corrected to assert what the product actually implements. A commercial module
would be new feature work, not a bug fix — it requires domain authority for the
financial assumptions (see §11).

**Impact on release readiness:** the app is a *technical* feasibility tool, not
a full techno-commercial (TCM) analysis. If the product is intended to produce a
commercial business case, that capability is missing entirely.

---

## 10. Blocked Tests

| ID | Name | Reason |
|----|------|--------|
| C6 | RSRP strong/weak thresholds | No authoritative RSRP threshold defined in app source |
| I8 | CAPEX/OPEX/revenue model | No commercial model in app source (see GAP-001) |

---

## 11. Domain Validation Required

| Item | Description | Required From |
|------|-------------|---------------|
| RSRP Thresholds | Strong/weak signal classification boundaries. The app computes RSRP from `txPower + gain - FSPL` but defines **no** strong/weak classification boundary. | Telecom RF Engineer |
| Commercial Model | CAPEX, OPEX, revenue, ROI, payback. **Not implemented at all** (GAP-001). Assumptions must come from the business, not be invented. | Business/Finance Domain Expert |
| Tower Density Thresholds | The app's saturation bands (Low <2, Medium 2-5, High 5-10, Saturated ≥10 towers/km²) are hardcoded in app source. They are *consistent* and *tested*, but their provenance is not documented as an external standard. | Telecom Network Planner |
| Population Density Bands | Rural <100, Semi-urban 100-500, Urban 500-1500, Dense urban ≥1500 per km². Same situation: internally consistent, tested, but not traceable to a cited standard. | Domain authority |

---

## 12. Release Blockers

| ID | Severity | Blocker | Detail |
|----|----------|---------|--------|
| RB-001 | **P1** | Release artifact never executed on a device | The passing Test Lab run used the *debug* build. Phase 6 requires debug-vs-release comparison; neither the release APK nor the AAB has been launched. |
| RB-002 | **P2** | CI release pipeline cannot build | `release.yml` fails at `Decode release keystore` — `KEYSTORE_BASE64` (+ 3 others) are not set. No automated path to a signed artifact. |
| RB-003 | **P2** | No AAB in CI | `release.yml` has no `bundleRelease` step; Play Store artifact is not produced by any workflow. |

None of these are application defects. RB-001 needs Test Lab quota; RB-002/RB-003
need credential approval and a small workflow change.

---

## 13. Recommended Fixes

Ordered by value per unit of effort.

| # | Fix | Effort | Unblocks |
|---|-----|--------|----------|
| 1 | Run the release APK through Firebase Test Lab (manual dispatch already wired) | 1 Test Lab run | RB-001 — the single biggest evidence gap |
| 2 | Execute the 5-device matrix (`docs/device-test-matrix.sh`) | ~5 Test Lab runs | Phase 5 compatibility evidence |
| 3 | Set the 4 release secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) | 5 min, **needs approval** | RB-002 |
| 4 | Add a `bundleRelease` step + `.aab` upload to `release.yml` | Small workflow edit | RB-003 |
| 5 | Run the 20 functional tests as targeted Robo directives rather than a smoke crawl | Medium | Stronger Phase 2 evidence |
| 6 | Implement a commercial feasibility module | **New feature** — needs domain authority for CAPEX/OPEX/revenue assumptions | GAP-001 |
| 7 | Define and document RSRP strong/weak thresholds | Needs RF domain authority | C6 |
| 8 | Document the provenance of the tower-saturation and population-density bands | Needs domain authority | §11 |

Items 6-8 must **not** be implemented by inventing values — see the mission's
rule 4 and 5.

---

## 14. Final Release Readiness

### Verdict: **READY WITH KNOWN LIMITATIONS**

**What is verified:**
- ✅ App builds successfully — debug APK, release APK, and release AAB
- ✅ Release APK and AAB are production-signed (`jar verified.` for the AAB)
- ✅ arm64-v8a only in both artifacts; zero x86
- ✅ Data packs correctly bundled in both artifacts
- ✅ INTERNET permission absent — genuinely offline
- ✅ No embedded secrets or active dev endpoints in the release bundle
- ✅ All 572+ regression checks pass (1 pre-existing non-blocking)
- ✅ 83 golden engineering tests pass, executed locally **and** in CI
- ✅ Firebase Test Lab Robo test passes (SmallPhone.arm, API 35) — debug build
- ✅ All 8 report sections implemented; 5-dimension scoring tested

**What is NOT verified (and why the verdict is not "READY"):**
- ❌ **Neither the release APK nor the AAB has been launched on a device.**
  The passing Test Lab run exercised the *debug* build only. Debug-vs-release
  behavioural comparison — explicitly required by Phase 6 — could not be made.
- ❌ The 5-device compatibility matrix is specified but unexecuted.
- ❌ The 20 functional tests are specified (as Robo directives) but have not
  been run as targeted tests; the passing run was a smoke crawl.
- ⚠️ RSRP thresholds and the (entirely absent) commercial model require domain
  authority before they can be validated or implemented.

**Why not "NOT READY":** there is no evidence of a defect. Everything that could
be executed is green, and both release artifacts are structurally sound.

**Why not "READY":** the mission's own bar — functional + engineering +
regression + device compatibility + release build validation — is not yet met.
Two of the five gates (device compatibility, release-on-device) are unexecuted.

**Minimum path to "READY":** run the release APK through Firebase Test Lab and
execute the 5-device matrix. Both require only quota, not code changes.

---

## 15. Test Infrastructure

| Component | Location |
|-----------|----------|
| Golden Tests | data-pipeline/scripts/test_golden.ts |
| Functional Test Spec | docs/FUNCTIONAL-TEST-SPEC.md |
| Device Test Matrix | docs/DEVICE-TEST-MATRIX.md |
| CI Workflow | .github/workflows/ci.yml |
| Release Workflow | .github/workflows/release.yml |
| Test Lab Workflow | .github/workflows/firebase-test-lab.yml |
| Pull Artifact Script | data-pipeline/scripts/pull_ci_artifact.sh |

---

**Report Generated:** 2026-10-07  
**QA Mission Status:** COMPLETE
