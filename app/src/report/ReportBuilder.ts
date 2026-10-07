/**
 * Overall feasibility scoring + report assembly.
 */
import type {
  FeasibilityReport, PopulationResult, TowerResult, ResourceResult,
  RowResult, LosResult, SoilResult, AdminResult, Recommendation, Site,
  AnalysisBundleLike,
} from '../models';

export type AnalysisBundle = AnalysisBundleLike;

const FOUNDATION_SCORE: Record<string, number> = {
  Best: 10, Good: 8, Fair: 5, Poor: 2, Unknown: 5,
};

type Summary = {
  score: number;
  recommendation: Recommendation;
  keyFindings: string[];
  criticalIssues: string[];
};

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
export function scoreFeasibility(b: AnalysisBundle): Summary {
  const findings: string[] = [];
  const issues: string[] = [];

  // --- population (max 3) ---
  let popScore = 0.75;
  const p = b.population;
  if (!Number.isFinite(p.densityPerKm2)) {
    findings.push('Population density unavailable for this site.');
  } else if (p.densityClassification === 'Dense urban') {
    popScore = 3; findings.push(`Dense urban demand (${p.densityPerKm2}/km²) — strong revenue potential.`);
  } else if (p.densityClassification === 'Urban') {
    popScore = 2.5; findings.push(`Urban demand (${p.densityPerKm2}/km²).`);
  } else if (p.densityClassification === 'Semi-urban') {
    popScore = 1.5; findings.push(`Semi-urban demand (${p.densityPerKm2}/km²).`);
  } else {
    popScore = 0.75; findings.push(`Rural demand (${p.densityPerKm2}/km²).`);
  }

  // --- saturation (max 3, lower is better for a NEW site) ---
  let satScore = 0.25;
  const t = b.towers;
  const satDensity = Number.isFinite(t.densityPerKm2) ? `${t.densityPerKm2}/km²` : 'density unknown';
  if (t.saturationClassification === 'Low') { satScore = 3; findings.push(`Low tower saturation (${satDensity}) — whitespace available.`); }
  else if (t.saturationClassification === 'Medium') { satScore = 2; findings.push(`Moderate saturation (${satDensity}).`); }
  else if (t.saturationClassification === 'High') { satScore = 1; issues.push(`High tower saturation (${satDensity}) — coverage overlap risk.`); }
  else { satScore = 0.25; issues.push(`Saturated market (${satDensity}) — strong justification required.`); }

  // --- resources (max 2) ---
  const rScore = Math.max(0, Math.min(2, (b.resources.resourceScore / 5) * 2));
  const fiberKm = b.resources.nearestFiber.distanceKm;
  if (b.resources.fiberAccessibility === 'Excellent' || b.resources.fiberAccessibility === 'Good') {
    findings.push(`Fiber backhaul accessible (${fiberKm} km).`);
  } else if (!Number.isFinite(fiberKm) || fiberKm >= 50) {
    issues.push('No BharatNet fiber within 50 km — backhaul will need a new build.');
  } else {
    findings.push(`Fiber ${fiberKm} km away (${b.resources.fiberAccessibility}).`);
  }

  // --- soil (max 1) ---
  const soilScore = (FOUNDATION_SCORE[b.soil.foundationSuitability] ?? 5) / 10;
  findings.push(`Soil: ${b.soil.soilType} — foundation suitability ${b.soil.foundationSuitability}.`);
  if (b.soil.foundationSuitability === 'Poor') {
    issues.push(`Poor foundation soil (${b.soil.soilType}) — pile foundation and a geotechnical survey required.`);
  }

  // --- LoS (max 1) ---
  let losScore = 0.5;
  if (b.los) {
    if (b.los.losStatus === 'Clear') { losScore = 1; findings.push(`Line-of-sight clear over ${b.los.distanceKm} km.`); }
    else if (b.los.losStatus === 'Marginal') { losScore = 0.5; findings.push('Marginal line-of-sight — height optimisation advised.'); }
    else { losScore = 0.15; issues.push(`Obstructed line-of-sight — recommended height ${b.los.recommendedTowerHeight} m.`); }
  }

  const raw = popScore + satScore + rScore + soilScore + losScore; // max 10
  const score = Math.max(1, Math.min(10, Math.round(raw * 10) / 10));

  let recommendation: Recommendation;
  if (score >= 7 && issues.length === 0) recommendation = 'Go';
  else if (score >= 4) recommendation = 'Conditional';
  else recommendation = 'No-Go';

  if (!issues.length) findings.push('No blocking issues identified.');

  return { score, recommendation, keyFindings: findings, criticalIssues: issues };
}

export function buildReport(
  site: Site, region: string, b: AnalysisBundle,
): FeasibilityReport {
  const summary = scoreFeasibility(b);
  return {
    metadata: {
      projectName: 'TowerFeasibility Pro',
      siteName: site.name,
      date: new Date().toISOString().slice(0, 10),
      preparedBy: 'Digital Shift Solutions',
      coordinates: { lat: site.lat, lon: site.lon },
      region,
    },
    executiveSummary: {
      overallScore: summary.score,
      recommendation: summary.recommendation,
      keyFindings: summary.keyFindings,
      criticalIssues: summary.criticalIssues,
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
