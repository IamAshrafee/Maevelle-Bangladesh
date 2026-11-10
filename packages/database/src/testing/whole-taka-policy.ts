import type { WholeTakaPolicyDto } from '@maevelle/contracts';
/** Candidate algorithm, qualified only for isolated synthetic acceptance. Never a live resolver default. */
export const syntheticWholePolicy: WholeTakaPolicyDto = {
  version: 'SYNTHETIC-bdt-half-up-v1',
  currency: 'BDT',
  unit: '1.0000',
  mode: 'HALF_UP',
  boundary: 'AFTER_DISCOUNTS_SHIPPING_TAX_AND_FEES',
  negativeTreatment: 'SYMMETRIC',
  invoiceTreatmentReference: 'Synthetic invoice fixture only',
  approval: {
    scope: 'SYNTHETIC',
    reference: 'Synthetic approval only',
    approvedBy: 'synthetic-independent-reviewer',
    approvedAt: '2026-01-01T00:00:00Z',
  },
};
