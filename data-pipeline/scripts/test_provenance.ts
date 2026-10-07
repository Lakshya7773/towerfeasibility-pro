/**
 * ============================================================================
 * PROVENANCE / VINTAGE INTEGRITY TESTS
 * ============================================================================
 *
 * Guards the defect that let the shipped manifest claim the tower registry was
 * 2024-vintage when the source is 2022.
 *
 * A dataset's *vintage* is a property of the upstream product. A *build date*
 * is when we happened to run the packer. Conflating the two misrepresents how
 * old the data is — an error a professional user cannot detect from the app.
 *
 * Run: npx tsx data-pipeline/scripts/test_provenance.ts
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail: string) {
  if (cond) { pass++; console.log(`  PASS  ${name}  -> ${detail}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}  -> ${detail}`); }
}
function section(t: string) {
  console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);
}

const ROOT = '/home/lakshya/company/towerfeasibility';
const MANIFESTS = [
  `${ROOT}/app/assets/packs/data-pack-rajasthan/manifest.json`,
  `${ROOT}/dist/packs/data-pack-rajasthan/manifest.json`,
];

section('1. MANIFEST VINTAGES — must reflect the upstream source, not the build');
for (const path of MANIFESTS) {
  const label = path.includes('app/assets') ? 'app assets' : 'dist';
  let m: any;
  try { m = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { check(`${label} manifest readable`, false, String(e)); continue; }

  const sd = m.source_dates ?? {};
  // The defect: Tarang Sanchar is a 2022 registry. It must not claim 2024.
  check(`${label}: towers vintage is 2022 (not the old 2024 build-date value)`,
    sd.towers === '2022', `towers=${sd.towers}`);
  check(`${label}: population vintage is 2020`,
    sd.population === '2020', `population=${sd.population}`);
  check(`${label}: soil vintage is 2007`,
    sd.soil === '2007', `soil=${sd.soil}`);
  check(`${label}: elevation vintage is 2000`,
    sd.elevation === '2000', `elevation=${sd.elevation}`);

  // No vintage may be a full ISO timestamp (a build date masquerading as a vintage).
  for (const [k, v] of Object.entries(sd)) {
    check(`${label}: ${k} vintage is a plain date, not a build timestamp`,
      typeof v === 'string' && !/T\d{2}:\d{2}/.test(v as string), `${v}`);
  }

  // The provenance block must be present with the required fields.
  const prov = m.provenance ?? {};
  check(`${label}: provenance block present`, Object.keys(prov).length >= 6,
    `${Object.keys(prov).length} datasets`);
  for (const k of ['towers', 'fiber', 'soil', 'population', 'elevation']) {
    const p = prov[k];
    check(`${label}: ${k} provenance has source/type/vintage/limitation`,
      !!(p && p.source && p.type && p.vintage && p.limitation),
      p ? `${p.source} · ${p.type} · ${p.vintage}` : 'missing');
  }

  // The tower limitation must disclose the 2022 vintage in-band.
  check(`${label}: towers provenance discloses 2022 vintage`,
    prov.towers?.vintage === '2022', `vintage=${prov.towers?.vintage}`);
}

section('2. SOURCE OF TRUTH — provenance.py is authoritative');
const py = readFileSync(`${ROOT}/data-pipeline/scripts/provenance.py`, 'utf8');
check('provenance.py defines the tower vintage as 2022',
  /"towers"[\s\S]*?"vintage":\s*"2022"/.test(py), '2022');
// The string may appear in the module's explanatory docstring (it explains the
// bug being fixed); what must NOT exist is the date as an assigned VALUE.
check('provenance.py does not assign the stale 2024-06-01 tower date',
  !/["']2024-06-01["']/.test(py), 'absent');
const buildPack = readFileSync(`${ROOT}/data-pipeline/scripts/build_pack.py`, 'utf8');
check('build_pack.py imports provenance (no inline dates)',
  /import provenance/.test(buildPack), 'imported');
check('build_pack.py has no inline 2024-06-01 tower literal',
  !/2024-06-01/.test(buildPack), 'absent');
check('build_pack.py takes source_dates from provenance.vintage_map()',
  /source_dates["']?:\s*provenance\.vintage_map\(\)/.test(buildPack), 'wired');

section('3. NO FABRICATED AUTHORITY');
// The product must not carry invented commercial numbers anywhere in the report path.
for (const f of ['app/src/report/reportHtml.ts', 'app/src/report/DecisionObject.ts']) {
  const src = readFileSync(`${ROOT}/${f}`, 'utf8');
  // Either the literal phrase or the explicit enumeration of the missing model.
  check(`${f}: states commercial feasibility is not assessed`,
    /NOT ASSESSED/.test(src) || /COMMERCIAL FEASIBILITY\s*[—-]\s*no CAPEX/i.test(src), 'yes');
  check(`${f}: no invented CAPEX/OPEX/ARPU/ROI figures`,
    !/\b(CAPEX|OPEX|ARPU|ROI|payback)\b\s*[:=]\s*\d/i.test(src), 'clean');
}

console.log(`\n${'='.repeat(78)}`);
console.log(`PROVENANCE TESTS: ${pass} passed, ${fail} failed`);
if (fail) console.log(`FAILED: ${failures.join(' | ')}`);
console.log('='.repeat(78));
process.exit(fail ? 1 : 0);
