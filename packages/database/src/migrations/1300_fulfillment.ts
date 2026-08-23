import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Fulfillment is the physical preparation authority. It bridges immutable
 * Order lines and their existing Inventory reservations without turning an
 * Order status into a warehouse or shipment status.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists fulfillment;

    alter table inventory.inventory_transactions
      drop constraint inventory_transactions_transaction_type_check;
    alter table inventory.inventory_transactions
      add constraint inventory_transactions_transaction_type_check check (
        transaction_type in (
          'OPENING_BALANCE', 'ADJUSTMENT', 'CONDITION_CHANGE', 'TRANSFER_DISPATCH',
          'TRANSFER_RECEIPT', 'STOCKTAKE_ADJUSTMENT', 'FULFILLMENT_DISPATCH'
        )
      );
    alter table inventory.inventory_reservations
      drop constraint inventory_reservations_status_check;
    alter table inventory.inventory_reservations
      add constraint inventory_inventory_reservations_status_check check (
        status in ('ACTIVE', 'PARTIALLY_CONSUMED', 'CONSUMED', 'RELEASED', 'EXPIRED')
      );

    create table inventory.inventory_reservation_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      reservation_id uuid not null references inventory.inventory_reservations(id),
      order_line_id uuid not null references orders.order_lines(id),
      inventory_item_id uuid not null references inventory.inventory_items(id),
      location_id uuid not null references warehouse.locations(id),
      reserved_quantity numeric(20,6) not null check (reserved_quantity > 0),
      consumed_quantity numeric(20,6) not null default 0 check (consumed_quantity >= 0),
      released_quantity numeric(20,6) not null default 0 check (released_quantity >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      unique (reservation_id),
      check (consumed_quantity + released_quantity <= reserved_quantity),
      foreign key (organization_id, reservation_id) references inventory.inventory_reservations(organization_id, id),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index inventory_reservation_allocations_order_line on inventory.inventory_reservation_allocations (organization_id, order_line_id);
    insert into inventory.inventory_reservation_allocations (
      organization_id, reservation_id, order_line_id, inventory_item_id, location_id, reserved_quantity
    )
    select bridge.organization_id, reservation.id, bridge.order_line_id, reservation.inventory_item_id, reservation.location_id, reservation.quantity
    from orders.order_inventory_reservations bridge
    join inventory.inventory_reservations reservation on reservation.id = bridge.reservation_id
    on conflict (reservation_id) do nothing;

    create table fulfillment.fulfillments (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      fulfillment_number text not null,
      order_id uuid not null references orders.orders(id),
      location_id uuid not null references warehouse.locations(id),
      status text not null default 'DRAFT' check (status in ('DRAFT', 'READY', 'PICKING', 'PACKED', 'DISPATCHED', 'CANCELLED')),
      created_by_actor_id uuid,
      ready_at timestamptz,
      picking_started_at timestamptz,
      packed_at timestamptz,
      dispatched_at timestamptz,
      cancelled_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, fulfillment_number),
      unique (organization_id, id),
      foreign key (organization_id, order_id) references orders.orders(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index fulfillments_order on fulfillment.fulfillments (organization_id, order_id, created_at desc, id desc);
    create index fulfillments_operations_queue on fulfillment.fulfillments (organization_id, status, created_at asc, id asc)
      where status in ('DRAFT', 'READY', 'PICKING', 'PACKED');

    create table fulfillment.fulfillment_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      fulfillment_id uuid not null references fulfillment.fulfillments(id) on delete restrict,
      order_line_id uuid not null references orders.order_lines(id),
      quantity numeric(20,6) not null check (quantity > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      unique (fulfillment_id, order_line_id),
      foreign key (organization_id, fulfillment_id) references fulfillment.fulfillments(organization_id, id)
    );
    create index fulfillment_lines_order_line on fulfillment.fulfillment_lines (organization_id, order_line_id);

    create table inventory.fulfillment_inventory_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      fulfillment_line_id uuid not null references fulfillment.fulfillment_lines(id),
      reservation_allocation_id uuid not null references inventory.inventory_reservation_allocations(id),
      inventory_transaction_id uuid references inventory.inventory_transactions(id),
      quantity_consumed numeric(20,6) not null default 0 check (quantity_consumed >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (fulfillment_line_id, reservation_allocation_id),
      unique (organization_id, id),
      foreign key (organization_id, fulfillment_line_id) references fulfillment.fulfillment_lines(organization_id, id),
      foreign key (organization_id, reservation_allocation_id) references inventory.inventory_reservation_allocations(organization_id, id)
    );
    create index fulfillment_inventory_allocations_lookup on inventory.fulfillment_inventory_allocations (organization_id, fulfillment_line_id);

    insert into iam.capability_definitions (capability_code, domain, description, sensitivity) values
      ('fulfillment.view', 'fulfillment', 'View fulfillment operations and physical allocation history.', 'INTERNAL'),
      ('fulfillment.manage', 'fulfillment', 'Create, prepare, pick, pack, and cancel eligible fulfillments.', 'HIGH'),
      ('fulfillment.dispatch', 'fulfillment', 'Dispatch fulfillment and consume reserved physical inventory.', 'HIGH')
    on conflict (capability_code) do nothing;
    insert into iam.membership_capability_grants (membership_id, capability_code)
      select membership.id, capability.capability_code
      from iam.organization_memberships membership
      cross join (values ('fulfillment.view'), ('fulfillment.manage'), ('fulfillment.dispatch')) as capability(capability_code)
      where membership.membership_type = 'OWNER' and membership.status = 'ACTIVE'
    on conflict do nothing;
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Fulfillment records and physical inventory provenance have no automatic down migration.',
  );
}
