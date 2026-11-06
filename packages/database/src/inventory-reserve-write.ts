import { sql, type Transaction } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { InventoryDomainError } from './inventory.js';
import { appendAuditEvents } from './platform.js';

interface ReservationEntry {
  inventoryItemId: string;
  locationId: string;
  quantity: string;
  sourceType: string;
  sourceReference: string;
  expiresAt?: Date;
}

/** The shared stock mutation for single reservations and atomic Order allocations. */
export async function reserveInventoryEntriesInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    actorType?: 'USER' | 'GUEST_CHECKOUT';
    entries: readonly ReservationEntry[];
  },
) {
  const { organizationId: org, entries } = input;
  if (
    !entries.length ||
    new Set(entries.map((r) => `${r.inventoryItemId}:${r.locationId}`)).size !== entries.length
  )
    throw new Error('Inventory reservations require distinct stock levels.');
  const requested = sql.join(
    entries.map(
      (r) => sql`(${r.inventoryItemId}::uuid,${r.locationId}::uuid,${r.quantity}::numeric)`,
    ),
  );
  const levels = await sql<{ id: string; available: boolean }>`
    select l.id,(l.sellable_quantity-l.reserved_quantity>=r.quantity) available
    from inventory.inventory_levels l join (values ${requested}) r(item_id,location_id,quantity)
      on r.item_id=l.inventory_item_id and r.location_id=l.location_id
    where l.organization_id=${org} order by l.inventory_item_id,l.location_id for update of l
  `.execute(tx);
  if (levels.rows.length !== entries.length || levels.rows.some((level) => !level.available))
    throw new InventoryDomainError(
      'INSUFFICIENT_STOCK',
      'Insufficient available-to-sell inventory.',
    );

  await sql`update inventory.inventory_levels l
    set reserved_quantity=l.reserved_quantity+r.quantity,version=l.version+1,updated_at=now()
    from (values ${requested}) r(item_id,location_id,quantity)
    where l.organization_id=${org} and l.inventory_item_id=r.item_id and l.location_id=r.location_id
  `.execute(tx);
  const inserted = await sql<{
    id: string;
    inventory_item_id: string;
    location_id: string;
    source_reference: string;
  }>`
    insert into inventory.inventory_reservations(organization_id,inventory_item_id,location_id,quantity,
      source_type,source_reference,expires_at) values
    ${sql.join(
      entries.map(
        (r) => sql`(${org},${r.inventoryItemId},${r.locationId},${r.quantity}::numeric,
      ${r.sourceType},${r.sourceReference},${r.expiresAt ?? null})`,
      ),
    )}
    returning id,inventory_item_id,location_id,source_reference
  `.execute(tx);
  const byStockLevel = new Map(entries.map((r) => [`${r.inventoryItemId}:${r.locationId}`, r]));
  await appendAuditEvents(
    tx,
    inserted.rows.map((row) => {
      const entry = byStockLevel.get(`${row.inventory_item_id}:${row.location_id}`)!;
      return {
        organizationId: org,
        actorId: input.actorId,
        actorType: input.actorType ?? 'USER',
        action: 'inventory.reservation.created',
        targetType: 'inventory.reservation',
        targetId: row.id,
        metadata: {
          inventoryItemId: entry.inventoryItemId,
          locationId: entry.locationId,
          quantity: entry.quantity,
          sourceType: entry.sourceType,
        },
      };
    }),
  );
  await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,
    aggregate_id,aggregate_version,payload,occurred_at)
    values ${sql.join(
      inserted.rows.map(
        (r) => sql`(${org},'inventory.reservation.created',1,
      'inventory.reservation',${r.id},1,${JSON.stringify({ id: r.id })}::jsonb,now())`,
      ),
    )}
  `.execute(tx);
  return inserted.rows;
}
