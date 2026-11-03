import { sql, type Kysely, type Transaction } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function cartTransaction<T>(
  db: Kysely<DatabaseSchema>,
  execute: (tx: Transaction<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  // A writer may change the locked row while this snapshot waits. Restart from
  // authority resolution so replay still precedes the revision precondition.
  for (let attempt = 1; ; attempt++) {
    try {
      return await db
        .transaction()
        .setIsolationLevel('repeatable read')
        .execute(async (tx) => {
          await sql`set local lock_timeout='2s'`.execute(tx);
          await sql`set local statement_timeout='5s'`.execute(tx);
          return execute(tx);
        });
    } catch (error) {
      if (attempt >= 3 || (error as { code?: string } | null)?.code !== '40001') throw error;
    }
  }
}
