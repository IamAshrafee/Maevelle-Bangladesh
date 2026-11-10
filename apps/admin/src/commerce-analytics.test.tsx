import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CommerceMeasurementReportDto } from '@maevelle/contracts';
import { CommerceTables } from '../components/analytics/views/commerce-tables';
import { paymentMoney } from '../lib/payments/transport';

const data: CommerceMeasurementReportDto = {
  schemaVersion: 1,
  trafficClass: 'SYNTHETIC',
  timezone: 'UTC',
  facts: [
    { name: 'ORDER_COMMITTED', currency: 'BDT', count: '1', amount: '0.0000', allocated: null },
    {
      name: 'PAYMENT_VERIFIED',
      currency: 'BDT',
      count: '2',
      amount: '9007199254740993.0001',
      allocated: '100.0000',
    },
    { name: 'PAYMENT_CLAIM_SUBMITTED', currency: null, count: '1', amount: null, allocated: null },
  ],
  acceptedSteps: [],
  entries: [],
  health: [],
  operations: [],
  conversionRate: null,
  conversionRateReason: 'UNAVAILABLE',
  revenueAuthority: 'FINANCE',
  conversionPolicy: {
    version: 'unapproved-v1',
    ga4: false,
    meta: false,
    advancedMatching: false,
    purchaseQualification: 'UNAPPROVED',
  },
  coverage: 'Synthetic',
};
it('preserves exact zero and large decimal amounts while distinguishing Order, claim and receipt', () => {
  const html = renderToStaticMarkup(<CommerceTables data={data} />);
  expect(html).toContain('BDT 0.0000');
  expect(html).toContain('BDT 9,007,199,254,740,993.0001');
  expect(html).toContain('Not recorded');
  expect(html).toContain('Unverified claims');
  expect(html).toContain('Do not add these amounts together as revenue');
  expect(paymentMoney('99999999999999999999.9999')).toBe('BDT 99,999,999,999,999,999,999.9999');
});
it('renders honest empty reporting without fabricating a zero conversion rate', () => {
  const html = renderToStaticMarkup(<CommerceTables data={{ ...data, facts: [] }} />);
  expect(html).toContain('No commerce facts');
  expect(html).toContain('not a zero conversion rate');
  expect(html).not.toContain('0%');
});
