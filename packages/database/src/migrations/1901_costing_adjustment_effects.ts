import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Late landed-cost effects stay append-only. A layer adjustment affects the
 * on-hand position implicitly and creates explicit facts for quantities that
 * already left the warehouse.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table costing.outbound_cost_assignment_adjustments (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      outbound_cost_assignment_line_id uuid not null references costing.outbound_cost_assignment_lines(id),
      cost_layer_adjustment_id uuid not null references costing.cost_layer_adjustments(id),
      amount numeric(24,8) not null,
      created_at timestamptz not null default now(),
      unique (outbound_cost_assignment_line_id, cost_layer_adjustment_id),
      unique (organization_id, id),
      foreign key (organization_id, outbound_cost_assignment_line_id) references costing.outbound_cost_assignment_lines(organization_id, id),
      foreign key (organization_id, cost_layer_adjustment_id) references costing.cost_layer_adjustments(organization_id, id)
    );
    create table costing.cogs_adjustments (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      cogs_recognition_id uuid not null references costing.cogs_recognitions(id),
      cost_layer_adjustment_id uuid not null references costing.cost_layer_adjustments(id),
      amount numeric(24,8) not null,
      created_at timestamptz not null default now(),
      unique (cogs_recognition_id, cost_layer_adjustment_id),
      unique (organization_id, id),
      foreign key (organization_id, cogs_recognition_id) references costing.cogs_recognitions(organization_id, id),
      foreign key (organization_id, cost_layer_adjustment_id) references costing.cost_layer_adjustments(organization_id, id)
    );
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Cost adjustment effects are append-only financial provenance.');
}
