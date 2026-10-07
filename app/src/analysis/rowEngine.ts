/**
 * Feature 4 — RoW (Right of Way) Compliance.
 *
 * Rules come from rules/row-rules-2024.json in the data pack
 * (parsed from the DoT Telecommunications (Right of Way) Rules, 2024).
 */
import type { RowResult } from '../models';

export interface RowRules {
  application_fees: Record<string, number>;
  approval_timelines: {
    clarification_days: number;
    rejection_days: number;
    deemed_approval_days: number;
    special_project_days: number;
  };
  required_documents: string[];
  state_specific_rules?: Record<string, unknown>;
}

export const DEFAULT_ROW_RULES: RowRules = {
  application_fees: {
    mobile_tower: 10000,
    overground_line_per_km: 1000,
    underground_ofc_per_km: 1000,
    small_cell_street_furniture_urban: 300,
    small_cell_street_furniture_rural: 150,
    telecom_line_street_furniture: 100,
  },
  approval_timelines: {
    clarification_days: 30,
    rejection_days: 45,
    deemed_approval_days: 67,
    special_project_days: 7,
  },
  required_documents: [
    'Application form (Form-I)',
    'Proof of ownership / lease agreement for the site',
    'Layout plan showing tower position and access',
    'Structural stability certificate',
    'EMF self-certification (DoT format)',
    'GST registration / PAN of the applicant',
    'No-objection from the local authority (if applicable)',
  ],
};

export function analyzeRow(
  state: string, rules: RowRules = DEFAULT_ROW_RULES,
): RowResult {
  const applicationFee = rules.application_fees.mobile_tower ?? 10000;
  // base tower fee + a nominal street-furniture component
  const streetFurniture = rules.application_fees.telecom_line_street_furniture ?? 100;
  return {
    state,
    applicationFee,
    estimatedTotalCost: applicationFee + streetFurniture,
    approvalTimelineDays: rules.approval_timelines.rejection_days,
    deemedApprovalDays: rules.approval_timelines.deemed_approval_days,
    requiredDocuments: rules.required_documents,
  };
}
