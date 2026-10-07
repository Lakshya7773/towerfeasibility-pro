# PHASE 1–7 PROFESSIONAL VALIDATION

**TowerFeasibility Pro** · independent assessment and remediation
**Date:** 2026-10-07 · **App** v1.0.0 · **Algorithm** 1.1.0
**Method:** source inspection, documented-assumption review, empirical execution of the
real engines, and independent calculation cross-checks. Production code was changed
**only** to fix defects identified by this audit — never to make a test pass.

---

## 1. WHAT WAS DONE

| Phase | Scope | Outcome |
|---|---|---|
| 1 | Software & mathematical correctness | Re-verified; no new defects. Geometry validated against independent references (see §4). |
| 2 | Data integrity & provenance | **Defect fixed:** manifest claimed towers = 2024 (source is 2022). Single authoritative registry created. |
| 3 | Data quality & evidence quality | Confidence framework implemented (HIGH/MEDIUM/LOW/UNKNOWN) with explainable reasons. |
| 4 | Engineering / telecom methodology | RF explicitly labelled free-space; terrain NOT applied to RSRP; documented. |
| 5 | Scoring & decision logic | Refactored to expose exact per-dimension contributions **without changing any score**. |
| 6 | Explainability / "why engine" | Deterministic decision object built; report restructured to 20 evidence-first sections. |
| 7 | Professional validation | This document. |

### Defects fixed in this pass

| ID | Defect | Fix |
|---|---|---|
| **D-1** | Manifest `source_dates.towers = 2024-06-01` while the source registry is **2022** — a build date masquerading as a data vintage | New `provenance.py` single source of truth; both shipped manifests corrected to `2022`; regression test `test_provenance.ts` |
| **D-2** | LoS ran on a **hidden fixed bearing** (`+0.03/+0.03` ≈ 4.47 km @ 42° NE) and the report printed the distance as if site-specific | Path bearing + `targetAssumed` flag computed and **disclosed**; report states "ASSUMED — no user-selected target" |
| **D-3** | Verdict badge said **Go / No-Go** — investment language on a purely technical model | Replaced with `FAVOURABLE / MIXED / UNFAVOURABLE / INSUFFICIENT DATA (technical screening)`; "COMMERCIAL FEASIBILITY: NOT ASSESSED" everywhere |
| **D-4** | **Low-demand site scored 7.8 → FAVOURABLE** ("Go") — low competition at an empty area read as opportunity | Low-demand guard: rural/sparse density caps the verdict at MIXED with an explicit explanation |
| **D-5** | Missing data scored neutrally and produced a mid-band **MIXED** verdict with no flag | `INSUFFICIENT DATA` state + `UNKNOWN` confidence + explicit warnings |
| **D-6** | Score had **no contribution breakdown**; report was numbers-first | Deterministic contribution object; report §4 shows exact points summing to the score |
| **D-7** | No confidence indicator; stale data scored identically to fresh | Evidence-quality confidence framework with per-factor reasons |
| **D-8** | No sensitivity analysis (report said "not computed") | Deterministic ±20% perturbation of the continuous drivers → ROBUST / SENSITIVE |
| **D-9** | Vintages never shown to the user | Report §13 renders source, type, vintage, resolution and limitation per dataset |
| **D-10** | Release CI could not build a signed AAB and used a heap that OOMs | `bundleRelease` added; heap raised to `-Xmx2048m` with the reason documented |

---

## 2. INDEPENDENT VERDICTS

| Dimension | Verdict |
|---|---|
| **SOFTWARE CORRECTNESS** | **READY** |
| **DATA & PROVENANCE** | **READY** (vintage defect fixed; provenance now visible and test-guarded) |
| **ENGINEERING METHODOLOGY** | **PARTIALLY READY** |
| **TELECOM METHODOLOGY** | **PARTIALLY READY** |
| **EXPLAINABILITY** | **READY** |
| **PROFESSIONAL DECISION SUPPORT** | **PARTIALLY READY** |
| **COMMERCIAL FEASIBILITY** | **NOT IMPLEMENTED** |
| **ANDROID RUNTIME** | **READY** (Robo PASS on SmallPhone.arm API 35; release APK not yet device-executed — see blockers) |
| **RELEASE REPRODUCIBILITY** | **PARTIALLY READY** (pipeline implemented; blocked on repository secrets) |

No single collapsed score is offered, by design.

---

## 3. EVIDENCE — TEST EXECUTION

Executed this session (real output, not asserted):

| Suite | Result |
|---|---|
| `qa_suite_core.ts` | **193 / 193** (was 169; +24 adversarial verdict checks) |
| `test_golden.ts` | **83 / 83**, 2 blocked (domain authority) |
| `test_provenance.ts` | **43 / 43** (new) |
| `qa_regression.ts` | **37 / 37** |
| `qa_adversarial.ts` | **71 / 71** |
| `test_engines.ts` | **40 / 40** |
| `test_physics.ts` | **19 / 19** |
| `test_rasters.js` | **9 / 9** |
| `test_window_cap.js` | **6 / 6** |
| `test_map_pmtiles.js` | PASS |
| `qa_data_integrity.py` | all checks passed (37) |
| `test_accuracy.py` | **28 / 28** |
| `test_trustworthiness.py` | **34 / 34** |
| `test_usefulness.py` | **75 / 76** (1 documented v1.1 item: embedded map snippet) |
| **Total** | **≈ 700 checks, 1 known non-blocking** |

End-to-end render check (Ajmer coordinates, real Rajasthan pack metadata):
score **8.9**, contributions `population 3.0 + saturation 3.0 + resources 1.6 + soil 0.8 + LoS 0.5 = 8.9` (exact),
20 sections, provenance + NOT-ASSESSED + assumed-target disclosures present, **zero** placeholders.

Two `test_golden` checks remain **BLOCKED — DOMAIN VALIDATION REQUIRED**:
`C6` (RSRP thresholds) and `I8` (commercial model). They are not failures; they
assert that no authority exists.

---

## 4. ADVERSARIAL SCORE RESULTS (mission §8)

Executed against the real engine:

| Case | Scenario | Score | Verdict |
|---|---|---|---|
| A | High population + low tower density | 10.0 | **FAVOURABLE** ✅ |
| B | High population + high tower density | 8.0 | **MIXED** ✅ |
| **C** | **Very low population + very low density** | **7.8** | **MIXED** ✅ (was FAVOURABLE — fixed) |
| C2 | Semi-urban + low density | 8.5 | FAVOURABLE (demand present — correct) |
| D/E | Commercial good vs poor | — | **NOT ASSESSED** (no model; not invented) |
| F | Missing population + tower data | 5.0 | **INSUFFICIENT DATA** ✅ (was MIXED — fixed) |

---

## 5. WHAT THE PRODUCT KNOWS, AND HOW STRONGLY

**FACT** — tower locations (2022 registry), fiber distances (BharatNet), soil unit (FAO 1:5M),
elevation (SRTM).
**COMPUTED** — distances, densities, terrain profile, Fresnel clearance, FSPL, score.
**ASSUMPTION** — all classification bands, all weights, all verdict cut-offs, the soil→foundation
mapping, the LoS target geometry and heights, the RF link budget.
**INFERENCE** — the screening verdict, the confidence level.

**Nothing in the product is `VERIFIED` against an authoritative standard.** The full list is in
`docs/DOMAIN-VALIDATION-REGISTER.md` (18 items; 0 verified, 10 product-defined, 3 not implemented).

---

## 6. FINAL PRODUCT POSITIONING

> **An offline first-pass telecom site screening tool.** It characterises demand, existing
> tower presence, backhaul proximity, terrain line-of-sight and soil screening at a coordinate,
> and produces a transparent, reproducible technical screening report with full provenance,
> stated confidence and explicit unknowns.

It does **not** predict coverage, does **not** assess commercial viability, and does **not**
replace a site survey. Appropriate users: planning and site-acquisition staff performing an
initial triage. Not appropriate as the sole basis for a build decision.

---

## 7. FINAL RELEASE STATUS

| Question | Answer |
|---|---|
| Can the app reliably execute what it implements? | **Yes.** 700 checks, offline, signed, arm64-v8a, INTERNET permission absent. |
| Are the engineering/telecom methods evidenced and defined? | **Partly.** Every method is now *defined and disclosed*; none is validated against an authoritative telecom standard. |
| Can a professional use the recommendation as decision support? | **As triage only.** The verdict is explicitly a technical screen with no commercial basis. |
| Does the app model economics? | **No.** Stated as NOT ASSESSED. |
| Has output been validated against field measurements? | **No.** No drive-test or ground-truth data exists. |

---

## 7b. RELEASE ARTIFACT — REBUILT AND VERIFIED (this pass)

Built from the changed source on this machine, then statically validated:

| Field | Value |
|---|---|
| Path | `app/android/app/build/outputs/apk/release/app-release.apk` |
| Size | 228,094,829 bytes (217 MB) |
| SHA-256 (prefix) | `b1fad281ffbc44ce…` |
| Signature | `CN=TowerFeasibility Pro, OU=Engineering, O=DigitalShift, C=IN` — SHA-384/RSA 4096 |
| ABI | **arm64-v8a only** (no x86/x86_64 libs) |
| `android.permission.INTERNET` | **absent** (offline confirmed) |
| Build | `assembleRelease`, Gradle 9.3.1, `-Xmx512m`, 11m 17s, BUILD SUCCESSFUL |

**Stale-bundle check** (unpacked `assets/index.android.bundle` and searched it):
the changed report strings are present — `COMMERCIAL FEASIBILITY: NOT ASSESSED`,
`Data Provenance`, `FREE-SPACE SCREENING ESTIMATE`,
`screening simulation on an assumed target`, `FAVOURABLE`, `INSUFFICIENT DATA`.
The only remaining `No-Go` in the bundle is the internal legacy `Recommendation`
type (retained because the golden suite asserts it); **no user-visible Go/No-Go
label remains**.

This proves the fixes shipped into the actual artifact, not just the source.

---

## 8. BLOCKERS

| ID | Blocker | Needs |
|---|---|---|
| **B-1** | CI release pipeline cannot run — `KEYSTORE_BASE64` / `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` are not set as repository secrets | Owner to add 4 secrets |
| **B-2** | Release APK/AAB never launched on a device (only the debug build has been Robo-tested) | Firebase Test Lab run against the release artifact |
| **B-3** | 5-device matrix specified but unexecuted | Test Lab quota |
| **B-4** | 20 functional test specs written but not run as targeted tests | Test-lab instrumentation |

---

## 9. DOMAIN VALIDATION REQUIRED

RSRP methodology (DV-01) · RSRP thresholds (DV-02) · population bands (DV-03) ·
tower-saturation bands (DV-04) · fiber bands (DV-05) · score weights (DV-06) ·
verdict cut-offs (DV-07) · soil→foundation mapping (DV-08) · LoS geometry (DV-09) ·
LoS heights (DV-10) · **all commercial assumptions (DV-13)**.

None may be invented. Each is a `PRODUCT-DEFINED` assumption, disclosed in the report.

---

## 10. KNOWN LIMITATIONS

1. RF is free-space only; terrain is computed but **not applied** to RSRP.
2. Tower registry is 2022 vintage; completeness unverified.
3. Urban private fiber is not represented.
4. Population is modelled, not a census.
5. Soil is 1:5M screening; a borehole is required.
6. No coverage, capacity, interference, power or road-access layer exists.
7. LoS uses an assumed target geometry unless the caller supplies one.
8. Confidence is an evidence-quality judgement, not a statistical interval.
9. The score is a fixed weighted sum; no calibration against real site outcomes exists.

---

## 11. NEXT VERSION PRIORITIES

1. **Apply terrain to RSRP** (currently the largest gap between what the app computes and what it implies).
2. **Explicit LoS target selection** in the UI (bearing + distance, or a map-picked far end).
3. **Calibrate the bands and weights** against real site outcomes — the single highest-value domain task.
4. **Wire the release secrets** and run the release artifact through Test Lab.
5. **Add the road/power layers** or state their absence as a first-class gap in the report.
6. **Embed a map snippet** in the PDF (the one non-blocking usefulness item).

---

## 12. DECLARATION

This validation did **not**:
- modify a test merely to make it pass (three test defects were corrected *because the
  tests were wrong*, and each correction is annotated in the source);
- invent a telecom threshold, commercial figure or regulatory rule;
- upgrade a product-defined assumption to "verified";
- hide a limitation to obtain a GO.

**The purpose was to establish exactly what the product knows, why it knows it, how well it can
be reproduced, how strong the evidence is, what it does not know, and what decision it is
actually qualified to support.** The answer is: a well-built, honest, offline **screening**
tool — with a commercial model that does not exist and a domain-validated methodology that does
not yet exist either.
