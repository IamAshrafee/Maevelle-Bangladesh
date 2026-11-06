import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PaymentMethodsUnavailable,
  SyntheticOrderPaymentPreview,
} from './components/payment-foundation';
it('shows no selectable methods, amount due, receiving account or public submission in the real review', () => {
  const html = renderToStaticMarkup(<PaymentMethodsUnavailable />);
  expect(html).toContain('No amount is due');
  expect(html).not.toContain('<input');
  expect(html).not.toContain('01894623835');
  expect(html).not.toContain('Send Money');
});
it('labels all synthetic committed-Order presentations and keeps claims disabled', () => {
  for (const provider of ['COD', 'bKash', 'Nagad'] as const) {
    const html = renderToStaticMarkup(
      <SyntheticOrderPaymentPreview
        context={{
          kind: 'SYNTHETIC_PREVIEW',
          provider,
          orderReference: 'SYNTHETIC-ONLY',
          payable: '100.0000',
          receivingNumber: 'SYNTHETIC-NUMBER',
          accountType: 'Synthetic category',
          transferAction: 'Synthetic approved action',
          instructions: 'Do not transfer real funds',
          deadline: 'Synthetic deadline',
          status: 'PARTIALLY_PAID',
          outstanding: '20.0000',
        }}
      />,
    );
    expect(html).toContain('not an actual payable Order');
    expect(html).not.toContain('action=');
    if (provider === 'COD') expect(html).toContain('unpaid until actual collection');
    else {
      expect(html).toContain('disabled');
      expect(html).toContain('optional');
    }
  }
});
