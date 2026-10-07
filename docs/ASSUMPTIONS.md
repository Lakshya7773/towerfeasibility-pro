# Assumptions & Thresholds Register

Every tunable constant and domain assumption the analysis engines rely on, with
its validation status. **Nothing here is field-validated against measured
telecom data.** Read each `VALIDATION STATUS` before treating a number as truth.

Legend for confidence:
- **HIGH** — value is a physical/mathematical constant or follows from a
  published definition; independently verified in the QA suite.
- **MEDIUM** — value is an industry-standard planning default, plausible but
  not validated against Indian field measurements.
- **LOW** — value is a product judgement call; changing it changes the score.
- **ASSUMPTION-BASED** — no external reference; must be reviewed by a domain
  engineer before the output is used for a real investment decision.

---

## 1. Geometry & Physics

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| G1 | Earth mean radius (spherical model) | 6371.0088 | km | IUGG mean radius | Haversine needs a sphere radius | `utils/geo.ts` `EARTH_RADIUS_KM` | Verified against PROJ geodesic (max 0.37% over 10 cases) | HIGH |
| G2 | Distance formula | Haversine (spherical) | — | Standard | Fast, closed-form, adequate < 100 km | All distance/density work | Within 0.6% of WGS84 geodesic; exact at 0 | HIGH |
| G3 | Flat-earth projection for point→segment | equirectangular at site latitude | — | Standard local approximation | Cheaper than geodesic point-to-line | `pointToSegmentKm` (fiber distance) | Verified vs haversine on axis-aligned cases | HIGH (local scale) |
| G4 | Earth-curvature bulge | d1·d2 / (2R) | m | Geometric (k=1) | LoS clearance must not dip below ground | `curvatureBulgeM` | Exact for k=1; **conservative** (33% more bulge than k=4/3 radio refraction) | HIGH (formula) / MEDIUM (k choice) |
| G5 | Refractive-k correction | **not applied** (k=1) | — | — | — | LoS | Deliberately conservative; documented in `test_physics.ts` | MEDIUM |
| G6 | Fresnel clearance fraction | 0.60 | fraction of F1 | Standard planning rule (60% F1) | Rule-of-thumb for "clear enough" | `losEngine.ts` `FRESNEL_CLEARANCE_FRACTION` | Boundary-tested; not field-validated | MEDIUM |
| G7 | First Fresnel radius | √(λ·d1·d2/D) | m | Standard optics | Obstruction threshold depends on frequency | `fresnelRadiusM` | Exact vs closed form | HIGH |
| G8 | Free-space path loss | 20log₁₀(d)+20log₁₀(f)+32.45 | dB | ITU-R P.525 | RSRP estimate | `fsplDb` | Exact vs independent calc (19 physics tests) | HIGH (formula) |

## 2. RF / Coverage Link Budget

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| R1 | Downlink frequency used for LoS/Fresnel | 2.1 | GHz | IMT-2000 band 1 | Representative macro band | `runAnalysis.ts` → `analyzeLos` | Convention only; other bands not modelled | MEDIUM |
| R2 | Assumed tower (antenna) height | 30 | m | Typical Indian urban rooftop/GBT | Default for a new macro site | `runAnalysis.ts` | Planning default; **not site-specific** | MEDIUM |
| R3 | Assumed target (receiver) height | 1.5 | m | Handset height | LoS target definition | `runAnalysis.ts` | Standard convention | HIGH |
| R4 | Transmit power | 46 | dBm | Typical macro eNB (40 W) | RSRP link budget | `losEngine.ts` default | Typical, not operator-specific | MEDIUM |
| R5 | Antenna gain | 18 | dBi | Typical 3-sector macro panel | RSRP link budget | `losEngine.ts` default | Typical, not operator-specific | MEDIUM |
| R6 | RSRP = Tx + gain − FSPL | — | dBm | Free-space link budget | Reported signal estimate | `losEngine.ts` | Arithmetic verified | **ASSUMPTION-BASED**: ignores feeder loss, body loss, interference, clutter |
| R7 | Recommended mast-height ceiling | 120 | m | Product judgement | Beyond this a single tower is not a realistic solution | `losEngine.ts` `MAX_RECOMMENDED_HEIGHT_M` | Boundary-tested | LOW |
| R8 | Mast-height safety margin | +5 | m | Product judgement | Headroom over the computed clearance height | `losEngine.ts` | Verified: recommendation clears the path | LOW |
| R9 | LoS path sampling | 64 | points | Product judgement | Resolution vs CPU | `losEngine.ts` default | Sufficient for the 4.5 km default path | MEDIUM |

## 3. Population

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| P1 | Population source | WorldPop 2020, 1 km | — | WorldPop (CC-BY-4.0) | Offline population layer | `population.tif` | Rajasthan total 80.2M vs Census 2011 68.5M (+17% growth to 2020) — plausible | MEDIUM |
| P2 | Values are people-per-cell | — | people | WorldPop "Aggregated" definition | Integration sums cells | `integrate()` | Verified vs independent rasterio integration (0.001%) | HIGH |
| P3 | Density classification thresholds | <100 Rural · <500 Semi-urban · <1500 Urban · ≥1500 Dense urban | people/km² | **Product judgement** (loosely Census urban definitions) | Maps a number to a demand class | `classifyDensity` | Boundary-tested; **not** a published telecom standard | LOW |
| P4 | Serviceable fraction of the 2 km disc | 0.70 | fraction | Product judgement | Not every resident is a subscriber | `serviceablePopulation` | No external reference | **ASSUMPTION-BASED** |
| P5 | Disc area for density | πr² | km² | Geometric | Density denominator | `circleAreaKm2` | Exact | HIGH |

## 4. Competitor Towers

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| T1 | Tower source | Tarang Sanchar registry | — | DoT Tarang Sanchar (2022 vintage) | Only open all-India registry | `towers.sqlite` | 125,036 rows, 0 null coords, 0 out-of-bounds | MEDIUM |
| T2 | Saturation thresholds | <2 Low · <5 Medium · <10 High · ≥10 Saturated | towers/km² | **Product judgement** | Maps density to whitespace | `classifySaturation` | Boundary-tested; not a published standard | LOW |
| T3 | Saturation measured on the 1 km disc | 1 | km | Product judgement | Most local signal | `analyzeTowers` | Verified count == independent disc count | MEDIUM |
| T4 | Co-location flag | ≥3 towers within 1 km | count | Product judgement | Triggers a sharing conversation | `colocationOpportunity` | Boundary-tested | LOW |
| T5 | Registry completeness | assumes near-complete | — | — | Used as a census of sites | All tower findings | **NOT VALIDATED** — registry may undercount recent builds | **ASSUMPTION-BASED** |
| T6 | Near-duplicate tolerance | 30 | m | QA probe | Source has site-based rows | (analysis only) | 9,941 pairs <30 m, 86 exact; all from one source | MEDIUM |

## 5. Fiber / Backhaul

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| F1 | Fiber source | BharatNet/BBNL OFC | — | ramSeraph scraped BharatNet (ODbL/CC) | Only open OFC layer | `fiber.sqlite` | 57,349 segments; WKT geometry | MEDIUM |
| F2 | Geometry encoding | WKT text in a BLOB column | — | Upstream data characteristic | Parser must accept it | `utils/wkb.ts` | 300/300 sampled rows decode; documented | HIGH (handled) |
| F3 | Accessibility thresholds | <100 m Excellent · <500 m Good · <1 km Fair · ≥1 km Poor | m | **Product judgement** | Maps distance to a grade | `classifyAccessibility` | Boundary-tested | LOW |
| F4 | Resource score | <0.1 km→5 · <0.5→4 · <1→3 · <5→2 · else 1 | 1–5 | **Product judgement** | Feeds 2 of 10 score points | `analyzeResources` | Deterministic; monotonic | LOW |
| F5 | "No fiber" sentinel | 50 | km | Product judgement | Search ceiling | `nearestFiber` | Verified search doubles 2→4→…→64 km | LOW |
| F6 | Urban private fiber | **not represented** | — | — | BharatNet is rural/public | Fiber findings | **NOT VALIDATED** — urban fiber may exist but is absent | **ASSUMPTION-BASED** |

## 6. Soil / Foundation

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| S1 | Soil source | FAO/UNESCO DSMW 1:5M | — | FAO DSMW via india-geodata | Only open India soil polygons | `soil.geojson` | 40 polygons, rings closed, coords in bounds | LOW (resolution) |
| S2 | FAO code → foundation class mapping | see `config/soil-classification.json` | — | **Product judgement** on FAO soil units | Turns FAO codes into suitability | `process_soil.py` | Not a geotechnical standard | **ASSUMPTION-BASED** |
| S3 | Foundation score | Best 10 · Good 8 · Fair 5 · Poor 2 · Unknown 5 | /10 | Product judgement | Feeds 1 of 10 score points | `ReportBuilder.FOUNDATION_SCORE` | Deterministic | LOW |
| S4 | **Screening-only disclaimer** | must be shown | — | Product requirement | Soil map is 1:5M, not a site survey | Report disclaimer | Present in report HTML; asserted by tests | HIGH (requirement met) |

## 7. RoW / Regulatory

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| W1 | Mobile-tower application fee | 10,000 | ₹ | DoT RoW Rules 2024 (as encoded) | Fee estimate | `rowEngine.DEFAULT_ROW_RULES` | Encoded from the rule set; **state variations not modelled** | MEDIUM |
| W2 | Rejection / deemed-approval timelines | 45 / 67 | days | DoT RoW Rules 2024 | Timeline estimate | `analyzeRow` | Encoded; not verified against a live portal | MEDIUM |
| W3 | Required documents | 7-item list | — | DoT RoW Rules 2024 | Checklist | `analyzeRow` | Static list | MEDIUM |
| W4 | State-specific rules | **not modelled** | — | — | — | — | `state_specific_rules` exists but is unused | **ASSUMPTION-BASED** |

## 8. Scoring Model

| # | ASSUMPTION | VALUE | UNIT | SOURCE / REFERENCE | WHY IT EXISTS | WHERE USED | VALIDATION STATUS | CONFIDENCE |
|---|---|---|---|---|---|---|---|---|
| M1 | Dimension weights | pop 3 · saturation 3 · resources 2 · soil 1 · LoS 1 | /10 | **Product judgement** | Overall feasibility score | `scoreFeasibility` | Caps verified to sum to 10 | LOW |
| M2 | Saturation direction | lower density is BETTER | — | Product judgement | New entrant prefers whitespace | `scoreFeasibility` | Behaviour verified | LOW |
| M3 | Go threshold | score ≥7 **and** zero issues | — | Product judgement | Release of a recommendation | `scoreFeasibility` | Boundary-tested | LOW |
| M4 | Conditional band | 4 ≤ score < 7 | — | Product judgement | — | `scoreFeasibility` | Boundary-tested | LOW |
| M5 | Score floor | 1.0 | — | Product judgement | Guard against 0 | `Math.max(1, …)` | Attainable min is ~1.7 (resource floor) | LOW |
| M6 | Unknown-density score | 0.75 (neutral) | — | Fix (QA) | Must not be NaN or best-case | `scoreFeasibility` | Regression-tested | LOW |

## 9. Not Modelled At All

These are **absent from the product**, not assumed:

- **Financial model** — no CAPEX, OPEX, revenue, ARPU, ROI, payback, or
  subscriber estimation exists in the codebase. The report makes **no**
  financial claims. Commercial/ROI validation is therefore *not applicable*,
  not *failed*.
- **Capacity / throughput** — no Erlang, PRB, or backhaul-capacity model.
- **Interference / clutter** — no interference, body-loss, or clutter margin.
- **Live terrain refraction** — no k-factor adjustment (see G5).
- **Roads / power** — `nearestRoad` is always null; no power layer is bundled.
- **State-specific RoW** — see W4.

---

## Real-world validation status (summary)

| Domain | Software correctness | Real-world validity |
|---|---|---|
| Geometry / physics | **VERIFIED** (PROJ, closed-form) | High (physics is universal) |
| RF link budget | **VERIFIED arithmetic** | **NOT VALIDATED** — no drive-test data |
| Population | **VERIFIED integration** | Plausible vs Census, not a census |
| Tower density | **VERIFIED counting** | Registry completeness unknown |
| Fiber distance | **VERIFIED decoding/distance** | Coverage completeness unknown |
| Soil / foundation | **VERIFIED lookup** | **Screening only** (1:5M map) |
| RoW fees/timelines | **VERIFIED encoding** | Not verified against a live portal |
| Scoring weights | **VERIFIED arithmetic** | **Pure product judgement** |

**No professionally validated real-world telecom feasibility report exists for
this application.** Every "class" and "score" above is a model output, not
measured truth.
