import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CheckoutOrderPaymentDto } from '@maevelle/contracts';
import { CodPaymentSummary } from './components/cod-payment-summary';
import { Money } from '@/components/commerce/price';

const payment = {
  originalPayable: '81.0000',
  allocated: '80.0000',
  authorizedWaiver: '1.0000',
  outstanding: '0.0000',
  currency: 'BDT',
  method: 'COD',
  paymentStatus: 'PARTIALLY_PAID',
  settlementStatus: 'SETTLED_WITH_ADJUSTMENT',
  orderStatus: 'COMPLETED',
  obligationStatus: 'SATISFIED',
  refundedFromAllocation: '0.0000',
  refundStates: [],
  unallocatedAtVerification: '0.0000',
} as unknown as CheckoutOrderPaymentDto;
it('renders original81/cash80/waiver1/due0 without claiming full cash receipt or requesting more cash', () => {
  const html = renderToStaticMarkup(<CodPaymentSummary payment={payment} />);
  for (const text of [
    '৳81',
    '৳80',
    '৳1',
    '৳0',
    'Settled with adjustment',
    'Partially paid',
    'Actual funds received',
  ])
    expect(html).toContain(text);
  for (const text of [
    'collected and settled in full',
    'Please have',
    'Transaction ID',
    'collectionEvidenceReference',
    'approvedBy',
  ])
    expect(html).not.toContain(text);
});
it('keeps historical fractions exact and flags inconsistent whole authority accessibly', () => {
  const html = renderToStaticMarkup(
    <>
      <Money amount="299.2500" />
      <Money amount="299.2500" mode="WHOLE_BDT" />
      <Money amount={null} />
    </>,
  );
  expect(html).toContain('৳299.25');
  expect(html).toContain('Amount needs review');
  expect(html).toContain('point 2 5');
  expect(html).toContain('Amount unavailable');
});
it('never requests COD after cancellation or refund and shows reversal balance from server', () => {
  const cancelled = renderToStaticMarkup(
    <CodPaymentSummary
      payment={{
        ...payment,
        orderStatus: 'CANCELLED',
        settlementStatus: 'OPEN',
        outstanding: '81.0000',
      }}
    />,
  );
  expect(cancelled).not.toContain('Please have');
  const reversed = renderToStaticMarkup(
    <CodPaymentSummary
      payment={{
        ...payment,
        authorizedWaiver: '0.0000',
        settlementStatus: 'OPEN',
        outstanding: '1.0000',
        hasReceiptReversal: true,
        refundStates: ['COMPLETED'],
      }}
    />,
  );
  expect(reversed).toContain('Receipt reversal');
  expect(reversed).not.toContain('Please have');
});
