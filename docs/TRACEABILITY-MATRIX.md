# TRACEABILITY MATRIX

Maps every user-visible output to its data source, transformation, algorithm,
validating test, assumption and limitation.

Columns: **Output → Source → Transformation → Algorithm → Validated by → Knowledge type → Limitation**

Knowledge types: `FACT` · `COMPUTED` · `ASSUMPTION` · `INFERENCE`

---

## Demand

| | |
|---|---|
| **Output** | Population within 2/5/10 km; local density; classification |
| **Source** | WorldPop 2020 1 km (Aggregated), masked to Rajasthan |
| **Transformation** | Raster sampled over discs; cell area 0.7691 km²; N-W origin handled |
| **Algorithm** | `populationEngine.analyzePopulation` → `classifyDensity` |
| **Validated by** | `qa_suite_core` raster-integration checks; `test_golden` population cases; `test_accuracy` (Python, independent rasterio) |
| **Knowledge** | FACT (counts) / COMPUTED (density) / ASSUMPTION (bands) |
| **Limitation** | Modelled, not census. Bands are product-defined. |

## Existing towers

| | |
|---|---|
| **Output** | Towers within 1/2/5 km; density; saturation class; nearby list |
| **Source** | Tarang Sanchar registry, 2022 vintage |
| **Transformation** | Rajasthan filter; exact disc query on a pre-built R*Tree |
| **Algorithm** | `towerEngine` — exact haversine radius test (not a bbox approximation) |
| **Validated by** | `qa_suite_core` (disc-vs-bbox overcount checks); `test_golden` B14; `test_trustworthiness` (Python, SQL ground truth) |
| **Knowledge** | FACT (counts) / COMPUTED (density) / ASSUMPTION (bands) |
| **Limitation** | 2022 vintage; registry completeness unverified; bands product-defined. |

## Backhaul / fiber

| | |
|---|---|
| **Output** | Nearest fiber distance; accessibility grade; resource score |
| **Source** | BharatNet / BBNL OFC (public) |
| **Transformation** | Segment geometry parsed; point-to-segment distance |
| **Algorithm** | `resourceEngine` — `pointToSegmentKm` |
| **Validated by** | `qa_suite_core` point-to-segment checks; `test_golden` geometry cases |
| **Knowledge** | FACT (distance) / ASSUMPTION (grades) |
| **Limitation** | Private urban fiber absent; grades product-defined. |

## Soil / foundation

| | |
|---|---|
| **Output** | FAO code; soil type; foundation suitability |
| **Source** | FAO/UNESCO Digital Soil Map of the World, 1:5M |
| **Transformation** | Point-in-polygon lookup |
| **Algorithm** | `soilEngine.lookupSoil` + product mapping table |
| **Validated by** | `test_golden` soil cases; `qa_suite_core` classification checks |
| **Knowledge** | FACT (soil unit) / ASSUMPTION (foundation class) |
| **Limitation** | 1:5M screening; mapping product-defined; borehole required. |

## Terrain / line-of-sight

| | |
|---|---|
| **Output** | LoS status; terrain profile; Fresnel clearance; recommended height |
| **Source** | SRTM elevation (~30 m), 2000 vintage |
| **Transformation** | Path corridor sampled; bilinear elevation |
| **Algorithm** | `losEngine.analyzeLos` — Fresnel radius, earth-curvature drop |
| **Validated by** | `test_physics` (19 checks); `test_golden` A-series geometry |
| **Knowledge** | COMPUTED |
| **Limitation** | Assumed target geometry; k=1 curvature; no radio refraction or diffraction. |

## RF / RSRP

| | |
|---|---|
| **Output** | Free-space path loss; estimated RSRP |
| **Source** | Derived from the LoS path distance |
| **Transformation** | None beyond the distance |
| **Algorithm** | `fsplDb` (ITU-R P.525) + assumed Tx/gain |
| **Validated by** | `test_golden` FSPL cases; `test_physics` |
| **Knowledge** | ASSUMPTION |
| **Limitation** | FREE-SPACE ONLY. Terrain, clutter, interference, feeder/body loss not applied. |

## Score & verdict

| | |
|---|---|
| **Output** | Technical score /10; screening verdict; contributions; sensitivity |
| **Source** | The five dimension results above |
| **Transformation** | Weighted sum of classified inputs |
| **Algorithm** | `scoreFeasibilityDetailed`; `buildDecisionObject`; `analyseSensitivity` |
| **Validated by** | `qa_suite_core` §11 adversarial verdicts; `test_golden` J-series; `test_usefulness` |
| **Knowledge** | INFERENCE |
| **Limitation** | Weights, bands and cut-offs product-defined; no commercial input. |

## Provenance & confidence

| | |
|---|---|
| **Output** | Per-dataset source/type/vintage/limitation; confidence HIGH/MEDIUM/LOW/UNKNOWN |
| **Source** | `data-pipeline/scripts/provenance.py` → pack manifest |
| **Transformation** | Manifest → report metadata → report §13/§14 |
| **Algorithm** | `DecisionObject.buildDecisionObject` |
| **Validated by** | `test_golden` provenance/vintage checks; manifest inspection |
| **Knowledge** | FACT (source/vintage) / INFERENCE (confidence) |
| **Limitation** | Confidence is an evidence-quality judgement, not a statistical interval. |

## Commercial feasibility

| | |
|---|---|
| **Output** | "COMMERCIAL FEASIBILITY: NOT ASSESSED" |
| **Source** | — |
| **Algorithm** | — |
| **Validated by** | `test_golden` I8 (blocked); `qa_suite_core` decision-object checks |
| **Knowledge** | NOT IMPLEMENTED |
| **Limitation** | No CAPEX/OPEX/ARPU/ROI/payback model exists. Never invented. |
