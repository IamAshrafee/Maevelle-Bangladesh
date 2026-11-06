import { sql, type Transaction } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { InventoryDomainError } from './inventory.js';
import { reserveInventoryEntriesInTransaction } from './inventory-reserve-write.js';

export async function allocateCheckoutOrderLines(
  tx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    actorType: 'USER' | 'GUEST_CHECKOUT';
    lines: readonly { id: string; variantId: string; quantity: string }[];
  },
) {
  // One stock-holding location per line, matching existing fulfillment behavior.
  const candidates = await sql<{
    line_id: string;
    inventory_item_id: string;
    location_id: string;
    quantity: string;
  }>`
    select requested.line_id,i.id inventory_item_id,picked.location_id,requested.quantity::text
    from (values ${sql.join(input.lines.map((l) => sql`(${l.id}::uuid,${l.variantId}::uuid,${l.quantity}::numeric)`))})
      requested(line_id,variant_id,quantity)
    join inventory.inventory_items i on i.organization_id=${input.organizationId}
      and i.variant_id=requested.variant_id and i.status='ACTIVE'
    join catalog.product_variants v on v.organization_id=i.organization_id and v.id=i.variant_id and v.status='ACTIVE'
    join catalog.products p on p.organization_id=v.organization_id and p.id=v.product_id
      and p.status='ACTIVE' and p.publication_status='PUBLISHED'
    cross join lateral (select l.location_id from inventory.inventory_levels l
      join warehouse.locations w on w.organization_id=l.organization_id and w.id=l.location_id and w.status='ACTIVE'
      join warehouse.location_capabilities c on c.organization_id=w.organization_id and c.location_id=w.id
        and c.capability_code='STOCK_HOLDING'
      where l.organization_id=i.organization_id and l.inventory_item_id=i.id
        and l.sellable_quantity-l.reserved_quantity>=requested.quantity
      order by l.location_id limit 1) picked
    order by i.id,picked.location_id for no key update of i`.execute(tx);
  if (candidates.rows.length !== input.lines.length)
    throw new InventoryDomainError(
      'INSUFFICIENT_STOCK',
      'The complete order is no longer available.',
    );
  // The outer placement receipt and each reservation's unique order-line source
  // are the retry boundary. No line is an independently replayable command.
  const reserved = await reserveInventoryEntriesInTransaction(tx, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorType: input.actorType,
    entries: candidates.rows.map((r) => ({
      inventoryItemId: r.inventory_item_id,
      locationId: r.location_id,
      quantity: r.quantity,
      sourceType: 'ORDER_LINE',
      sourceReference: r.line_id,
    })),
  });
  const byId = new Map(input.lines.map((l) => [l.id, l]));
  const allocations = reserved.map((r) => ({
    reservationId: r.id,
    inventoryItemId: r.inventory_item_id,
    lineId: r.source_reference,
    locationId: r.location_id,
    quantity: byId.get(r.source_reference)!.quantity,
  }));
  await sql`insert into inventory.inventory_reservation_allocations(organization_id,reservation_id,order_line_id,
    inventory_item_id,location_id,reserved_quantity) values ${sql.join(
      allocations.map(
        (a) =>
          sql`(${input.organizationId},${a.reservationId},${a.lineId},${a.inventoryItemId},${a.locationId},${a.quantity}::numeric)`,
      ),
    )}`.execute(tx);
  return allocations;
}
