import { describe, expect, it } from 'vitest';

import type { PurchaseDto } from '@maevelle/contracts';

import { nextPurchaseAction, percentage, purchaseWorkflowStatus } from '../lib/supply/status.js';

function purchase(
  status: PurchaseDto['status'],
  quantities: { ordered: string; allocated: string; received: string },
): PurchaseDto {
  return {
    id: 'purchase-1',
    purchaseNumber: 'PO-1',
    supplierId: 'supplier-1',
    supplierName: 'Supplier',
    currencyCode: 'BDT',
    status,
    orderDate: '2026-09-20',
    createdAt: '2026-09-20T00:00:00.000Z',
    totalAmount: '100.0000',
    version: 1,
    lines: [
      {
        id: 'line-1',
        variantId: 'variant-1',
        productId: 'product-1',
        sku: 'SKU-1',
        productTitle: 'Product',
        quantity: quantities.ordered,
        allocatedQuantity: quantities.allocated,
        receivedQuantity: quantities.received,
        unitPrice: '10.0000',
      },
    ],
  };
}

describe('Supply workflow status', () => {
  it('keeps authoritative draft and cancelled purchase states', () => {
    expect(
      purchaseWorkflowStatus(purchase('DRAFT', { ordered: '10', allocated: '0', received: '0' })),
    ).toBe('DRAFT');
    expect(
      purchaseWorkflowStatus(
        purchase('CANCELLED', { ordered: '10', allocated: '10', received: '10' }),
      ),
    ).toBe('CANCELLED');
  });

  it('derives shipment and receipt progress from line quantities', () => {
    expect(
      purchaseWorkflowStatus(purchase('PLACED', { ordered: '10', allocated: '4', received: '0' })),
    ).toBe('PARTIALLY_SHIPPED');
    expect(
      purchaseWorkflowStatus(purchase('PLACED', { ordered: '10', allocated: '10', received: '3' })),
    ).toBe('PARTIALLY_RECEIVED');
    expect(
      purchaseWorkflowStatus(
        purchase('PLACED', { ordered: '10', allocated: '10', received: '10' }),
      ),
    ).toBe('RECEIVED');
  });

  it('provides the operational next step and clamps progress', () => {
    const partiallyReceived = purchase('PLACED', {
      ordered: '10',
      allocated: '10',
      received: '3',
    });

    expect(nextPurchaseAction(partiallyReceived)).toBe('Receive remaining goods');
    expect(percentage(12, 10)).toBe(100);
    expect(percentage(1, 0)).toBe(0);
  });
});
