import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

/**
 * A returned delivery line may have been consumed from more than one FIFO layer.
 * Keep every recovered slice linked to its original outbound assignment line rather
 * than collapsing provenance into an averaged replacement cost.
 */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table costing.return_cost_layers
      drop constraint if exists return_cost_layers_return_receipt_line_id_key;
    alter table costing.return_cost_layers
      add constraint return_cost_layers_receipt_source_unique
      unique (return_receipt_line_id, original_outbound_assignment_line_id);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Return Cost Layer provenance is immutable financial history.');
}
