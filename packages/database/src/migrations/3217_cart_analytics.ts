import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create index cart_analytics_pending on platform.event_consumer_receipts(outbox_event_id)
      where consumer_name='analytics.cart.v1' and status='PENDING';

    create table analytics.cart_mutations (
      outbox_event_id bigint primary key references platform.outbox_events(id),
      organization_id uuid not null references platform.organizations(id),
      cart_id uuid not null,
      occurred_at timestamptz not null,
      operation text not null,
      owner text not null check(owner in ('GUEST','ACCOUNT')),
      wishlist_action text check(wishlist_action in ('ADD','MOVE')),
      currency text not null check(currency ~ '^[A-Z]{3}$'),
      unit_delta integer not null check(unit_delta between -9900 and 9900),
      units_after integer not null check(units_after between 0 and 9900),
      lines_after integer not null check(lines_after between 0 and 100),
      merchandise_gross_after numeric(24,4) not null check(merchandise_gross_after>=0),
      merchandise_net_after numeric(24,4) not null
        check(merchandise_net_after between 0 and merchandise_gross_after),
      check((operation='wishlist_transfer')=(wishlist_action is not null))
    );
    create index cart_mutations_period on analytics.cart_mutations(organization_id,occurred_at);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Cart analytics requires forward repair.');
}
