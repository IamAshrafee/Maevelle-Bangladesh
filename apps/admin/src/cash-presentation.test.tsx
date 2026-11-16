import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminCapabilitiesProvider } from '../components/admin-capabilities';
import { CashPolicyPanel } from '../components/payments/cash-policy-panel';
import { OrderItemsCard } from '../components/orders/order-items-card';
import type { OrderDetailDto } from '@maevelle/contracts';
import {
  CashSettlementPanel,
  SettlementFigures,
} from '../components/payments/cash-settlement-panel';

it('distinguishes original, collected, waiver, balance and refunds in the management summary', () => {
  const html = renderToStaticMarkup(
    <SettlementFigures
      settlement={{
        originalPayable: '81.0000',
        actualCollected: '80.0000',
        authorizedWaiver: '1.0000',
        outstanding: '0.0000',
        refunded: '0.0000',
        settlementStatus: 'SETTLED_WITH_ADJUSTMENT',
        accountingStatus: 'NON_CASH_OPERATIONAL_RECORD_ONLY',
      }}
    />,
  );
  for (const t of ['৳81', '৳80', '৳1', '৳0', 'Actual Received', 'Settled with adjustment'])
    expect(html).toContain(t);
  expect(html).not.toContain('81.0000');
});
it('does not mount financial controls or policy details for unauthorized staff', () => {
  const html = renderToStaticMarkup(
    <AdminCapabilitiesProvider capabilities={[]}>
      <CashSettlementPanel orderId="selected-order" />
      <CashPolicyPanel />
    </AdminCapabilitiesProvider>,
  );
  expect(html).toContain('permission is required');
  expect(html).not.toContain('Propose cash policy');
  expect(html).not.toContain('Correct adjustment');
});
it('keeps original Order tax, fees and rounding distinct with exact decimal presentation', () => {
  const order = {
    lines: [],
    currency: 'BDT',
    merchandiseGross: '80.6000',
    discountTotal: '0.0000',
    merchandiseNet: '80.6000',
    deliveryAmount: '0.0000',
    taxAmount: '0.0000',
    paymentFees: '0.0000',
    roundingAdjustment: '0.4000',
    total: '81.0000',
  } as unknown as OrderDetailDto;
  const html = renderToStaticMarkup(<OrderItemsCard order={order} onUpdated={() => {}} />);
  expect(html).toContain('৳80.6');
  expect(html).toContain('৳81');
  expect(html).toContain('Rounding adjustment');
  expect(html).toContain('+৳0.4');
  expect(html).toContain('Payment fees');
});
