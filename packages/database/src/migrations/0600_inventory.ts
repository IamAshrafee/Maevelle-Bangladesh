import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Ledger entries are append-only authority; levels are transactionally maintained projections. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists inventory;

    create table inventory.inventory_items (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      variant_id uuid,
      tracking_mode text not null default 'STANDARD' check (tracking_mode in ('STANDARD', 'LOT', 'SERIAL')),
      unit_code text not null default 'UNIT',
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, id),
      unique (variant_id),
      foreign key (organization_id, variant_id) references catalog.product_variants(organization_id, id)
    );
    create index inventory_items_organization_status on inventory.inventory_items (organization_id, status);

    insert into inventory.inventory_items (organization_id, variant_id)
    select organization_id, id from catalog.product_variants
    on conflict (variant_id) do nothing;

    create table inventory.inventory_levels (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      inventory_item_id uuid not null,
      location_id uuid not null,
      sellable_quantity numeric(20,6) not null default 0 check (sellable_quantity >= 0),
      unavailable_quantity numeric(20,6) not null default 0 check (unavailable_quantity >= 0),
      reserved_quantity numeric(20,6) not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= sellable_quantity),
      version bigint not null default 1,
      updated_at timestamptz not null default now(),
      unique (organization_id, inventory_item_id, location_id),
      unique (organization_id, id),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index inventory_levels_organization_location on inventory.inventory_levels (organization_id, location_id, inventory_item_id);

    create table inventory.inventory_level_conditions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      inventory_item_id uuid not null,
      location_id uuid not null,
      condition_code text not null check (condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      quantity numeric(20,6) not null default 0 check (quantity >= 0),
      version bigint not null default 1,
      updated_at timestamptz not null default now(),
      unique (organization_id, inventory_item_id, location_id, condition_code),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index inventory_conditions_lookup on inventory.inventory_level_conditions (organization_id, location_id, condition_code, inventory_item_id);

    create table inventory.inventory_transactions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      transaction_type text not null check (transaction_type in ('OPENING_BALANCE', 'ADJUSTMENT', 'CONDITION_CHANGE', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIPT', 'STOCKTAKE_ADJUSTMENT')),
      transaction_number text,
      occurred_at timestamptz not null default now(),
      reason_code text,
      reason_text text,
      reference_type text,
      reference_id uuid,
      idempotency_record_id uuid unique references platform.idempotency_records(id),
      created_by_actor_type text not null default 'USER',
      created_by_actor_id uuid,
      created_at timestamptz not null default now()
    );
    create index inventory_transactions_organization_time on inventory.inventory_transactions (organization_id, occurred_at desc, id desc);

    create table inventory.inventory_movement_lines (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      inventory_transaction_id uuid not null references inventory.inventory_transactions(id),
      inventory_item_id uuid not null,
      location_id uuid not null,
      condition_code text not null check (condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      quantity_delta numeric(20,6) not null check (quantity_delta <> 0),
      created_at timestamptz not null default now(),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index inventory_movement_lines_history on inventory.inventory_movement_lines (organization_id, inventory_item_id, location_id, created_at desc, id desc);

    create table inventory.inventory_reservations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      inventory_item_id uuid not null,
      location_id uuid not null,
      quantity numeric(20,6) not null check (quantity > 0),
      status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
      source_type text not null,
      source_reference text not null,
      expires_at timestamptz,
      released_at timestamptz,
      consumed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      unique (organization_id, source_type, source_reference, inventory_item_id, location_id),
      unique (organization_id, id),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index inventory_reservations_active on inventory.inventory_reservations (organization_id, location_id, inventory_item_id) where status = 'ACTIVE';

    create table inventory.stocktake_sessions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      stocktake_number text not null,
      location_id uuid not null,
      status text not null default 'DRAFT' check (status in ('DRAFT', 'COUNTING', 'REVIEW', 'POSTED', 'CANCELLED')),
      snapshot_at timestamptz not null default now(),
      posted_inventory_transaction_id uuid unique references inventory.inventory_transactions(id),
      created_by_actor_id uuid,
      created_at timestamptz not null default now(),
      posted_at timestamptz,
      version bigint not null default 1,
      unique (organization_id, stocktake_number),
      unique (organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create table inventory.stocktake_lines (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      stocktake_session_id uuid not null,
      inventory_item_id uuid not null,
      expected_quantity_at_snapshot numeric(20,6) not null,
      counted_quantity numeric(20,6),
      movements_after_snapshot numeric(20,6) not null default 0,
      final_expected_quantity numeric(20,6),
      variance_quantity numeric(20,6),
      status text not null default 'PENDING' check (status in ('PENDING', 'COUNTED', 'POSTED')),
      version bigint not null default 1,
      unique (stocktake_session_id, inventory_item_id),
      foreign key (organization_id, stocktake_session_id) references inventory.stocktake_sessions(organization_id, id),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id)
    );
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Inventory ledger data is historical business truth and has no automatic down migration.',
  );
}
