import type { Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export function withMediaTransaction<T>(
  db: Kysely<DatabaseSchema>,
  callback: (transaction: Kysely<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  if ('isTransaction' in db && (db as { isTransaction?: boolean }).isTransaction) {
    return callback(db);
  }
  return db.transaction().execute(callback);
}
