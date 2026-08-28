import type {
  ApiEnvelope,
  InboundShipmentDto,
  PaginationDto,
  PurchaseDto,
} from '@maevelle/contracts';

export type SupplyScreen = 'suppliers' | 'purchases' | 'shipments' | 'receiving';

export type SupplyNotice = { tone: 'success' | 'warning' | 'danger'; message: string } | undefined;

export type PagedEnvelope<T> = ApiEnvelope<readonly T[]> & { pagination?: PaginationDto };

export type ConfirmSupplyAction =
  | { kind: 'cancel-purchase'; purchase: PurchaseDto }
  | { kind: 'cancel-shipment'; shipment: InboundShipmentDto }
  | undefined;

export type ShipmentDraftLine = { purchaseLineId: string; quantity: string };

export type ReceiptDraftLine = {
  shipmentAllocationId: string;
  condition: string;
  quantity: string;
};
