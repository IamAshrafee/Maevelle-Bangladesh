import { it, expect } from 'vitest';
import type { CheckoutFinalTermsDto } from '@maevelle/contracts';
import { publicFinalTerms } from './routes/checkout-public-money.js';
it('removes internal approval and invoice evidence while preserving customer rounding authority', () => {
  const terms = {
    payable: '81.0000',
    roundingAdjustment: '0.4000',
    fingerprint: 'immutable',
    wholeTakaPolicy: {
      version: 'v1',
      currency: 'BDT',
      unit: '1.0000',
      mode: 'HALF_UP',
      boundary: 'AFTER_DISCOUNTS_SHIPPING_TAX_AND_FEES',
      negativeTreatment: 'SYMMETRIC',
      approval: { approvedBy: 'PRIVATE_ACTOR', reference: 'PRIVATE_APPROVAL' },
      invoiceTreatmentReference: 'PRIVATE_INVOICE',
    },
  } as unknown as CheckoutFinalTermsDto;
  const safe = publicFinalTerms(terms);
  expect(safe).toMatchObject({
    payable: '81.0000',
    roundingAdjustment: '0.4000',
    fingerprint: 'immutable',
    wholeTakaPolicy: { version: 'v1', mode: 'HALF_UP' },
  });
  expect(JSON.stringify(safe)).not.toContain('PRIVATE_');
  expect(JSON.stringify(terms)).toContain('PRIVATE_');
});
