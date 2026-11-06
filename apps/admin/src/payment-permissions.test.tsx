import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RefundDto } from '@maevelle/contracts';
import { AdminCapabilitiesProvider } from '../components/admin-capabilities';
import { RefundOperations } from '../components/payments/refund-operations';
import { DestinationPanel } from '../components/payments/destination-panel';
const refund = {
  id: 'synthetic',
  amount: '20.0000',
  currency: 'BDT',
  status: 'UNKNOWN_EXTERNAL_OUTCOME',
  version: 1,
} as RefundDto;
it('does not render money mutation actions for review-only staff', () => {
  const html = renderToStaticMarkup(
    <AdminCapabilitiesProvider capabilities={['payments.review', 'payments.view']}>
      <RefundOperations refund={refund} onRefresh={() => {}} />
    </AdminCapabilitiesProvider>,
  );
  expect(html).toBe('');
});
it('shows reconciliation rather than an automatic payout retry for unknown outcomes', () => {
  const html = renderToStaticMarkup(
    <AdminCapabilitiesProvider capabilities={['refunds.manage']}>
      <RefundOperations refund={refund} onRefresh={() => {}} />
    </AdminCapabilitiesProvider>,
  );
  expect(html).toContain('Do not send again');
  expect(html).toContain('Record independently confirmed payout');
  expect(html).not.toContain('Retry transfer');
});
it('does not expose destination details or create controls without destination permission', () => {
  const html = renderToStaticMarkup(
    <AdminCapabilitiesProvider capabilities={['payments.view']}>
      <DestinationPanel />
    </AdminCapabilitiesProvider>,
  );
  expect(html).toContain('viewing permission is required');
  expect(html).not.toContain('Create draft destination');
});
