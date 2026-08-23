import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * Refund headers describe the money movement; allocations preserve which
 * commercial component that historical refund applies to. V1 refunds the
 * whole Order total, while future partial/line refunds can add line records.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table payments.refund_allocations (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      refund_id uuid not null references payments.refunds(id),
      order_line_id uuid references orders.order_lines(id),
      component_type text not null default 'ORDER_TOTAL',
      amount numeric(20,4) not null check (amount > 0),
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      foreign key (organization_id, refund_id) references payments.refunds(organization_id, id)
    );
    create index refund_allocations_refund on payments.refund_allocations (organization_id, refund_id);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error(
    'Refund allocations are immutable financial history and have no automatic down migration.',
  );
}
