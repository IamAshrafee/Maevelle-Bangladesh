import { describe, expect, it } from 'vitest';

import type { WarehouseLocationDto } from '@maevelle/contracts';

import {
  isPurchaseDestination,
  isShipmentReceivingLocation,
} from '../lib/supply/location-options.js';

const location = (capabilities: readonly string[]): WarehouseLocationDto => ({
  id: 'warehouse-1',
  code: 'DHK-MAIN',
  name: 'Main warehouse',
  locationType: 'WAREHOUSE',
  status: 'ACTIVE',
  capabilities,
  version: 1,
});

describe('Supply warehouse choices', () => {
  it('shows an active warehouse as an expected purchase destination', () => {
    const warehouse = location(['STOCK_HOLDING', 'TRANSFER_RECEIVE', 'TRANSFER_SEND']);

    expect(isPurchaseDestination(warehouse)).toBe(true);
    expect(isShipmentReceivingLocation(warehouse)).toBe(false);
  });

  it('requires purchase-receiving capability for the actual inbound shipment', () => {
    const receivingWarehouse = location(['STOCK_HOLDING', 'PURCHASE_RECEIVING']);

    expect(isPurchaseDestination(receivingWarehouse)).toBe(true);
    expect(isShipmentReceivingLocation(receivingWarehouse)).toBe(true);
  });
});
