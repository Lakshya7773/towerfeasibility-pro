/**
 * Feature 8 — PDF report rendering (expo-print, on-device, offline).
 *
 * The HTML itself lives in reportHtml.ts (pure, testable); this module only
 * adds the native render step.
 */
import * as Print from 'expo-print';
import type { FeasibilityReport } from '../models';
import { buildReportHtml } from './reportHtml';

export { buildReportHtml } from './reportHtml';

export async function generateReportPdf(r: FeasibilityReport): Promise<string> {
  const html = buildReportHtml(r);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}
