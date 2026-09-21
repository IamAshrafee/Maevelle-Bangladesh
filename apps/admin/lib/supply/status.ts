import type { InboundShipmentDto, PurchaseDto } from '@maevelle/contracts';

export function purchaseQuantities(purchase: PurchaseDto) {
  return purchase.lines.reduce(
    (totals, line) => ({
      ordered: totals.ordered + Number(line.quantity),
      allocated: totals.allocated + Number(line.allocatedQuantity),
      received: totals.received + Number(line.receivedQuantity),
    }),
    { ordered: 0, allocated: 0, received: 0 },
  );
}

export function purchaseWorkflowStatus(purchase: PurchaseDto): string {
  if (purchase.status !== 'PLACED') return purchase.status;
  const { ordered, allocated, received } = purchaseQuantities(purchase);
  if (ordered > 0 && received >= ordered) return 'RECEIVED';
  if (received > 0) return 'PARTIALLY_RECEIVED';
  if (ordered > 0 && allocated >= ordered) return 'SHIPPED';
  if (allocated > 0) return 'PARTIALLY_SHIPPED';
  return 'ORDERED';
}

export function shipmentQuantities(shipment: InboundShipmentDto) {
  return shipment.allocations.reduce(
    (totals, line) => ({
      expected: totals.expected + Number(line.allocatedQuantity),
      received: totals.received + Number(line.receivedQuantity),
    }),
    { expected: 0, received: 0 },
  );
}

export function percentage(complete: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((complete / total) * 100)));
}

export function nextPurchaseAction(purchase: PurchaseDto): string {
  const status = purchaseWorkflowStatus(purchase);
  if (status === 'DRAFT')
    return purchase.lines.length ? 'Review and place order' : 'Add purchase items';
  if (status === 'ORDERED' || status === 'PARTIALLY_SHIPPED') return 'Plan remaining shipment';
  if (status === 'SHIPPED') return 'Track inbound shipment';
  if (status === 'PARTIALLY_RECEIVED') return 'Receive remaining goods';
  if (status === 'RECEIVED') return 'Review final landed cost';
  return 'Review purchase history';
}

export function nextShipmentAction(shipment: InboundShipmentDto): string {
  if (shipment.status === 'PLANNED') return 'Record departure';
  if (shipment.status === 'IN_TRANSIT') return 'Track or record arrival';
  if (shipment.status === 'ARRIVED' && shipment.receivingStatus !== 'RECEIVED')
    return 'Receive goods';
  if (shipment.receivingStatus === 'RECEIVED') return 'Finalize landed cost';
  return 'Review shipment history';
}
