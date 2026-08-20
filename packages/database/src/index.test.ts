import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase, type DatabaseClient } from './index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must be configured for database integration tests.');
}

describe('database infrastructure', () => {
  let database: DatabaseClient | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('connects to the dedicated test database and executes SELECT 1', async () => {
    database = createDatabase({ connectionString: testDatabaseUrl });

    await expect(database.ping()).resolves.toBeUndefined();
  });

  it('rolls back database changes when a transaction fails', async () => {
    database = createDatabase({ connectionString: testDatabaseUrl });
    await sql`drop table if exists task005_transaction_rollback_marker`.execute(database.db);

    await expect(
      database.db.transaction().execute(async (transaction) => {
        await sql`create table task005_transaction_rollback_marker (id integer not null)`.execute(
          transaction,
        );
        await sql`insert into task005_transaction_rollback_marker (id) values (1)`.execute(
          transaction,
        );
        throw new Error('Force transaction rollback.');
      }),
    ).rejects.toThrow('Force transaction rollback.');

    const result = await sql<{ readonly tableName: string | null }>`
      select to_regclass('public.task005_transaction_rollback_marker') as "tableName"
    `.execute(database.db);

    expect(result.rows[0]?.tableName).toBeNull();
  });
});
