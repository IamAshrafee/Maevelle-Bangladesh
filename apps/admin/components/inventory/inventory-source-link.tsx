import Link from 'next/link';

import type { InventoryHistoryDto } from '@maevelle/contracts';

function sourceHref(record: InventoryHistoryDto): string | null {
  if (!record.referenceId || !record.referenceType) return null;
  switch (record.referenceType) {
    case 'warehouse.transfer':
      return `/inventory/transfers/${record.referenceId}`;
    case 'inventory.stocktake':
      return `/inventory/stocktakes/${record.referenceId}`;
    case 'receiving.inbound_receipt':
      return `/receiving/${record.referenceId}`;
    case 'fulfillment.fulfillment':
      return '/fulfillments';
    case 'returns.return_receipt':
      return '/returns';
    default:
      return null;
  }
}

export function InventorySourceLink({ record }: { record: InventoryHistoryDto }) {
  const href = sourceHref(record);
  const label =
    record.referenceNumber ?? record.referenceType?.replaceAll('.', ' ') ?? 'Manual entry';
  return href ? (
    <Link className="font-medium text-primary hover:underline" href={href}>
      {label}
    </Link>
  ) : (
    <span className="text-muted-foreground">{label}</span>
  );
}
