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
    create table costing.cogs_recoveries (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), return_receipt_line_id uuid not null unique references returns.return_receipt_lines(id), outbound_cost_assignment_id uuid not null references costing.outbound_cost_assignments(id), total_cost numeric(24,8) not null check (total_cost >= 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), created_at timestamptz not null default now(), unique (organization_id, id), foreign key (organization_id, return_receipt_line_id) references returns.return_receipt_lines(organization_id, id), foreign key (organization_id, outbound_cost_assignment_id) references costing.outbound_cost_assignments(organization_id, id)
    );
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Return cost recovery is immutable financial history.');
}
