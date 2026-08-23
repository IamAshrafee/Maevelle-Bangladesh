import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** FIFO positions and append-only acquisition-cost/COGS facts. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists costing;
    create table costing.cost_layers (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      inbound_receipt_line_id uuid not null unique references receiving.inbound_receipt_lines(id),
      shipment_allocation_id uuid not null references inbound_shipment.purchase_line_allocations(id),
      inventory_item_id uuid not null references inventory.inventory_items(id),
      location_id uuid not null references warehouse.locations(id), condition_code text not null,
      original_quantity numeric(20,6) not null check (original_quantity > 0),
      base_purchase_cost numeric(24,8) not null check (base_purchase_cost >= 0),
      currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      cost_state text not null default 'PROVISIONAL' check (cost_state in ('PROVISIONAL', 'FINALIZED', 'ADJUSTED')),
      source_revision_id uuid references landed_cost.worksheet_revisions(id),
      received_at timestamptz not null default now(), created_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, inbound_receipt_line_id) references receiving.inbound_receipt_lines(organization_id, id),
      foreign key (organization_id, shipment_allocation_id) references inbound_shipment.purchase_line_allocations(organization_id, id),
      foreign key (organization_id, inventory_item_id) references inventory.inventory_items(organization_id, id),
      foreign key (organization_id, location_id) references warehouse.locations(organization_id, id)
    );
    create index costing_layers_fifo on costing.cost_layers (organization_id, location_id, condition_code, received_at, id);
    create table costing.cost_layer_positions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      cost_layer_id uuid not null unique references costing.cost_layers(id), remaining_quantity numeric(20,6) not null check (remaining_quantity >= 0),
      updated_at timestamptz not null default now(), version integer not null default 1 check (version > 0),
      unique (organization_id, id), foreign key (organization_id, cost_layer_id) references costing.cost_layers(organization_id, id)
    );
    create table costing.cost_layer_adjustments (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), cost_layer_id uuid not null references costing.cost_layers(id),
      worksheet_revision_id uuid not null references landed_cost.worksheet_revisions(id), delta_total_cost numeric(24,8) not null,
      reason text not null check (reason in ('FINALIZATION', 'ADJUSTMENT', 'CREDIT')), created_at timestamptz not null default now(),
      unique (cost_layer_id, worksheet_revision_id), unique (organization_id, id),
      foreign key (organization_id, cost_layer_id) references costing.cost_layers(organization_id, id), foreign key (organization_id, worksheet_revision_id) references landed_cost.worksheet_revisions(organization_id, id)
    );
    create table costing.outbound_cost_assignments (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), fulfillment_id uuid not null unique references fulfillment.fulfillments(id),
      status text not null default 'PENDING_SALE_OUTCOME' check (status in ('PENDING_SALE_OUTCOME', 'COGS_RECOGNIZED')),
      total_cost numeric(24,8) not null, currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
      created_at timestamptz not null default now(), recognized_at timestamptz, unique (organization_id, id),
      foreign key (organization_id, fulfillment_id) references fulfillment.fulfillments(organization_id, id)
    );
    create table costing.outbound_cost_assignment_lines (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), outbound_cost_assignment_id uuid not null references costing.outbound_cost_assignments(id),
      fulfillment_line_id uuid not null references fulfillment.fulfillment_lines(id), cost_layer_id uuid not null references costing.cost_layers(id), quantity numeric(20,6) not null check (quantity > 0),
      unit_cost numeric(24,8) not null, total_cost numeric(24,8) not null, created_at timestamptz not null default now(),
      unique (outbound_cost_assignment_id, fulfillment_line_id, cost_layer_id), unique (organization_id, id),
      foreign key (organization_id, outbound_cost_assignment_id) references costing.outbound_cost_assignments(organization_id, id),
      foreign key (organization_id, cost_layer_id) references costing.cost_layers(organization_id, id)
    );
    create table costing.cogs_recognitions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), outbound_cost_assignment_id uuid not null references costing.outbound_cost_assignments(id),
      recognition_kind text not null check (recognition_kind in ('ORIGINAL', 'ADJUSTMENT')), total_cost numeric(24,8) not null, currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), created_at timestamptz not null default now(),
      unique (outbound_cost_assignment_id, recognition_kind), unique (organization_id, id),
      foreign key (organization_id, outbound_cost_assignment_id) references costing.outbound_cost_assignments(organization_id, id)
    );
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Cost layers and COGS facts have no automatic down migration.');
}
