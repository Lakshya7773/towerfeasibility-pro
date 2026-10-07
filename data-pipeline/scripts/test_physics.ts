/**
 * Technical-richness probe: verify the LoS physics against textbook formulas.
 * These are the numbers a telecom engineer would sanity-check.
 */
import { curvatureBulgeM, fresnelRadiusM, fsplDb, earthCurvatureDropM } from '../../app/src/utils/geo';

let pass = 0, fail = 0;
const check = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} got ${got.toFixed(3).padStart(9)}  want ${want.toFixed(3).padStart(9)}  (±${tol})`);
};

console.log('=== EARTH CURVATURE ===');
// Geometric drop over distance d: d^2/(2R), R=6371 km
check('drop @1 km  (d²/2R)', earthCurvatureDropM(1), (1 * 1) / (2 * 6371) * 1000, 0.01);
check('drop @10 km (d²/2R)', earthCurvatureDropM(10), (10 * 10) / (2 * 6371) * 1000, 0.05);
check('drop @50 km (d²/2R)', earthCurvatureDropM(50), (50 * 50) / (2 * 6371) * 1000, 0.5);

console.log('\n=== MIDSPAN BULGE (zero at endpoints, max at midspan) ===');
// The app uses the GEOMETRIC bulge (k=1): d1*d2/(2R). This is conservative —
// it overestimates the bulge by 33% vs the standard k=4/3 effective-earth
// model, so it reports more obstructions. Defensible for a screening tool.
check('bulge at start (d1=0)', curvatureBulgeM(0, 10), 0, 1e-9);
check('bulge at end   (d2=0)', curvatureBulgeM(10, 0), 0, 1e-9);
const mid10 = curvatureBulgeM(5, 5);
check('bulge midspan 10 km  (d1d2/2R, k=1)', mid10, (5 * 5) / (2 * 6371) * 1000, 0.15);
const mid50 = curvatureBulgeM(25, 25);
check('bulge midspan 50 km  (d1d2/2R, k=1)', mid50, (25 * 25) / (2 * 6371) * 1000, 0.5);
// symmetry
check('bulge symmetric', curvatureBulgeM(3, 7), curvatureBulgeM(7, 3), 1e-9);
// conservative vs k=4/3 effective
const k43 = (25 * 25) / (2 * 1.333 * 6371) * 1000;
check('geometric bulge > k=4/3 effective (conservative)', mid50 > k43 ? 1 : 0, 1, 1e-9);

console.log('\n=== FRESNEL ZONE RADIUS ===');
// F1 = 17.32 * sqrt(d1*d2 / (f_GHz * d_km))  metres
const f1 = (d1, d2, f) => 17.32 * Math.sqrt((d1 * d2) / (f * (d1 + d2)));
check('F1 10 km @2.1 GHz midspan', fresnelRadiusM(5, 5, 2.1), f1(5, 5, 2.1), 0.2);
check('F1 10 km @3.5 GHz midspan', fresnelRadiusM(5, 5, 3.5), f1(5, 5, 3.5), 0.2);
check('F1 30 km @2.1 GHz midspan', fresnelRadiusM(15, 15, 2.1), f1(15, 15, 2.1), 0.3);
check('F1 10 km @2.1 near end (1,9)', fresnelRadiusM(1, 9, 2.1), f1(1, 9, 2.1), 0.2);
// higher frequency -> smaller zone
const lo = fresnelRadiusM(5, 5, 2.1), hi = fresnelRadiusM(5, 5, 5.0);
check('higher freq shrinks zone', lo > hi ? 1 : 0, 1, 1e-9);

console.log('\n=== FREE-SPACE PATH LOSS ===');
// FSPL = 20log10(d_km) + 20log10(f_MHz) + 32.45
const fspl = (dKm, fMhz) => 20 * Math.log10(dKm) + 20 * Math.log10(fMhz) + 32.45;
check('FSPL 1 km  @2100 MHz', fsplDb(1, 2100), fspl(1, 2100), 0.05);
check('FSPL 10 km @2100 MHz', fsplDb(10, 2100), fspl(10, 2100), 0.05);
check('FSPL 1 km  @3500 MHz', fsplDb(1, 3500), fspl(1, 3500), 0.05);
check('FSPL 10 km @700 MHz', fsplDb(10, 700), fspl(10, 700), 0.05);
// 6 dB per doubling of distance
const d1 = fsplDb(5, 2100), d2 = fsplDb(10, 2100);
check('+6 dB per distance doubling', d2 - d1, 6.0206, 0.02);

console.log(`\n${'='.repeat(78)}`);
console.log(`PHYSICS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail ? 1 : 0);
