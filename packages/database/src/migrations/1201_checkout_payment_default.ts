import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/** Restores the established COD default after widening the accepted method codes. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`alter table orders.checkout_sessions alter column payment_method set default 'COD'`.execute(
    db,
  );
}

export async function down(): Promise<void> {
  throw new Error('Checkout payment-method defaults are forward-only.');
}
