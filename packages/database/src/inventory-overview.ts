import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from './index.js';
import { resolveInventorySettings } from './settings.js';

export interface InventoryOverviewReadModel {
  readonly generatedAt: string;
  readonly scope: {
    readonly kind: 'ORGANIZATION' | 'LOCATIONS';
    readonly locationIds: readonly string[];
  };
  readonly kpis: {
    readonly onHand: string;
    readonly availableToSell: string;
    readonly reserved: string;
    readonly unavailable: string;
    readonly incomingSupply: string;
    readonly inTransitTransfer: string;
  };
  readonly attention: {
    readonly items: readonly {
      readonly code: 'OUT_OF_STOCK' | 'BELOW_REPLENISHMENT_THRESHOLD';
      readonly severity: 'CRITICAL' | 'WARNING';
      readonly inventoryItemId: string;
      readonly variantId: string;
      readonly sku: string;
      readonly productTitle: string;
      readonly locationId: string;
      readonly locationName: string;
      readonly availableToSell: string;
      readonly replenishmentThreshold: number;
      readonly replenishmentThresholdSource: 'VARIANT' | 'ORGANIZATION_DEFAULT';
      readonly explanation: string;
      readonly owner: 'INVENTORY';
      readonly nextActionHref: string;
      readonly lastMovementAt: string | null;
    }[];
    readonly totalCount: number;
    readonly limit: number;
  };
  readonly workQueues: {
    readonly transfersInTransit: number;
    readonly transferDiscrepancies: number;
    readonly countsInProgress: number;
    readonly countsAwaitingReview: number;
    readonly unitsAwaitingQc: number;
    readonly repairsOpen: number;
    readonly activeReservations: number;
    readonly reservationExceptions: number;
  };
  readonly recentMovements: readonly {
    readonly movementId: string;
    readonly transactionType: string;
    readonly transactionNumber: string | null;
    readonly occurredAt: string;
    readonly sku: string;
    readonly productTitle: string;
    readonly locationId: string;
    readonly locationName: string;
    readonly condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
    readonly quantityDelta: string;
    readonly actorDisplayName: string | null;
  }[];
  readonly locations: readonly {
    readonly locationId: string;
    readonly locationCode: string;
    readonly locationName: string;
    readonly onHand: string;
    readonly availableToSell: string;
    readonly unavailable: string;
    readonly attentionCount: number;
  }[];
}

export async function getInventoryOverview(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  input: { readonly locationIds?: readonly string[]; readonly attentionLimit?: number } = {},
): Promise<InventoryOverviewReadModel> {
  const { lowStockThreshold } = await resolveInventorySettings(db, organizationId);
  const locationIds = input.locationIds;
  const attentionLimit = Math.min(25, Math.max(1, input.attentionLimit ?? 10));
  const levelScope =
    locationIds === undefined
      ? sql`true`
      : locationIds.length
        ? sql`level.location_id=any(${locationIds}::uuid[])`
        : sql`false`;
  const transferDestinationScope =
    locationIds === undefined
      ? sql`true`
      : locationIds.length
        ? sql`transfer.destination_location_id=any(${locationIds}::uuid[])`
        : sql`false`;
  const shipmentScope =
    locationIds === undefined
      ? sql`true`
      : locationIds.length
        ? sql`shipment.receiving_location_id=any(${locationIds}::uuid[])`
        : sql`false`;

  const [kpis, attention, queues, movements, locations] = await Promise.all([
    sql<{
      on_hand: string;
      available: string;
      reserved: string;
      unavailable: string;
      incoming_supply: string;
      in_transit_transfer: string;
    }>`
      select
        coalesce((select sum(level.sellable_quantity+level.unavailable_quantity)
          from inventory.inventory_levels level
          where level.organization_id=${organizationId} and ${levelScope}),0)::text as on_hand,
        coalesce((select sum(level.sellable_quantity-level.reserved_quantity)
          from inventory.inventory_levels level
          where level.organization_id=${organizationId} and ${levelScope}),0)::text as available,
        coalesce((select sum(level.reserved_quantity)
          from inventory.inventory_levels level
          where level.organization_id=${organizationId} and ${levelScope}),0)::text as reserved,
        coalesce((select sum(level.unavailable_quantity)
          from inventory.inventory_levels level
          where level.organization_id=${organizationId} and ${levelScope}),0)::text as unavailable,
        coalesce((select sum(greatest(allocation.allocated_quantity-coalesce(received.quantity,0),0))
          from inbound_shipment.purchase_line_allocations allocation
          join inbound_shipment.shipments shipment
            on shipment.organization_id=allocation.organization_id and shipment.id=allocation.shipment_id
          left join lateral (
            select sum(line.quantity) as quantity from receiving.inbound_receipt_lines line
            where line.organization_id=allocation.organization_id
              and line.shipment_allocation_id=allocation.id
          ) received on true
          where allocation.organization_id=${organizationId}
            and shipment.status in ('IN_TRANSIT','ARRIVED')
            and shipment.receiving_status<>'RECEIVED' and ${shipmentScope}),0)::text as incoming_supply,
        coalesce((select sum(line.dispatched_quantity-line.received_quantity-coalesce(discrepancy.quantity,0))
          from warehouse.transfer_lines line
          join warehouse.transfers transfer
            on transfer.organization_id=line.organization_id and transfer.id=line.transfer_id
          left join warehouse.transfer_line_discrepancies discrepancy
            on discrepancy.organization_id=line.organization_id and discrepancy.transfer_line_id=line.id
          where line.organization_id=${organizationId}
            and transfer.status in ('IN_TRANSIT','PARTIALLY_RECEIVED')
            and ${transferDestinationScope}),0)::text as in_transit_transfer
    `.execute(db),
    sql<{
      inventory_item_id: string;
      variant_id: string;
      sku: string;
      product_title: string;
      location_id: string;
      location_name: string;
      available: string;
      threshold: string;
      threshold_source: 'VARIANT' | 'ORGANIZATION_DEFAULT';
      last_movement_at: string | null;
      total_count: string;
    }>`
      select item.id as inventory_item_id,variant.id as variant_id,variant.sku,
        product.title as product_title,location.id as location_id,location.name as location_name,
        (level.sellable_quantity-level.reserved_quantity)::text as available,
        coalesce(variant.reorder_point,${lowStockThreshold})::text as threshold,
        case when variant.reorder_point is null then 'ORGANIZATION_DEFAULT' else 'VARIANT' end as threshold_source,
        last_movement.occurred_at::text as last_movement_at,count(*) over()::text as total_count
      from inventory.inventory_levels level
      join inventory.inventory_items item
        on item.organization_id=level.organization_id and item.id=level.inventory_item_id
      join catalog.product_variants variant
        on variant.organization_id=item.organization_id and variant.id=item.variant_id
      join catalog.products product
        on product.organization_id=variant.organization_id and product.id=variant.product_id
      join warehouse.locations location
        on location.organization_id=level.organization_id and location.id=level.location_id
      left join lateral (
        select max(tx.occurred_at) as occurred_at
        from inventory.inventory_movement_lines movement
        join inventory.inventory_transactions tx
          on tx.organization_id=movement.organization_id and tx.id=movement.inventory_transaction_id
        where movement.organization_id=level.organization_id
          and movement.inventory_item_id=level.inventory_item_id
          and movement.location_id=level.location_id
      ) last_movement on true
      where level.organization_id=${organizationId} and ${levelScope}
        and level.sellable_quantity-level.reserved_quantity <= coalesce(variant.reorder_point,${lowStockThreshold})
      order by (level.sellable_quantity-level.reserved_quantity <= 0) desc,
        level.sellable_quantity-level.reserved_quantity,product.title,variant.sku
      limit ${attentionLimit}
    `.execute(db),
    sql<{
      transfers_in_transit: string;
      transfer_discrepancies: string;
      counts_in_progress: string;
      counts_awaiting_review: string;
      units_awaiting_qc: string;
      repairs_open: string;
      active_reservations: string;
      reservation_exceptions: string;
    }>`
      select
        (select count(*) from warehouse.transfers transfer
          where transfer.organization_id=${organizationId}
            and transfer.status in ('IN_TRANSIT','PARTIALLY_RECEIVED')
            and ${transferDestinationScope})::text as transfers_in_transit,
        (select count(*) from warehouse.transfers transfer
          where transfer.organization_id=${organizationId}
            and transfer.status='CLOSED_WITH_DISCREPANCY'
            and ${transferDestinationScope})::text as transfer_discrepancies,
        (select count(*) from inventory.stocktake_sessions session
          where session.organization_id=${organizationId} and session.status='COUNTING'
            and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`session.location_id=any(${locationIds}::uuid[])` : sql`false`})::text as counts_in_progress,
        (select count(*) from inventory.stocktake_sessions session
          where session.organization_id=${organizationId} and session.status='REVIEW'
            and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`session.location_id=any(${locationIds}::uuid[])` : sql`false`})::text as counts_awaiting_review,
        (select count(*) from inventory.inventory_units unit
          where unit.organization_id=${organizationId} and unit.status in ('AWAITING_QC','RETURNED')
            and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`unit.location_id=any(${locationIds}::uuid[])` : sql`false`})::text as units_awaiting_qc,
        (select count(*) from inventory.unit_repairs repair
          join inventory.inventory_units unit
            on unit.organization_id=repair.organization_id and unit.id=repair.unit_id
          where repair.organization_id=${organizationId}
            and repair.repair_status in ('REQUESTED','IN_PROGRESS')
            and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`unit.location_id=any(${locationIds}::uuid[])` : sql`false`})::text as repairs_open,
        (select count(*) from inventory.inventory_reservations reservation
          where reservation.organization_id=${organizationId}
            and reservation.status in ('ACTIVE','PARTIALLY_CONSUMED')
            and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`reservation.location_id=any(${locationIds}::uuid[])` : sql`false`})::text as active_reservations,
        (select count(*) from inventory.inventory_reservations reservation
          left join orders.order_inventory_reservations bridge
            on bridge.organization_id=reservation.organization_id and bridge.reservation_id=reservation.id
          left join orders.orders order_row
            on order_row.organization_id=bridge.organization_id and order_row.id=bridge.order_id
          where reservation.organization_id=${organizationId}
            and reservation.status in ('ACTIVE','PARTIALLY_CONSUMED')
            and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`reservation.location_id=any(${locationIds}::uuid[])` : sql`false`}
            and ((bridge.reservation_id is null and reservation.expires_at<=now())
              or order_row.order_status in ('COMPLETED','CANCELLED','ON_HOLD')))::text as reservation_exceptions
    `.execute(db),
    sql<{
      movement_id: string;
      transaction_type: string;
      transaction_number: string | null;
      occurred_at: string;
      sku: string;
      product_title: string;
      location_id: string;
      location_name: string;
      condition_code: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
      quantity_delta: string;
      actor_display_name: string | null;
    }>`
      select movement.id as movement_id,tx.transaction_type,tx.transaction_number,
        tx.occurred_at::text,variant.sku,product.title as product_title,
        location.id as location_id,location.name as location_name,movement.condition_code,
        movement.quantity_delta::text,actor.name as actor_display_name
      from inventory.inventory_movement_lines movement
      join inventory.inventory_transactions tx
        on tx.organization_id=movement.organization_id and tx.id=movement.inventory_transaction_id
      join inventory.inventory_items item
        on item.organization_id=movement.organization_id and item.id=movement.inventory_item_id
      join catalog.product_variants variant
        on variant.organization_id=item.organization_id and variant.id=item.variant_id
      join catalog.products product
        on product.organization_id=variant.organization_id and product.id=variant.product_id
      join warehouse.locations location
        on location.organization_id=movement.organization_id and location.id=movement.location_id
      left join iam.users actor on actor.id=tx.created_by_actor_id
      where movement.organization_id=${organizationId}
        and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`movement.location_id=any(${locationIds}::uuid[])` : sql`false`}
      order by tx.occurred_at desc,movement.id desc limit 8
    `.execute(db),
    sql<{
      location_id: string;
      location_code: string;
      location_name: string;
      on_hand: string;
      available: string;
      unavailable: string;
      attention_count: string;
    }>`
      select location.id as location_id,location.code as location_code,location.name as location_name,
        coalesce(sum(level.sellable_quantity+level.unavailable_quantity),0)::text as on_hand,
        coalesce(sum(level.sellable_quantity-level.reserved_quantity),0)::text as available,
        coalesce(sum(level.unavailable_quantity),0)::text as unavailable,
        count(*) filter (where level.sellable_quantity-level.reserved_quantity
          <= coalesce(variant.reorder_point,${lowStockThreshold}))::text as attention_count
      from warehouse.locations location
      join warehouse.location_capabilities capability
        on capability.organization_id=location.organization_id and capability.location_id=location.id
        and capability.capability_code='STOCK_HOLDING'
      left join inventory.inventory_levels level
        on level.organization_id=location.organization_id and level.location_id=location.id
      left join inventory.inventory_items item
        on item.organization_id=level.organization_id and item.id=level.inventory_item_id
      left join catalog.product_variants variant
        on variant.organization_id=item.organization_id and variant.id=item.variant_id
      where location.organization_id=${organizationId} and location.status='ACTIVE'
        and ${locationIds === undefined ? sql`true` : locationIds.length ? sql`location.id=any(${locationIds}::uuid[])` : sql`false`}
      group by location.id order by attention_count desc,location.name
    `.execute(db),
  ]);

  const kpi = kpis.rows[0]!;
  const queue = queues.rows[0]!;
  return {
    generatedAt: new Date().toISOString(),
    scope: {
      kind: locationIds === undefined ? 'ORGANIZATION' : 'LOCATIONS',
      locationIds: locationIds ?? [],
    },
    kpis: {
      onHand: kpi.on_hand,
      availableToSell: kpi.available,
      reserved: kpi.reserved,
      unavailable: kpi.unavailable,
      incomingSupply: kpi.incoming_supply,
      inTransitTransfer: kpi.in_transit_transfer,
    },
    attention: {
      items: attention.rows.map((row) => {
        const out = Number(row.available) <= 0;
        return {
          code: out ? 'OUT_OF_STOCK' : 'BELOW_REPLENISHMENT_THRESHOLD',
          severity: out ? 'CRITICAL' : 'WARNING',
          inventoryItemId: row.inventory_item_id,
          variantId: row.variant_id,
          sku: row.sku,
          productTitle: row.product_title,
          locationId: row.location_id,
          locationName: row.location_name,
          availableToSell: row.available,
          replenishmentThreshold: Number(row.threshold),
          replenishmentThresholdSource: row.threshold_source,
          explanation: out
            ? 'No unallocated sellable quantity remains at this location.'
            : `Available quantity is at or below the ${row.threshold_source === 'VARIANT' ? 'SKU' : 'organization'} threshold of ${row.threshold}.`,
          owner: 'INVENTORY',
          nextActionHref: `/inventory/stock/${row.inventory_item_id}?locationId=${row.location_id}`,
          lastMovementAt: row.last_movement_at,
        };
      }),
      totalCount: Number(attention.rows[0]?.total_count ?? 0),
      limit: attentionLimit,
    },
    workQueues: {
      transfersInTransit: Number(queue.transfers_in_transit),
      transferDiscrepancies: Number(queue.transfer_discrepancies),
      countsInProgress: Number(queue.counts_in_progress),
      countsAwaitingReview: Number(queue.counts_awaiting_review),
      unitsAwaitingQc: Number(queue.units_awaiting_qc),
      repairsOpen: Number(queue.repairs_open),
      activeReservations: Number(queue.active_reservations),
      reservationExceptions: Number(queue.reservation_exceptions),
    },
    recentMovements: movements.rows.map((row) => ({
      movementId: row.movement_id,
      transactionType: row.transaction_type,
      transactionNumber: row.transaction_number,
      occurredAt: row.occurred_at,
      sku: row.sku,
      productTitle: row.product_title,
      locationId: row.location_id,
      locationName: row.location_name,
      condition: row.condition_code,
      quantityDelta: row.quantity_delta,
      actorDisplayName: row.actor_display_name,
    })),
    locations: locations.rows.map((row) => ({
      locationId: row.location_id,
      locationCode: row.location_code,
      locationName: row.location_name,
      onHand: row.on_hand,
      availableToSell: row.available,
      unavailable: row.unavailable,
      attentionCount: Number(row.attention_count),
    })),
  };
}
