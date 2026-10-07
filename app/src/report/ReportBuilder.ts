/**
 * Overall feasibility scoring + report assembly.
 */
import type {
  FeasibilityReport, PopulationResult, TowerResult, ResourceResult,
  RowResult, LosResult, SoilResult, AdminResult, Recommendation, Site,
  AnalysisBundleLike,
} from '../models';
import { classifyDensity } from '../analysis/populationEngine';
import { classifySaturation } from '../analysis/towerEngine';

export type AnalysisBundle = AnalysisBundleLike;

const FOUNDATION_SCORE: Record<string, number> = {
  Best: 10, Good: 8, Fair: 5, Poor: 2, Unknown: 5,
};

export type Summary = {
  score: number;
  recommendation: Recommendation;
  keyFindings: string[];
  criticalIssues: string[];
};

/** One scoring dimension's exact contribution to the total. */
export type Contribution = {
  key: 'population' | 'saturation' | 'resources' | 'soil' | 'los';
  label: string;
  /** Points actually added to the raw total (not normalised, not rounded). */
  points: number;
  maxPoints: number;
  /** Which knowledge type this dimension's *input* is. */
  knowledge: 'FACT' | 'COMPUTED' | 'ASSUMPTION';
  /** Human-readable reason for the points awarded. */
  reason: string;
  /** True when the input was missing and the dimension fell back to neutral. */
  missingData: boolean;
};

export type DetailedSummary = Summary & { contributions: Contribution[] };

/**
 * Score a site across five dimensions and explain the result.
 *
 *   population  max 3   higher density is better (more revenue)
 *   saturation  max 3   LOWER is better for a new site (whitespace)
 *   resources   max 2   fiber/backhaul access
 *   soil        max 1   foundation suitability
 *   LoS         max 1   terrain clearance
 *
 * A non-finite input is treated as "unknown" and scored neutrally; it must
 * never be interpolated into user-facing text (that would render "NaN/km²")
 * and must never silently fall through to the worst category.
 */
export function scoreFeasibilityDetailed(b: AnalysisBundle): DetailedSummary {
  const findings: string[] = [];
  const issues: string[] = [];
  const contributions: Contribution[] = [];

  // --- population (max 3) ---
  let popScore = 0.75;
  const p = b.population;
  const popMissing = !Number.isFinite(p.densityPerKm2);
  let popReason: string;
  if (popMissing) {
    popReason = 'Population density unavailable — scored neutrally.';
    findings.push('Population density unavailable for this site.');
  } else if (p.densityClassification === 'Dense urban') {
    popScore = 3; popReason = `Dense urban demand (${p.densityPerKm2}/km²).`;
    findings.push(`Dense urban demand (${p.densityPerKm2}/km²) — strong revenue potential.`);
  } else if (p.densityClassification === 'Urban') {
    popScore = 2.5; popReason = `Urban demand (${p.densityPerKm2}/km²).`;
    findings.push(`Urban demand (${p.densityPerKm2}/km²).`);
  } else if (p.densityClassification === 'Semi-urban') {
    popScore = 1.5; popReason = `Semi-urban demand (${p.densityPerKm2}/km²).`;
    findings.push(`Semi-urban demand (${p.densityPerKm2}/km²).`);
  } else {
    popScore = 0.75; popReason = `Rural demand (${p.densityPerKm2}/km²).`;
    findings.push(`Rural demand (${p.densityPerKm2}/km²).`);
  }
  contributions.push({
    key: 'population', label: 'Population demand', points: popScore, maxPoints: 3,
    knowledge: 'COMPUTED', reason: popReason, missingData: popMissing,
  });

  // --- saturation (max 3, lower is better for a NEW site) ---
  let satScore = 0.25;
  const t = b.towers;
  const satMissing = !Number.isFinite(t.densityPerKm2);
  const satDensity = satMissing ? 'density unknown' : `${t.densityPerKm2}/km²`;
  let satReason: string;
  if (t.saturationClassification === 'Low') { satScore = 3; satReason = `Low tower saturation (${satDensity}) — whitespace available.`; findings.push(`Low tower saturation (${satDensity}) — whitespace available.`); }
  else if (t.saturationClassification === 'Medium') { satScore = 2; satReason = `Moderate saturation (${satDensity}).`; findings.push(`Moderate saturation (${satDensity}).`); }
  else if (t.saturationClassification === 'High') { satScore = 1; satReason = `High tower saturation (${satDensity}) — coverage overlap risk.`; issues.push(`High tower saturation (${satDensity}) — coverage overlap risk.`); }
  else { satScore = 0.25; satReason = `Saturated market (${satDensity}) — strong justification required.`; issues.push(`Saturated market (${satDensity}) — strong justification required.`); }
  contributions.push({
    key: 'saturation', label: 'Tower saturation', points: satScore, maxPoints: 3,
    knowledge: 'COMPUTED', reason: satReason, missingData: satMissing,
  });

  // --- resources (max 2) ---
  const rScore = Math.max(0, Math.min(2, (b.resources.resourceScore / 5) * 2));
  const fiberKm = b.resources.nearestFiber.distanceKm;
  let resReason: string;
  if (b.resources.fiberAccessibility === 'Excellent' || b.resources.fiberAccessibility === 'Good') {
    resReason = `Fiber backhaul accessible (${fiberKm} km).`;
    findings.push(`Fiber backhaul accessible (${fiberKm} km).`);
  } else if (!Number.isFinite(fiberKm) || fiberKm >= 50) {
    resReason = 'No BharatNet fiber within 50 km — backhaul will need a new build.';
    issues.push('No BharatNet fiber within 50 km — backhaul will need a new build.');
  } else {
    resReason = `Fiber ${fiberKm} km away (${b.resources.fiberAccessibility}).`;
    findings.push(`Fiber ${fiberKm} km away (${b.resources.fiberAccessibility}).`);
  }
  contributions.push({
    key: 'resources', label: 'Backhaul resources', points: rScore, maxPoints: 2,
    knowledge: 'COMPUTED', reason: resReason, missingData: false,
  });

  // --- soil (max 1) ---
  const soilScore = (FOUNDATION_SCORE[b.soil.foundationSuitability] ?? 5) / 10;
  findings.push(`Soil: ${b.soil.soilType} — foundation suitability ${b.soil.foundationSuitability}.`);
  if (b.soil.foundationSuitability === 'Poor') {
    issues.push(`Poor foundation soil (${b.soil.soilType}) — pile foundation and a geotechnical survey required.`);
  }
  contributions.push({
    key: 'soil', label: 'Foundation suitability', points: soilScore, maxPoints: 1,
    knowledge: 'ASSUMPTION',
    reason: `FAO soil unit mapped to foundation class '${b.soil.foundationSuitability}' (product-defined mapping).`,
    missingData: b.soil.foundationSuitability === 'Unknown',
  });

  // --- LoS (max 1) ---
  let losScore = 0.5;
  let losReason: string;
  if (b.los) {
    if (b.los.losStatus === 'Clear') { losScore = 1; losReason = `Line-of-sight clear over ${b.los.distanceKm} km.`; findings.push(`Line-of-sight clear over ${b.los.distanceKm} km.`); }
    else if (b.los.losStatus === 'Marginal') { losScore = 0.5; losReason = 'Marginal line-of-sight — height optimisation advised.'; findings.push('Marginal line-of-sight — height optimisation advised.'); }
    else { losScore = 0.15; losReason = `Obstructed line-of-sight — recommended height ${b.los.recommendedTowerHeight} m.`; issues.push(`Obstructed line-of-sight — recommended height ${b.los.recommendedTowerHeight} m.`); }
  } else {
    losReason = 'Elevation data unavailable — LoS not assessed, scored neutrally.';
  }
  contributions.push({
    key: 'los', label: 'Terrain line-of-sight', points: losScore, maxPoints: 1,
    knowledge: 'COMPUTED', reason: losReason, missingData: !b.los,
  });

  const raw = popScore + satScore + rScore + soilScore + losScore; // max 10
  const score = Math.max(1, Math.min(10, Math.round(raw * 10) / 10));

  let recommendation: Recommendation;
  if (score >= 7 && issues.length === 0) recommendation = 'Go';
  else if (score >= 4) recommendation = 'Conditional';
  else recommendation = 'No-Go';

  if (!issues.length) findings.push('No blocking issues identified.');

  return { score, recommendation, keyFindings: findings, criticalIssues: issues, contributions };
}

export function scoreFeasibility(b: AnalysisBundle): Summary {
  const { score, recommendation, keyFindings, criticalIssues } = scoreFeasibilityDetailed(b);
  return { score, recommendation, keyFindings, criticalIssues };
}

export interface ReportMetaInput {
  appVersion?: string;
  algorithmVersion?: string;
  packVersion?: string;
  sourceDates?: Record<string, string>;
  provenance?: Record<string, any>;
  losTargetAssumed?: boolean;
}

export interface SensitivityResult {
  robust: boolean;
  /** Whether a small input change flips the screening verdict. */
  verdictFlips: boolean;
  /** Verdict at the base inputs, and at ±20% on demand/saturation inputs. */
  base: string;
  low: string;
  high: string;
  note: string;
}

/**
 * Deterministic sensitivity probe (mission §14).
 *
 * The score is a fixed weighted sum of *classified* inputs, so its only real
 * discontinuities are the classification band edges. We therefore perturb the
 * two continuous drivers (population density and tower density) by ±20% and
 * re-classify — exactly what a small change in the underlying data would do —
 * then report whether the screening verdict moves.
 *
 * This is a robustness check on the *product's own bands*, not a statistical
 * confidence interval, and it is labelled as such.
 */
export function analyseSensitivity(b: AnalysisBundle): SensitivityResult {
  const base = screeningOf(b);
  const low = screeningOf(perturb(b, 0.8));
  const high = screeningOf(perturb(b, 1.2));
  const verdictFlips = low !== base || high !== base;
  return {
    robust: !verdictFlips,
    verdictFlips,
    base,
    low,
    high,
    note: verdictFlips
      ? 'CONCLUSION IS SENSITIVE: a ±20% change in population or tower density flips the screening verdict. Treat as provisional.'
      : 'Stable under ±20% perturbation of population and tower density.',
  };
}

/** Verdict string for a bundle, using the same guard logic as the report. */
function screeningOf(b: AnalysisBundle): string {
  const s = scoreFeasibilityDetailed(b);
  const missing = s.contributions.filter((c) => c.missingData).length;
  const cls = (b.population.densityClassification || '').toLowerCase();
  const lowDemand = cls === 'rural' || cls === 'sparse';
  if (missing >= 2) return 'INSUFFICIENT DATA';
  if (lowDemand) return s.score >= 4 ? 'MIXED' : 'UNFAVOURABLE';
  if (s.score >= 7 && s.criticalIssues.length === 0) return 'FAVOURABLE';
  if (s.score >= 4) return 'MIXED';
  return 'UNFAVOURABLE';
}

/** Scale the continuous drivers by `factor` and re-classify. */
function perturb(b: AnalysisBundle, factor: number): AnalysisBundle {
  return {
    ...b,
    population: {
      ...b.population,
      densityPerKm2: b.population.densityPerKm2 * factor,
      densityClassification: classifyDensity(b.population.densityPerKm2 * factor),
    },
    towers: {
      ...b.towers,
      densityPerKm2: b.towers.densityPerKm2 * factor,
      saturationClassification: classifySaturation(b.towers.densityPerKm2 * factor),
    },
  };
}

export function buildReport(
  site: Site, region: string, b: AnalysisBundle, meta: ReportMetaInput = {},
): FeasibilityReport {
  const summary = scoreFeasibilityDetailed(b);
  return {
    metadata: {
      projectName: 'TowerFeasibility Pro',
      siteName: site.name,
      date: new Date().toISOString().slice(0, 10),
      preparedBy: 'Digital Shift Solutions',
      coordinates: { lat: site.lat, lon: site.lon },
      region,
      ...meta,
    },
    executiveSummary: {
      overallScore: summary.score,
      recommendation: summary.recommendation,
      keyFindings: summary.keyFindings,
      criticalIssues: summary.criticalIssues,
      contributions: summary.contributions,
      sensitivity: analyseSensitivity(b),
    },
    populationAnalysis: b.population,
    towerAnalysis: b.towers,
    resourceAnalysis: b.resources,
    rowAnalysis: b.row,
    losAnalysis: b.los,
    soilAnalysis: b.soil,
    adminAnalysis: b.admin,
  };
}
