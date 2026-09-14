import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Append-only return cost provenance; original outbound/COGS facts never change. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table costing.return_cost_layers (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      return_receipt_line_id uuid not null unique references returns.return_receipt_lines(id), inventory_item_id uuid not null references inventory.inventory_items(id), location_id uuid not null references warehouse.locations(id), condition_code text not null,
      original_outbound_assignment_line_id uuid not null references costing.outbound_cost_assignment_lines(id), quantity numeric(20,6) not null check (quantity > 0), unit_cost numeric(24,8) not null check (unit_cost >= 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), created_at timestamptz not null default now(),
      unique (organization_id, id), foreign key (organization_id, return_receipt_line_id) references returns.return_receipt_lines(organization_id, id), foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id), foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create table costing.return_cost_layer_positions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      return_cost_layer_id uuid not null references costing.return_cost_layers(id),
      location_id uuid not null references warehouse.locations(id), condition_code text not null,
      remaining_quantity numeric(20,6) not null check (remaining_quantity >= 0),
      updated_at timestamptz not null default now(), version integer not null default 1 check (version > 0),
      unique (organization_id, id), unique (organization_id, return_cost_layer_id, location_id, condition_code),
      foreign key (organization_id, return_cost_layer_id) references costing.return_cost_layers(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index costing_return_positions_fifo on costing.return_cost_layer_positions (organization_id, location_id, condition_code, return_cost_layer_id) where remaining_quantity > 0;
    alter table costing.outbound_cost_assignment_lines
      add column return_cost_layer_id uuid references costing.return_cost_layers(id),
      add constraint outbound_cost_assignment_lines_one_source check (num_nonnulls(cost_layer_id, return_cost_layer_id) = 1),
      add foreign key (organization_id, return_cost_layer_id) references costing.return_cost_layers(organization_id, id);
    create unique index outbound_cost_lines_return_source_unique on costing.outbound_cost_assignment_lines (outbound_cost_assignment_id, fulfillment_line_id, return_cost_layer_id) where return_cost_layer_id is not null;
    create table costing.transfer_cost_allocations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      transfer_line_id uuid not null references warehouse.transfer_lines(id), dispatch_inventory_transaction_id uuid not null references inventory.inventory_transactions(id),
      cost_layer_id uuid references costing.cost_layers(id),
      return_cost_layer_id uuid references costing.return_cost_layers(id), dispatched_quantity numeric(20,6) not null check (dispatched_quantity > 0),
      received_quantity numeric(20,6) not null default 0 check (received_quantity >= 0 and received_quantity <= dispatched_quantity),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique (organization_id, id),
      check (num_nonnulls(cost_layer_id, return_cost_layer_id) = 1),
      foreign key (organization_id, transfer_line_id) references warehouse.transfer_lines(organization_id, id),
      foreign key (organization_id, dispatch_inventory_transaction_id) references inventory.inventory_transactions(organization_id, id),
      foreign key (organization_id, cost_layer_id) references costing.cost_layers(organization_id, id),
      foreign key (organization_id, return_cost_layer_id) references costing.return_cost_layers(organization_id, id)
    );
    create unique index transfer_cost_acquisition_source_unique on costing.transfer_cost_allocations (transfer_line_id, cost_layer_id) where cost_layer_id is not null;
    create unique index transfer_cost_return_source_unique on costing.transfer_cost_allocations (transfer_line_id, return_cost_layer_id) where return_cost_layer_id is not null;
    create table costing.transfer_cost_receipts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      transfer_cost_allocation_id uuid not null references costing.transfer_cost_allocations(id),
      receipt_inventory_transaction_id uuid not null references inventory.inventory_transactions(id),
      destination_location_id uuid not null references warehouse.locations(id), destination_condition_code text not null,
      quantity numeric(20,6) not null check (quantity > 0), created_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, transfer_cost_allocation_id) references costing.transfer_cost_allocations(organization_id, id),
      foreign key (organization_id, receipt_inventory_transaction_id) references inventory.inventory_transactions(organization_id, id),
      foreign key (organization_id, destination_location_id) references warehouse.locations(organization_id, id)
    );
    create table costing.inventory_cost_position_movements (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      inventory_transaction_id uuid not null references inventory.inventory_transactions(id),
      movement_kind text not null check (movement_kind in ('CONDITION_MOVE', 'WRITE_OFF')),
      cost_layer_id uuid references costing.cost_layers(id), return_cost_layer_id uuid references costing.return_cost_layers(id),
      from_location_id uuid not null references warehouse.locations(id), from_condition_code text not null check (from_condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      to_location_id uuid references warehouse.locations(id), to_condition_code text,
      quantity numeric(20,6) not null check (quantity > 0), created_at timestamptz not null default now(),
      unique (organization_id, id), check (num_nonnulls(cost_layer_id, return_cost_layer_id) = 1),
      check ((movement_kind = 'CONDITION_MOVE' and to_location_id is not null and to_condition_code is not null) or (movement_kind = 'WRITE_OFF' and to_location_id is null and to_condition_code is null)),
      check (to_condition_code is null or to_condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      foreign key (organization_id, inventory_transaction_id) references inventory.inventory_transactions(organization_id, id),
      foreign key (organization_id, cost_layer_id) references costing.cost_layers(organization_id, id),
      foreign key (organization_id, return_cost_layer_id) references costing.return_cost_layers(organization_id, id),
      foreign key (organization_id, from_location_id) references warehouse.locations(organization_id, id),
      foreign key (organization_id, to_location_id) references warehouse.locations(organization_id, id)
    );
    create table costing.unvalued_inventory_additions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      inventory_transaction_id uuid not null references inventory.inventory_transactions(id),
      inventory_item_id uuid not null references inventory.inventory_items(id), location_id uuid not null references warehouse.locations(id),
      condition_code text not null check (condition_code in ('SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION')),
      quantity numeric(20,6) not null check (quantity > 0), reason_code text not null, created_at timestamptz not null default now(),
      unique (organization_id, inventory_transaction_id, inventory_item_id, location_id, condition_code), unique (organization_id, id),
      foreign key (organization_id, inventory_transaction_id) references inventory.inventory_transactions(organization_id, id),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    revoke update, delete on costing.return_cost_layers, costing.transfer_cost_allocations, costing.transfer_cost_receipts, costing.inventory_cost_position_movements, costing.unvalued_inventory_additions from public;
    create table costing.cogs_recoveries (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), return_receipt_line_id uuid not null unique references returns.return_receipt_lines(id), outbound_cost_assignment_id uuid not null references costing.outbound_cost_assignments(id), total_cost numeric(24,8) not null check (total_cost >= 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), created_at timestamptz not null default now(), unique (organization_id, id), foreign key (organization_id, return_receipt_line_id) references returns.return_receipt_lines(organization_id, id), foreign key (organization_id, outbound_cost_assignment_id) references costing.outbound_cost_assignments(organization_id, id)
    );
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Return cost recovery is immutable financial history.');
}
