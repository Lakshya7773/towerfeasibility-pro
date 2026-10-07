/**
 * Pure HTML builder for the feasibility report.
 *
 * Kept free of any expo/native imports so it can be rendered and tested
 * outside the app (and reused by any renderer).
 */
import type { FeasibilityReport } from '../models';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const row = (k: string, v: unknown) =>
  `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;

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

export function buildReportHtml(r: FeasibilityReport): string {
  const m = r.metadata;
  const s = r.executiveSummary;
  const badge = (t: string, cls: string) => `<span class="badge ${cls}">${esc(t)}</span>`;
  const recCls = s.recommendation === 'Go' ? 'good'
    : s.recommendation === 'Conditional' ? 'warn' : 'bad';

  const nearby = r.towerAnalysis.nearbyTowers
    .map((t) => row(`Tower #${t.id}`, `${t.distanceKm.toFixed(2)} km · ${t.installationType ?? 'n/a'}`))
    .join('');

  const losSection = r.losAnalysis ? `
    <h2>8. Line-of-Sight / Terrain</h2>
    <table>${row('Status', r.losAnalysis.losStatus)}
      ${row('Path distance', `${r.losAnalysis.distanceKm} km`)}
      ${row('Fresnel clearance', r.losAnalysis.fresnelClearance ? 'Yes' : 'No')}
      ${row('Recommended tower height', `${r.losAnalysis.recommendedTowerHeight} m`)}
      ${row('Free-space path loss', `${r.losAnalysis.pathLossDb} dB`)}
      ${row('Estimated RSRP', `${r.losAnalysis.estimatedRsrpDbm} dBm`)}</table>
    ${terrainSvg(r.losAnalysis.terrainProfile)}` : `
    <h2>8. Line-of-Sight / Terrain</h2>
    <p class="muted">Elevation data is not included in this data pack
    (Lite tier), so terrain-aware line-of-sight analysis is unavailable.
    Install a Full pack for this section. All other sections are unaffected.</p>`;

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
  .good{background:#16a34a}.warn{background:#d97706}.bad{background:#dc2626}
  .score{font-size:34px;font-weight:800;color:#1e40af}
  ul{margin:4px 0 4px 16px;padding:0} li{margin:2px 0}
  .muted{color:#94a3b8;font-style:italic}
  .disc{margin-top:24px;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:10px;color:#78350f}
  .foot{margin-top:18px;color:#94a3b8;font-size:10px;text-align:center}
</style></head><body>
<h1>Tower Feasibility Report</h1>
<div class="sub">${esc(m.siteName)} · ${esc(m.region)} · ${esc(m.date)}<br/>
Coordinates: ${m.coordinates.lat.toFixed(5)}, ${m.coordinates.lon.toFixed(5)} · Prepared by ${esc(m.preparedBy)}</div>

<h2>1. Executive Summary</h2>
<div class="score">${s.overallScore}/10 &nbsp; ${badge(s.recommendation, recCls)}</div>
<p><b>Key findings</b></p><ul>${s.keyFindings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
${s.criticalIssues.length
  ? `<p><b>Critical issues</b></p><ul>${s.criticalIssues.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
  : ''}

<h2>2. Population Density</h2>
<table>${row('Within 2 km', r.populationAnalysis.populationWithin2km.toLocaleString())}
${row('Within 5 km', r.populationAnalysis.populationWithin5km.toLocaleString())}
${row('Within 10 km', r.populationAnalysis.populationWithin10km.toLocaleString())}
${row('Local density', `${r.populationAnalysis.densityPerKm2.toLocaleString()} /km²`)}
${row('Classification', r.populationAnalysis.densityClassification)}
${row('Serviceable population', r.populationAnalysis.serviceablePopulation.toLocaleString())}</table>

<h2>3. Competitor Towers</h2>
<table>${row('Within 1 km', r.towerAnalysis.towersWithin1km.toLocaleString())}
${row('Within 2 km', r.towerAnalysis.towersWithin2km.toLocaleString())}
${row('Within 5 km', r.towerAnalysis.towersWithin5km.toLocaleString())}
${row('Density', `${r.towerAnalysis.densityPerKm2} /km²`)}
${row('Saturation', r.towerAnalysis.saturationClassification)}
${row('Co-location opportunity', r.towerAnalysis.colocationOpportunity ? 'Yes' : 'No')}</table>
${nearby ? `<p><b>Nearest towers</b></p><table>${nearby}</table>` : ''}

<h2>4. Nearby Resources</h2>
<table>${row('Nearest fiber', r.resourceAnalysis.nearestFiber.distanceKm >= 50
  ? 'none within 50 km' : `${r.resourceAnalysis.nearestFiber.distanceKm} km`)}
${row('Fiber route', r.resourceAnalysis.nearestFiber.name ?? '—')}
${row('Accessibility', r.resourceAnalysis.fiberAccessibility)}
${row('Resource score', `${r.resourceAnalysis.resourceScore}/5`)}</table>

<h2>5. RoW Compliance</h2>
<table>${row('State', r.rowAnalysis.state)}
${row('Application fee', `₹${r.rowAnalysis.applicationFee.toLocaleString()}`)}
${row('Estimated total', `₹${r.rowAnalysis.estimatedTotalCost.toLocaleString()}`)}
${row('Approval timeline', `${r.rowAnalysis.approvalTimelineDays} days (deemed approval ${r.rowAnalysis.deemedApprovalDays} days)`)}</table>
<p><b>Required documents</b></p><ul>${r.rowAnalysis.requiredDocuments.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>

<h2>6. Soil &amp; Foundation</h2>
<table>${row('FAO code', r.soilAnalysis.faoCode ?? '—')}
${row('Soil type', r.soilAnalysis.soilType)}
${row('Foundation suitability', r.soilAnalysis.foundationSuitability)}
${row('Note', r.soilAnalysis.foundationNote)}</table>

<h2>7. Administration</h2>
<table>${row('State', r.adminAnalysis.state)}
${row('District', r.adminAnalysis.district ?? '—')}
${row('Governing authority', r.adminAnalysis.governingAuthority)}</table>
<p><b>Compliance requirements</b></p><ul>${r.adminAnalysis.complianceRequirements.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>

${losSection}

<div class="disc"><b>Disclaimers.</b>
Tower locations are from the Tarang Sanchar registry (2022 vintage) and may undercount recent builds.
Soil classification is derived from the FAO Digital Soil Map of the World (1:5M) — a screening input only;
a geotechnical survey (borehole / plate-load test) is required before foundation design.
Population figures are modelled (WorldPop 2020, 1 km grid), not a census.
Fiber data covers BharatNet/BBNL public networks; urban private fiber is not represented.
This report supports planning and does not constitute engineering or legal advice.</div>

<div class="foot">TowerFeasibility Pro v1.0 · Digital Shift Solutions · generated offline</div>
</body></html>`;
}
