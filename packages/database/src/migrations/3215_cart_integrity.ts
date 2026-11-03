import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Validate existing intent without truncation, deletion or inferred ownership. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    set local lock_timeout='5s';
    alter table cart.cart_lines
      add constraint cart_line_discrete_quantity check (quantity between 1 and 99 and quantity=trunc(quantity)) not valid,
      add constraint cart_line_revision_positive check (version > 0) not valid,
      add constraint cart_line_price_nonnegative check (last_seen_unit_price >= 0 and last_seen_unit_price <> 'NaN'::numeric) not valid;
    alter table cart.carts
      add constraint cart_guest_authority_exclusive check (credential_state <> 'SLOT_V1' or owner_account_id is null) not valid,
      add constraint cart_customer_scoped_fk foreign key (organization_id, customer_id)
        references customers.customers(organization_id, id) not valid;
    create index cart_customer_scoped_index on cart.carts(organization_id, customer_id) where customer_id is not null;
    alter table cart.cart_lines validate constraint cart_line_discrete_quantity;
    alter table cart.cart_lines validate constraint cart_line_revision_positive;
    alter table cart.cart_lines validate constraint cart_line_price_nonnegative;
    alter table cart.carts validate constraint cart_guest_authority_exclusive;
    alter table cart.carts validate constraint cart_customer_scoped_fk;
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error(
    'Cart integrity uses forward repair; never weaken ownership or quantity constraints automatically.',
  );
}
