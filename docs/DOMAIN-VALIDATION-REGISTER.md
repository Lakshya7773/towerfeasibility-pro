# DOMAIN VALIDATION REGISTER

Every domain assumption the product relies on, its current treatment, and what
authority would be required to promote it to verified.

**Status vocabulary**
- `VERIFIED` — confirmed against an authoritative external source
- `EVIDENCE-BACKED` — grounded in a cited source, but not independently confirmed for this use
- `PRODUCT-DEFINED` — chosen by this product because no authoritative input was available
- `DOMAIN-REVIEW-REQUIRED` — no authoritative basis established; a domain expert must set it
- `NOT IMPLEMENTED` — the capability does not exist in this version

> A `PRODUCT-DEFINED` assumption must never be silently upgraded to `VERIFIED`.
> Where no authority exists, the register says so rather than inventing one.

| ID | Topic | Current Implementation | Evidence | Status | Required Authority | Impact | Product Treatment |
|----|-------|------------------------|----------|--------|--------------------|--------|-------------------|
| DV-01 | **RSRP methodology** | `Tx(46 dBm) + gain(18 dBi) − FSPL(2.1 GHz)`; no clutter, feeder, body or interference loss; terrain NOT applied | ITU-R P.525 (FSPL) cited in code | `PRODUCT-DEFINED` | RF planning engineer; operator link-budget template | High — RSRP is the number a planner may act on | Labelled "FREE-SPACE SCREENING ESTIMATE"; report §11 states terrain NOT APPLIED |
| DV-02 | **RSRP strong/weak thresholds** | None implemented | — | `NOT IMPLEMENTED` | 3GPP/operator-defined thresholds | Medium — classification would imply judgement | Report prints "RSRP classification: NOT DEFINED" |
| DV-03 | **Population density bands** | Dense urban ≥1500, Urban ≥500, Semi-urban ≥100, else Rural (per km²) | — | `PRODUCT-DEFINED` | Demographer / operator marketing | Medium — drives 3 of 10 points | Report §5 prints the classification and notes bands are product-defined |
| DV-04 | **Tower saturation bands** | Low ≤2, Medium ≤5, High ≤10, else Saturated (per km²) | — | `PRODUCT-DEFINED` | RF planning engineer | Medium — drives 3 of 10 points | Report §6 prints the classification; register records it as product-defined |
| DV-05 | **Fiber accessibility bands** | Excellent ≤1 km, Good ≤5, Fair ≤15, Poor ≤50 | — | `PRODUCT-DEFINED` | Transmission planner | Medium — drives 2 of 10 points | Report §9 states bands are product-defined |
| DV-06 | **Score weights** | population 3, saturation 3, resources 2, soil 1, LoS 1 (sum 10) | — | `PRODUCT-DEFINED` | Site-acquisition lead; calibrated against outcomes | High — determines the ranking | Report §15 lists weights as an assumption |
| DV-07 | **Verdict cut-offs** | FAVOURABLE ≥7 & no critical issue; MIXED ≥4; else UNFAVOURABLE; low-demand capped at MIXED | — | `PRODUCT-DEFINED` | Site-acquisition lead | High — determines the verdict | Report §3 + §4 expose the rule; register records it |
| DV-08 | **Soil → foundation mapping** | FAO DSMW unit → Best/Good/Fair/Poor via product table | FAO DSMW 1:5M (source); mapping itself product-defined | `PRODUCT-DEFINED` | Geotechnical engineer | Medium — 1 of 10 points | Report §10 + disclaimer state "screening only — borehole required" |
| DV-09 | **LoS geometry** | Assumed target when none supplied: +0.03°/+0.03° → ~4.5 km on ~42° NE | — | `PRODUCT-DEFINED` | RF planner (or explicit user target) | High — a fixed bearing is not a real link | Report §12 states "ASSUMED — no user-selected target" |
| DV-10 | **LoS tower/receiver heights** | 30 m tower, 1.5 m receiver, k=1 curvature, no radio refraction | Fresnel/curvature are standard equations; the *values* are product-chosen | `PRODUCT-DEFINED` | RF planner | Medium | Report §12 states the assumed heights |
| DV-11 | **RF propagation model** | Free-space (ITU-R P.525) only | ITU-R P.525 | `EVIDENCE-BACKED` (equation) / `PRODUCT-DEFINED` (its use for coverage) | RF planner; a terrain-aware model (e.g. a diffraction model) | High — FSPL overstates coverage | Report §11 labels it free-space screening |
| DV-12 | **RoW fee & timeline** | ₹10,000 fee + ₹100 street furniture; 45-day approval, 67-day deemed approval | DoT Telecommunications (RoW) Rules, 2024, as encoded | `EVIDENCE-BACKED` | State RoW officer / legal | Medium — state variations not modelled | Report §19 labels it a product-encoded checklist, not verified against a live portal |
| DV-13 | **Commercial feasibility** | None | — | `NOT IMPLEMENTED` | Operator finance / business case | Critical — no investment claim may be made | Report §20 prints "COMMERCIAL FEASIBILITY: NOT ASSESSED" |
| DV-14 | **Coverage need / network opportunity** | Not computed (no coverage layer) | — | `NOT IMPLEMENTED` | RF planner; operator coverage data | High — a low tower count may be whitespace or obligation | Report §7 prints "Not assessed" |
| DV-15 | **Population raster accuracy** | WorldPop 2020, 1 km, modelled | WorldPop 2020 (CC-BY-4.0) | `EVIDENCE-BACKED` | Census authority for ground truth | Medium — modelled, not counted | Report §5 states "modelled, not a census" |
| DV-16 | **Tower registry completeness** | Tarang Sanchar 2022 snapshot | DoT EMF portal (via community extraction) | `EVIDENCE-BACKED` (existence) / completeness unverified | DoT / operator | High — undercount affects saturation | Report §6 + disclaimer state 2022 vintage and unverified completeness |
| DV-17 | **Fiber completeness** | BharatNet/BBNL public only | BBNL | `EVIDENCE-BACKED` (public network) / private fiber absent | Operator transmission | High — "Poor" ≠ no fiber | Report §9 states private fiber is not represented |
| DV-18 | **Soil map scale adequacy** | 1:5M FAO DSMW | FAO DSMW | `EVIDENCE-BACKED` (dataset) / scale adequacy for siting is not established | Geotechnical engineer | Medium | Report §10 + disclaimer state screening-only |

## Summary

| Status | Count | IDs |
|--------|-------|-----|
| `VERIFIED` | 0 | — |
| `EVIDENCE-BACKED` | 7 | DV-11 (equation), DV-12, DV-15, DV-16, DV-17, DV-18, and the source side of DV-08 |
| `PRODUCT-DEFINED` | 10 | DV-01, DV-03, DV-04, DV-05, DV-06, DV-07, DV-08 (mapping), DV-09, DV-10, DV-11 (use) |
| `NOT IMPLEMENTED` | 3 | DV-02, DV-13, DV-14 |

**No item in this register is `VERIFIED`.** Every scoring band, weight and
cut-off is a product choice. That is acceptable for a screening tool **provided
it is disclosed**, which is why each row names where the report exposes it.

**DOMAIN VALIDATION REQUIRED** for: DV-01, DV-02, DV-03, DV-04, DV-05, DV-06,
DV-07, DV-08, DV-09, DV-10, DV-13.
