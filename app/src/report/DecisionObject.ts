/**
 * Deterministic decision object — the "WHY" layer.
 *
 * Design rule (mission §33): the explanation must be DERIVED FROM THE ENGINE,
 * never invented after the fact. Every string here is assembled from values the
 * engines actually produced. There is no LLM, no prose generation, no guessing.
 *
 *   ENGINE → STRUCTURED DECISION OBJECT → EVIDENCE/CONTRIBUTION → REPORT/UI
 *
 * Knowledge types (mission Rule 2):
 *   FACT        directly supported by source data
 *   COMPUTED    deterministically calculated from known inputs
 *   ASSUMPTION  chosen by the product where authoritative input is unavailable
 *   INFERENCE   a conclusion derived from the above
 */
import type { FeasibilityReport, LosResult, PopulationResult, TowerResult, ResourceResult, SoilResult } from '../models';
import type { Contribution } from './ReportBuilder';

export type Knowledge = 'FACT' | 'COMPUTED' | 'ASSUMPTION' | 'INFERENCE';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface EvidenceItem {
  label: string;
  /** Value as it appears in the report. */
  value: string;
  knowledge: Knowledge;
  source: string;
  vintage: string;
  limitation: string;
}

export interface DecisionObject {
  /** Screening verdict, deliberately NOT an investment decision. */
  screeningResult: 'FAVOURABLE' | 'MIXED' | 'UNFAVOURABLE' | 'INSUFFICIENT DATA';
  /** The raw technical score, retained for continuity. */
  technicalScore: number;
  contributions: Contribution[];
  evidence: EvidenceItem[];
  confidence: Confidence;
  confidenceReasons: string[];
  assumptions: string[];
  limitations: string[];
  notAssessed: string[];
  /** What specific additional evidence could change this result. */
  whatWouldChange: string[];
  /** Recommended next validation action. */
  nextStep: string;
  /** Non-fatal data-quality warnings surfaced during scoring. */
  warnings: string[];
}

/**
 * Deterministic verdict from the technical score + data completeness.
 *
 * Note the deliberate decoupling from the legacy 'Go'/'No-Go' badge: this is a
 * TECHNICAL SCREENING outcome. No commercial claim is made anywhere.
 *
 * `lowDemand` is the critical guard (mission §8): a site with low population
 * density must never be reported FAVOURABLE on the strength of low tower
 * density. Absence of competitors is not evidence of demand — it may equally be
 * a coverage obligation or a genuinely uneconomic area, and this dataset cannot
 * tell the two apart. Such a site is capped at MIXED.
 */
function screeningResult(
  score: number,
  missingCount: number,
  criticalIssueCount: number,
  lowDemand: boolean,
): DecisionObject['screeningResult'] {
  // Missing data dominates: we cannot call a site favourable on data we do not have.
  if (missingCount >= 2) return 'INSUFFICIENT DATA';
  if (lowDemand) return score >= 4 ? 'MIXED' : 'UNFAVOURABLE';
  if (score >= 7 && criticalIssueCount === 0) return 'FAVOURABLE';
  if (score >= 4) return 'MIXED';
  return 'UNFAVOURABLE';
}

/**
 * Evidence-quality confidence — deterministic, explainable, and NOT a
 * statistical interval (the underlying data does not support one).
 */
function confidenceOf(
  r: FeasibilityReport,
  missingCount: number,
): { level: Confidence; reasons: string[] } {
  const reasons: string[] = [];
  let level: Confidence = 'HIGH';

  // Tower registry: known 2022 vintage, completeness unverified.
  reasons.push('Tower registry is 2022 vintage and its completeness is not independently verified.');
  // Population is modelled, not a census.
  reasons.push('Population is a modelled 1 km disaggregation (WorldPop 2020), not a census count.');
  // Fiber covers public networks only.
  reasons.push('Fiber covers BharatNet/public networks only; urban private fiber is not represented.');
  // Soil is a 1:5M screening map.
  reasons.push('Soil is a 1:5,000,000 screening map, not a geotechnical survey.');
  level = 'MEDIUM';

  if (r.populationAnalysis.source === 'tower-proxy') {
    reasons.push('Population fell back to a tower-density proxy — no population raster in this pack.');
    level = 'LOW';
  }
  if (!r.losAnalysis) {
    reasons.push('Elevation data is not in this pack, so terrain line-of-sight was not assessed.');
    level = 'LOW';
  }
  // Aligned with screeningResult(): two or more missing primary datasets make
  // the confidence UNKNOWN, not merely LOW.
  if (missingCount >= 2) {
    reasons.push('Multiple primary datasets are unavailable for this site.');
    level = 'UNKNOWN';
  }
  return { level, reasons };
}

export function buildDecisionObject(r: FeasibilityReport): DecisionObject {
  const s = r.executiveSummary;
  const contributions = s.contributions ?? [];
  const missing = contributions.filter((c) => c.missingData);

  // ---- evidence table: one row per major input, with provenance ----
  const pop: PopulationResult = r.populationAnalysis;
  const tow: TowerResult = r.towerAnalysis;
  const res: ResourceResult = r.resourceAnalysis;
  const soil: SoilResult = r.soilAnalysis;

  const evidence: EvidenceItem[] = [
    {
      label: 'Population (2 km / 5 km / 10 km)',
      value: `${pop.populationWithin2km.toLocaleString()} / ${pop.populationWithin5km.toLocaleString()} / ${pop.populationWithin10km.toLocaleString()}`,
      knowledge: pop.source === 'tower-proxy' ? 'ASSUMPTION' : 'FACT',
      source: pop.source === 'tower-proxy' ? 'Tower-density proxy (no raster)' : 'WorldPop 2020 1 km (Aggregated)',
      vintage: pop.source === 'tower-proxy' ? 'n/a' : '2020',
      limitation: pop.source === 'tower-proxy'
        ? 'Estimated from tower density; not a population measurement.'
        : 'Modelled disaggregation, not a census.',
    },
    {
      label: 'Local population density',
      value: `${pop.densityPerKm2.toLocaleString()} /km² (${pop.densityClassification})`,
      knowledge: 'COMPUTED',
      source: 'WorldPop 2020 integrated over a 2 km disc',
      vintage: '2020',
      limitation: 'Classification bands are product-defined, not a published standard.',
    },
    {
      label: 'Competitor towers (1 / 2 / 5 km)',
      value: `${tow.towersWithin1km} / ${tow.towersWithin2km} / ${tow.towersWithin5km}`,
      knowledge: 'FACT',
      source: 'Tarang Sanchar (DoT EMF portal)',
      vintage: '2022',
      limitation: 'Undercounts post-2022 builds; registry completeness unverified.',
    },
    {
      label: 'Tower saturation',
      value: `${tow.densityPerKm2} /km² (${tow.saturationClassification})`,
      knowledge: 'COMPUTED',
      source: 'Exact great-circle count on the 1 km disc',
      vintage: '2022',
      limitation: 'Saturation bands (2/5/10 per km²) are product-defined.',
    },
    {
      label: 'Nearest known fiber',
      value: res.nearestFiber.distanceKm >= 50 ? 'none within 50 km' : `${res.nearestFiber.distanceKm} km`,
      knowledge: 'FACT',
      source: 'BharatNet / BBNL OFC',
      vintage: '2024',
      limitation: 'Public networks only; urban private fiber not represented.',
    },
    {
      label: 'Soil / foundation',
      value: `${soil.soilType} — ${soil.foundationSuitability}`,
      knowledge: 'ASSUMPTION',
      source: 'FAO/UNESCO DSMW (1:5M)',
      vintage: '2007',
      limitation: 'Screening map; foundation class is a product-defined mapping.',
    },
    {
      label: 'Terrain line-of-sight',
      value: r.losAnalysis ? `${r.losAnalysis.losStatus} over ${r.losAnalysis.distanceKm} km` : 'not assessed',
      knowledge: r.losAnalysis ? 'COMPUTED' : 'ASSUMPTION',
      source: 'SRTM elevation (~30 m)',
      vintage: '2000',
      limitation: r.losAnalysis
        ? 'Screening simulation on an assumed target geometry; k=1 curvature, no radio refraction.'
        : 'No elevation data in this pack.',
    },
    {
      label: 'Free-space path loss / RSRP',
      value: r.losAnalysis
        ? `${r.losAnalysis.pathLossDb} dB / ${r.losAnalysis.estimatedRsrpDbm} dBm (free-space estimate)`
        : 'not assessed',
      knowledge: 'ASSUMPTION',
      source: 'ITU-R P.525 FSPL + assumed Tx 46 dBm, gain 18 dBi',
      vintage: 'n/a',
      limitation: 'FREE-SPACE SCREENING ESTIMATE. Ignores clutter, feeder/body loss, interference and terrain diffraction. Not a coverage prediction.',
    },
    {
      label: 'RoW application fee / timeline',
      value: `₹${r.rowAnalysis.applicationFee.toLocaleString()} · ${r.rowAnalysis.approvalTimelineDays} days`,
      knowledge: 'ASSUMPTION',
      source: 'DoT Telecommunications (Right of Way) Rules, 2024 (as encoded)',
      vintage: '2024',
      limitation: 'State variations not modelled; not verified against a live portal.',
    },
  ];

  const { level, reasons } = confidenceOf(r, missing.length);

  // ---- assumptions actually exercised by this result ----
  const assumptions: string[] = [
    'Scoring weights (population 3, saturation 3, resources 2, soil 1, LoS 1) are product-defined and not calibrated against site outcomes.',
    'Density, saturation and accessibility classification bands are product-defined.',
    'FAO soil units are mapped to foundation suitability by a product-defined table.',
  ];
  if (r.losAnalysis) {
    assumptions.push('LoS uses an assumed 30 m tower height and 1.5 m receiver height on an assumed target geometry.');
    assumptions.push('RF uses an assumed 2.1 GHz carrier, 46 dBm transmit power and 18 dBi antenna gain.');
  }
  if (pop.source === 'tower-proxy') {
    assumptions.push('Population is estimated from tower density (no raster available).');
  }

  // ---- limitations ----
  const limitations: string[] = [
    'Tower registry is 2022 vintage and may undercount recent builds.',
    'Urban private fiber (Jio/Airtel/Vi) is not represented in any dataset.',
    'No road-access or power-availability layer is bundled.',
    'RSRP is a free-space screening estimate, not a terrain-aware coverage prediction.',
    'Terrain line-of-sight uses k=1 curvature (no radio refraction) and no diffraction loss.',
  ];
  if (!r.losAnalysis) limitations.push('Terrain line-of-sight was not assessed (no elevation data in this pack).');

  // ---- explicitly NOT assessed ----
  const notAssessed: string[] = [
    'COMMERCIAL FEASIBILITY — no CAPEX, OPEX, ARPU, subscriber, revenue, ROI or payback model exists.',
    'Coverage need against an existing network (no coverage layer).',
    'Capacity / throughput and interference.',
    'Power availability (grid / DG / solar).',
    'Road access and logistics.',
    'EMF / regulatory siting compliance beyond a fee-and-documents checklist.',
    'Field-measured RF performance (no drive-test data).',
  ];

  // ---- low-demand guard (mission §8) ----
  // A rural / sparse site must never be called favourable merely because there
  // are few competitor towers. The data cannot distinguish "whitespace" from
  // "coverage obligation" or "no economic demand".
  const popClass = (r.populationAnalysis.densityClassification || '').toLowerCase();
  const lowDemand = popClass === 'rural' || popClass === 'sparse';
  if (lowDemand) {
    limitations.unshift(
      'Population density is low. Low competitor-tower density at a low-demand site may indicate '
      + 'whitespace OR a coverage obligation OR genuinely uneconomic demand. This dataset cannot '
      + 'distinguish these cases, so the result is capped at MIXED and must not be read as a '
      + 'commercial opportunity.',
    );
  }

  // ---- what would change the answer ----
  const whatWouldChange: string[] = [
    'An updated tower registry (post-2022) could change the saturation classification.',
    'Discovery of urban private fiber could change the backhaul assessment.',
    'Field RF measurement could replace the free-space RSRP estimate.',
    'A geotechnical survey could replace the 1:5M soil screening.',
    'Operator demand/subscriber data could establish or refute commercial viability.',
    'An explicit proposed tower coordinate and bearing would replace the assumed LoS geometry.',
    'A current population dataset would refresh the demand estimate.',
  ];

  // ---- warnings from missing data ----
  const warnings: string[] = missing.map(
    (m) => `${m.label}: input unavailable — scored neutrally, not on evidence.`,
  );
  if (s.criticalIssues.length) {
    warnings.push(...s.criticalIssues.map((i) => `Critical issue: ${i}`));
  }

  const nextStep =
    'Validate the site in the field: confirm tower density and coverage on site, '
    + 'confirm backhaul availability with the operator, and commission a geotechnical survey '
    + 'before any foundation design. Commercial viability requires an operator business case '
    + 'that this tool does not produce.';

  return {
    screeningResult: screeningResult(s.overallScore, missing.length, s.criticalIssues.length, lowDemand),
    technicalScore: s.overallScore,
    contributions,
    evidence,
    confidence: level,
    confidenceReasons: reasons,
    assumptions,
    limitations,
    notAssessed,
    whatWouldChange,
    nextStep,
    warnings,
  };
}
