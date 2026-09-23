import type { LocationCapability } from '../../warehouse.js';
import type { WarehouseSeedItem } from '../types.js';

/**
 * All operational capabilities supported by Maevelle warehouses and fulfillment facilities.
 */
export const ALL_LOCATION_CAPABILITIES: readonly LocationCapability[] = [
  'STOCK_HOLDING',
  'PURCHASE_RECEIVING',
  'TRANSFER_SEND',
  'TRANSFER_RECEIVE',
  'ORDER_FULFILLMENT',
  'RETURN_RECEIVING',
  'CUSTOMER_PICKUP',
  'INTERNAL_STORAGE',
];

/**
 * Canonical warehouse facilities with full capability matrices and addressing.
 */
export const warehouseSeedData: readonly WarehouseSeedItem[] = [
  {
    code: 'WH-WEST-ASHRAFEE',
    name: 'West Warehouse (Ashrafee)',
    locationType: 'WAREHOUSE',
    status: 'ACTIVE',
    capabilities: ALL_LOCATION_CAPABILITIES,
    address: {
      fullAddress: 'House -627, West Kazipara, Mirpur, Dhaka 1216',
      city: 'Dhaka',
      postalCode: '1216',
      countryCode: 'BD',
    },
    previousCodes: ['WEST-WAREHOUSE-ASHRAFEE'],
  },
  {
    code: 'WH-EAST-MAISHA',
    name: 'East Warehouse (Maisha)',
    locationType: 'WAREHOUSE',
    status: 'ACTIVE',
    capabilities: ALL_LOCATION_CAPABILITIES,
    address: {
      fullAddress: 'House 486, West Kazipara, 5 No Goli, Mirpur, Dhaka 1216',
      city: 'Dhaka',
      postalCode: '1216',
      countryCode: 'BD',
    },
    previousCodes: ['EAST-WAREHOUSE-MAISHA'],
  },
];
