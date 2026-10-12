import { ArrowDownLeft, Boxes, Building2, Truck } from 'lucide-react';

import type { LocationCapability, LocationType } from '@maevelle/contracts';

export const LOCATION_TYPES: readonly { value: LocationType; label: string; description: string }[] = [
  { value: 'WAREHOUSE', label: 'Warehouse', description: 'Primary storage, intake, and replenishment depot' },
  { value: 'FULFILLMENT_CENTER', label: 'Fulfillment Center', description: 'High-throughput outbound order picking and shipping' },
  { value: 'RETAIL_STORE', label: 'Retail Store', description: 'Physical shop with walk-in sales and customer pickup' },
  { value: 'SHOWROOM', label: 'Showroom', description: 'Display space with sample units and collections' },
  { value: 'RETURN_CENTER', label: 'Return Center', description: 'Inspection and restocking depot for customer returns' },
  { value: 'THIRD_PARTY', label: 'Third-Party Logistics (3PL)', description: 'Outsourced partner facility holding distributed stock' },
  { value: 'OTHER', label: 'Other Location', description: 'Specialized facility or temporary staging buffer' },
];

export const LOCATION_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active (Operational)', description: 'Immediately ready to hold stock, receive shipments, and fulfill orders' },
  { value: 'DRAFT', label: 'Draft (Setup Mode)', description: 'Under setup or physical racking; transactions disabled until activated' },
] as const;

interface LocationCapabilityGroup {
  readonly group: string;
  readonly description: string;
  readonly icon: typeof Boxes;
  readonly items: readonly {
    readonly code: LocationCapability;
    readonly label: string;
    readonly desc: string;
  }[];
}

export const LOCATION_CAPABILITY_GROUPS: readonly LocationCapabilityGroup[] = [
  {
    group: 'Inventory & Storage', description: 'Physical storage and internal buffer capacity', icon: Boxes,
    items: [
      { code: 'STOCK_HOLDING' as LocationCapability, label: 'Stock Holding', desc: 'Holds physical inventory units across sellable and damaged conditions' },
      { code: 'INTERNAL_STORAGE' as LocationCapability, label: 'Internal Storage', desc: 'Dedicated backroom, staging, or buffer area not directly allocated' },
    ],
  },
  {
    group: 'Inbound & Receiving', description: 'Intake from suppliers and customer returns', icon: ArrowDownLeft,
    items: [
      { code: 'PURCHASE_RECEIVING' as LocationCapability, label: 'Purchase Receiving', desc: 'Receives purchase orders and inbound shipments from suppliers' },
      { code: 'RETURN_RECEIVING' as LocationCapability, label: 'Return Receiving', desc: 'Accepts and restocks customer returns and failed deliveries' },
    ],
  },
  {
    group: 'Fulfillment & Outbound', description: 'Customer order picking, packing, and dispatch', icon: Building2,
    items: [
      { code: 'ORDER_FULFILLMENT' as LocationCapability, label: 'Order Fulfillment', desc: 'Allocates, picks, packs, and dispatches customer orders' },
      { code: 'CUSTOMER_PICKUP' as LocationCapability, label: 'Customer Pickup', desc: 'Supports click-and-collect and over-the-counter customer handoff' },
    ],
  },
  {
    group: 'Inter-Warehouse Transfers', description: 'Inventory movement between company locations', icon: Truck,
    items: [
      { code: 'TRANSFER_SEND' as LocationCapability, label: 'Transfer Send', desc: 'Dispatches stock transfers to other company warehouses' },
      { code: 'TRANSFER_RECEIVE' as LocationCapability, label: 'Transfer Receive', desc: 'Receives and confirms incoming transfers from other facilities' },
    ],
  },
];

export const TYPE_DEFAULT_CAPABILITIES: Record<LocationType, readonly LocationCapability[]> = {
  WAREHOUSE: ['STOCK_HOLDING', 'PURCHASE_RECEIVING', 'ORDER_FULFILLMENT', 'TRANSFER_SEND', 'TRANSFER_RECEIVE', 'INTERNAL_STORAGE'],
  FULFILLMENT_CENTER: ['STOCK_HOLDING', 'ORDER_FULFILLMENT', 'TRANSFER_SEND', 'TRANSFER_RECEIVE'],
  RETAIL_STORE: ['STOCK_HOLDING', 'ORDER_FULFILLMENT', 'CUSTOMER_PICKUP', 'TRANSFER_RECEIVE'],
  SHOWROOM: ['STOCK_HOLDING', 'CUSTOMER_PICKUP', 'TRANSFER_RECEIVE'],
  RETURN_CENTER: ['STOCK_HOLDING', 'RETURN_RECEIVING', 'TRANSFER_SEND'],
  THIRD_PARTY: ['STOCK_HOLDING', 'PURCHASE_RECEIVING', 'ORDER_FULFILLMENT', 'TRANSFER_SEND', 'TRANSFER_RECEIVE'],
  OTHER: ['STOCK_HOLDING', 'INTERNAL_STORAGE'],
};

export function deriveLocationCode(name: string, type: LocationType): string {
  const prefix = { WAREHOUSE: 'WH', FULFILLMENT_CENTER: 'FC', RETAIL_STORE: 'STORE', SHOWROOM: 'SHOW', RETURN_CENTER: 'RET', THIRD_PARTY: '3PL', OTHER: 'LOC' }[type];
  const words = name.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter((word) => word.length > 1 && !['WAREHOUSE', 'CENTER', 'STORE', 'SHOWROOM', 'DEPOT', 'FACILITY', 'LOCATION'].includes(word));
  const slug = words.slice(0, 2).join('-');
  return slug ? `${prefix}-${slug}` : `${prefix}-01`;
}
