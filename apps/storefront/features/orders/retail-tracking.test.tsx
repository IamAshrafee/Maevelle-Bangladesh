import { it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PublicOrderTrackingDto } from '@maevelle/contracts';
import { transformPublicTrackingToConsignment } from './types';
import { OrderTrackView } from './components/order-track-view';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: () => {}, push: () => {} }),
}));
it('does not render a simulated consignment, amount or recent customer before an authorized result', () => {
  const html = renderToStaticMarkup(<OrderTrackView />);
  for (const value of ['MB-84291', 'Nusrat Jahan', 'Total Settled', 'Recent:', '01844-399210'])
    expect(html).not.toContain(value);
  expect(html).toContain('Track Your Order');
});
it('retains exact original total and never invents carrier, rider, estimate or receipt verification', () => {
  const value = transformPublicTrackingToConsignment({
    orderNumber: 'SYN-EXACT',
    status: 'CONFIRMED',
    fulfillmentStatus: 'PENDING',
    createdAt: '2026-11-10T00:00:00Z',
    paymentMethod: 'COD',
    total: '81.1250',
    destination: {},
    delivery: null,
    lines: [
      {
        productTitle: 'Synthetic item',
        variantTitle: 'Variant',
        quantity: '1',
        unitPrice: '81.1250',
        net: '81.1250',
      },
    ],
  } as unknown as PublicOrderTrackingDto);
  expect(value.originalPayable).toBe('81.1250');
  expect(value.items[0]!.unitPrice).toBe('81.1250');
  expect(value.carrierName).toBe('Courier not assigned');
  expect(value.estimatedArrivalTitle).toBe('Delivery estimate unavailable');
  expect(JSON.stringify(value)).not.toMatch(
    /Verified payment|Pathao Logistics|01844-399210|Tomorrow|Quality Approved/,
  );
});
