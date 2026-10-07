/**
 * Pure HTML builder for the feasibility report.
 *
 * Kept free of any expo/native imports so it can be rendered and tested
 * outside the app (and reused by any renderer).
 *
 * Structure follows an evidence-first layout: the reader must be able to see
 * WHAT was concluded, WHY, on WHAT EVIDENCE, with WHAT CONFIDENCE, and what was
 * NOT assessed — without reading source code.
 */
import type { FeasibilityReport } from '../models';
import { buildDecisionObject } from './DecisionObject';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const row = (k: string, v: unknown) =>
  `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;

const list = (items: string[], cls = '') =>
  `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

export function terrainSvg(
  profile: { distanceKm: number; elevationM: number; losLineM: number }[],
): string {
  if (!profile.length) return '';
  const W = 700, H = 220, pad = 30;
  const maxD = profile[profile.length - 1].distanceKm || 1;
  const all = profile.flatMap((p) => [p.elevationM, p.losLineM]);
  const minE = Math.min(...all), maxE = Math.max(...all);
  const span = Math.max(1, maxE - minE);
  const X = (d: number) => pad + (d / maxD) * (W - 2 * pad);
  const Y = (e: number) => H - pad - ((e - minE) / span) * (H - 2 * pad);

  const terrain = profile
    .map((p) => `${X(p.distanceKm).toFixed(1)},${Y(p.elevationM).toFixed(1)}`)
    .join(' ');
  const los = profile
    .map((p) => `${X(p.distanceKm).toFixed(1)},${Y(p.losLineM).toFixed(1)}`)
    .join(' ');
  const area = `${X(profile[0].distanceKm)},${H - pad} ${terrain} ${X(maxD)},${H - pad}`;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#f8fafc"/>
    <polygon points="${area}" fill="#dbeafe" stroke="#93c5fd"/>
    <polyline points="${terrain}" fill="none" stroke="#1e40af" stroke-width="2"/>
    <polyline points="${los}" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 4"/>
    <text x="${pad}" y="16" font-size="11" fill="#334155">Elevation ${minE.toFixed(0)}–${maxE.toFixed(0)} m over ${maxD.toFixed(1)} km</text>
    <text x="${pad}" y="${H - 8}" font-size="10" fill="#64748b">blue = terrain · red dashed = line of sight</text>
  </svg>`;
}

const RESULT_LABEL: Record<string, string> = {
  'FAVOURABLE': 'FAVOURABLE (technical screening)',
  'MIXED': 'MIXED (technical screening)',
  'UNFAVOURABLE': 'UNFAVOURABLE (technical screening)',
  'INSUFFICIENT DATA': 'INSUFFICIENT DATA',
};
const RESULT_CLS: Record<string, string> = {
  'FAVOURABLE': 'good', 'MIXED': 'warn', 'UNFAVOURABLE': 'bad', 'INSUFFICIENT DATA': 'neutral',
};

export function buildReportHtml(r: FeasibilityReport): string {
  const m = r.metadata;
  const s = r.executiveSummary;
  const d = buildDecisionObject(r);

  const contributionRows = (s.contributions ?? [])
    .map((c) => row(`${c.label} (max ${c.maxPoints})`, `${c.points > 0 ? '+' : ''}${c.points}`))
    .join('');

  const provenanceRows = Object.entries(m.provenance ?? {})
    .map(([k, v]: [string, any]) => `
      <tr><td class="k">${esc(k)}</td><td class="v">
        <b>${esc(v.source)}</b><br/>
        Type: ${esc(v.type)} · Vintage: ${esc(v.vintage)}${v.resolution ? ` · Resolution: ${esc(v.resolution)}` : ''}<br/>
        <span class="lim">${esc(v.limitation ?? '')}</span>
      </td></tr>`)
    .join('');

  const nearby = r.towerAnalysis.nearbyTowers
    .map((t) => row(`Tower #${t.id}`, `${t.distanceKm.toFixed(2)} km · ${t.installationType ?? 'n/a'}`))
    .join('');

  const losSection = r.losAnalysis ? `
    <h2>12. Line-of-Sight / Fresnel Screening</h2>
    <table>${row('Status', r.losAnalysis.losStatus)}
      ${row('Target geometry', r.losAnalysis.targetAssumed
        ? `ASSUMED — ${r.losAnalysis.distanceKm} km on a ~${r.losAnalysis.bearingDeg ?? '?'}° bearing (no user-selected target)`
        : `Explicit — ${r.losAnalysis.distanceKm} km`)}
      ${row('Fresnel clearance', r.losAnalysis.fresnelClearance ? 'Yes' : 'No')}
      ${row('Recommended tower height', `${r.losAnalysis.recommendedTowerHeight} m`)}
      ${row('Free-space path loss', `${r.losAnalysis.pathLossDb} dB (screening estimate)`)}
      ${row('Estimated RSRP', `${r.losAnalysis.estimatedRsrpDbm} dBm — free-space only`)}</table>
    ${r.losAnalysis.targetAssumed
      ? `<p class="warnbox">The line-of-sight path above is a <b>screening simulation on an assumed target geometry</b>, not a link to a real far-end site. Distance and bearing are properties of that assumption, not of the site.</p>`
      : ''}
    ${terrainSvg(r.losAnalysis.terrainProfile)}` : `
    <h2>12. Line-of-Sight / Fresnel Screening</h2>
    <p class="muted">Not assessed — elevation data is not included in this data pack.</p>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { margin: 14mm; }
  body{font-family:-apple-system,Roboto,Helvetica,sans-serif;color:#0f172a;margin:0;font-size:12px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 6px;color:#1e40af;border-bottom:1px solid #e2e8f0;padding-bottom:3px}
  .sub{color:#64748b;font-size:11px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:6px 0}
  td{padding:4px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  td.k{color:#64748b;width:44%} td.v{font-weight:600}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff}
  .good{background:#16a34a}.warn{background:#d97706}.bad{background:#dc2626}.neutral{background:#64748b}
  .score{font-size:34px;font-weight:800;color:#1e40af}
  ul{margin:4px 0 4px 16px;padding:0} li{margin:2px 0}
  .muted{color:#94a3b8;font-style:italic}
  .lim{color:#94a3b8;font-weight:400;font-size:10px}
  .warnbox{margin:6px 0;padding:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:11px;color:#78350f}
  .conf{display:inline-block;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:800}
  .c-HIGH{background:#dcfce7;color:#166534}.c-MEDIUM{background:#fef3c7;color:#92400e}
  .c-LOW{background:#fee2e2;color:#991b1b}.c-UNKNOWN{background:#e2e8f0;color:#334155}
  .disc{margin-top:24px;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:10px;color:#78350f}
  .foot{margin-top:18px;color:#94a3b8;font-size:10px;text-align:center}
</style></head><body>
<h1>Tower Feasibility Report</h1>
<div class="sub">${esc(m.siteName)} · ${esc(m.region)} · ${esc(m.date)}<br/>
Coordinates: ${m.coordinates.lat.toFixed(5)}, ${m.coordinates.lon.toFixed(5)} · Prepared by ${esc(m.preparedBy)}<br/>
App ${esc(m.appVersion ?? '—')} · Algorithm ${esc(m.algorithmVersion ?? '—')} · Data pack ${esc(m.packVersion ?? '—')}</div>

<h2>1. Executive Summary</h2>
<div class="score">${d.technicalScore}/10 &nbsp; <span class="badge ${RESULT_CLS[d.screeningResult]}">${esc(RESULT_LABEL[d.screeningResult])}</span></div>
<p><b>Technical screening result</b> — this is a technical screen only.
<b>Commercial feasibility is NOT assessed</b> (see section 20).</p>
${s.criticalIssues.length
  ? `<p><b>Critical issues</b></p>${list(s.criticalIssues)}`
  : ''}

<h2>2. Site Identification</h2>
<table>${row('Site', m.siteName)}${row('Region', m.region)}
${row('Coordinates', `${m.coordinates.lat.toFixed(5)}, ${m.coordinates.lon.toFixed(5)}`)}
${row('Analysis date', m.date)}</table>

<h2>3. Screening Result</h2>
<table>${row('Technical screening', RESULT_LABEL[d.screeningResult])}
${row('Technical score', `${d.technicalScore} / 10`)}
${row('Data confidence', d.confidence)}</table>

<h2>4. Why This Result (score contribution)</h2>
<table>${contributionRows || row('Contributions', 'not available')}
<tr><td class="k"><b>Total (raw)</b></td><td class="v"><b>${d.contributions.reduce((a, c) => a + c.points, 0).toFixed(2)}</b> → reported ${d.technicalScore}/10</td></tr></table>
${d.contributions.some((c) => c.missingData)
  ? `<p class="warnbox">One or more inputs were unavailable and were scored neutrally rather than on evidence: ${esc(d.contributions.filter((c) => c.missingData).map((c) => c.label).join(', '))}.</p>`
  : ''}
<p><b>Key findings</b></p>${list(s.keyFindings)}

<h2>5. Demand / Population</h2>
<table>${row('Within 2 km', r.populationAnalysis.populationWithin2km.toLocaleString())}
${row('Within 5 km', r.populationAnalysis.populationWithin5km.toLocaleString())}
${row('Within 10 km', r.populationAnalysis.populationWithin10km.toLocaleString())}
${row('Local density', `${r.populationAnalysis.densityPerKm2.toLocaleString()} /km²`)}
${row('Classification', r.populationAnalysis.densityClassification)}
${row('Serviceable population', r.populationAnalysis.serviceablePopulation.toLocaleString())}
${row('Source', r.populationAnalysis.source === 'tower-proxy'
  ? 'ASSUMPTION — tower-density proxy (no raster)'
  : 'WorldPop 2020 (modelled, 1 km)')}</table>

<h2>6. Existing Tower Environment</h2>
<table>${row('Within 1 km', r.towerAnalysis.towersWithin1km.toLocaleString())}
${row('Within 2 km', r.towerAnalysis.towersWithin2km.toLocaleString())}
${row('Within 5 km', r.towerAnalysis.towersWithin5km.toLocaleString())}
${row('Density', `${r.towerAnalysis.densityPerKm2} /km²`)}
${row('Saturation', r.towerAnalysis.saturationClassification)}
${row('Source', 'Tarang Sanchar registry — 2022 vintage')}
${row('Co-location opportunity', r.towerAnalysis.colocationOpportunity ? 'Yes' : 'No')}</table>
${nearby ? `<p><b>Nearest towers</b></p><table>${nearby}</table>` : ''}

<h2>7. Network Opportunity</h2>
<p class="muted">Not assessed — no coverage or network layer is bundled. Tower counts indicate
competitor presence, not coverage need. A low tower count may indicate whitespace
<i>or</i> a coverage obligation; the data cannot distinguish these.</p>

<h2>8. Infrastructure Resources</h2>
<table>${row('Nearest fiber', r.resourceAnalysis.nearestFiber.distanceKm >= 50
  ? 'none within 50 km' : `${r.resourceAnalysis.nearestFiber.distanceKm} km`)}
${row('Fiber route', r.resourceAnalysis.nearestFiber.name ?? '—')}
${row('Accessibility', r.resourceAnalysis.fiberAccessibility)}
${row('Resource score', `${r.resourceAnalysis.resourceScore}/5`)}</table>

<h2>9. Fiber Availability</h2>
<p>Source: BharatNet / BBNL OFC (public networks). <b>Urban private fiber is not
represented.</b> A "Poor" accessibility grade does not mean no fiber exists.</p>

<h2>10. Soil / Terrain Screening</h2>
<table>${row('FAO code', r.soilAnalysis.faoCode ?? '—')}
${row('Soil type', r.soilAnalysis.soilType)}
${row('Foundation suitability', r.soilAnalysis.foundationSuitability)}
${row('Note', r.soilAnalysis.foundationNote)}</table>
<p class="muted">Screening only — FAO Digital Soil Map of the World (1:5M). A borehole /
plate-load test is required before foundation design.</p>

<h2>11. RF / RSRP Screening</h2>
<table>${row('Method', 'Free-space path loss (ITU-R P.525) + assumed Tx/gain')}
${row('Frequency', '2.1 GHz (assumed)')}
${row('Transmit power', '46 dBm (assumed)')}
${row('Antenna gain', '18 dBi (assumed)')}
${row('Terrain effect on RSRP', 'NOT APPLIED')}
${row('Clutter / interference / feeder / body loss', 'NOT MODELLED')}
${row('RSRP classification (strong/weak)', 'NOT DEFINED — no authoritative threshold')}</table>
<p class="warnbox"><b>FREE-SPACE SCREENING ESTIMATE.</b> This is not a terrain-aware RF
prediction. The terrain profile is computed separately (section 12) and is <b>not</b>
applied to this figure.</p>

${losSection}

<h2>13. Data Provenance</h2>
<table>${provenanceRows || row('Provenance', 'not recorded in this pack')}</table>

<h2>14. Data Quality / Confidence</h2>
<p><span class="conf c-${d.confidence}">${esc(d.confidence)}</span></p>
<p><b>Why this confidence:</b></p>${list(d.confidenceReasons)}

<h2>15. Assumptions</h2>${list(d.assumptions)}

<h2>16. Limitations</h2>${list(d.limitations)}

<h2>17. Sensitivity</h2>
${s.sensitivity ? `
<table>${row('Base verdict', s.sensitivity.base)}
${row('At -20% demand / saturation', s.sensitivity.low)}
${row('At +20% demand / saturation', s.sensitivity.high)}
${row('Robust to ±20% perturbation', s.sensitivity.robust ? 'Yes' : 'No — verdict flips')}</table>
<p class="${s.sensitivity.robust ? 'muted' : 'warnbox'}">${esc(s.sensitivity.note)}</p>
<p class="lim">Perturbation of the product's own classification bands; not a statistical confidence interval.</p>`
: '<p class="muted">Not computed for this report.</p>'}

<h2>18. Unknowns / Required Field Validation</h2>${list(d.warnings.length ? d.warnings : ['No data-quality warnings for this site.'])}
<p><b>What would change this result:</b></p>${list(d.whatWouldChange)}

<h2>19. Recommended Next Actions</h2>
<p>${esc(d.nextStep)}</p>
<p><b>Regulatory &amp; Right-of-Way</b> (product-encoded checklist, not verified against a live portal)</p>
<table>${row('State', r.rowAnalysis.state)}
${row('Governing authority', r.adminAnalysis.governingAuthority)}
${row('RoW application fee', `₹${r.rowAnalysis.applicationFee.toLocaleString()}`)}
${row('Estimated total RoW cost', `₹${r.rowAnalysis.estimatedTotalCost.toLocaleString()}`)}
${row('Approval timeline', `${r.rowAnalysis.approvalTimelineDays} days (deemed approval ${r.rowAnalysis.deemedApprovalDays} days)`)}</table>
${r.rowAnalysis.requiredDocuments.length
  ? `<p><b>Required documents</b></p>${list(r.rowAnalysis.requiredDocuments)}`
  : ''}

<h2>20. Commercial Feasibility Status</h2>
<p><b>COMMERCIAL FEASIBILITY: NOT ASSESSED.</b></p>
${list(d.notAssessed)}

<div class="disc"><b>Disclaimers.</b>
Tower locations are from the Tarang Sanchar registry (<b>2022 vintage</b>) and may undercount recent builds.
Soil classification is derived from the FAO Digital Soil Map of the World (1:5M) — a screening input only;
a geotechnical survey (borehole / plate-load test) is required before foundation design.
Population figures are modelled (WorldPop 2020, 1 km grid), not a census.
Fiber data covers BharatNet/BBNL public networks; urban private fiber is not represented.
RF figures are free-space screening estimates, not coverage predictions.
This report supports planning and does not constitute engineering, commercial or legal advice.</div>

<div class="foot">TowerFeasibility Pro v1.0 · Digital Shift Solutions · generated offline</div>
</body></html>`;
}
