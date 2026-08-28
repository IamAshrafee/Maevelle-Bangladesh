import type { WarehouseLocationDto } from '@maevelle/contracts';

export function isPurchaseDestination(location: WarehouseLocationDto): boolean {
  return location.status === 'ACTIVE';
}

export function isShipmentReceivingLocation(location: WarehouseLocationDto): boolean {
  return location.status === 'ACTIVE' && location.capabilities.includes('PURCHASE_RECEIVING');
}
