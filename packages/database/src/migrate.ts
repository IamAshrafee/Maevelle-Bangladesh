import { sql, type Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';

import type { DatabaseSchema } from './index.js';
import { migrationProvider, migrations } from './migrations/index.js';

export interface MigrationResult {
  readonly executed: readonly string[];
}

/** Refuse an unknown or gapped applied history before Kysely mutates the schema. */
export async function validateMigrationLedger(db: Kysely<DatabaseSchema>): Promise<void> {
  const table = await sql<{
    present: string | null;
  }>`select to_regclass('public.kysely_migration')::text as present`.execute(db);
  if (!table.rows[0]?.present) return;
  const actual = await sql<{
    name: string;
  }>`select name from public.kysely_migration order by name`.execute(db);
  const expected = Object.keys(migrations).sort();
  for (let index = 0; index < actual.rows.length; index++) {
    const name = actual.rows[index]?.name;
    if (name !== expected[index]) {
      throw new Error(
        `Migration ledger mismatch at position ${index + 1}: applied ${name ?? '<none>'}, expected ${expected[index] ?? '<none>'}.`,
      );
    }
  }
}

export async function runMigrations(db: Kysely<DatabaseSchema>): Promise<MigrationResult> {
  const serverVersion = await sql<{ server_version_num: string }>`show server_version_num`.execute(
    db,
  );
  if (Number(serverVersion.rows[0]?.server_version_num ?? 0) < 180000) {
    throw new Error('Maevelle migrations require PostgreSQL 18 or later.');
  }

  await validateMigrationLedger(db);

  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  return {
    executed: (results ?? [])
      .filter((result) => result.status === 'Success')
      .map((result) => result.migrationName),
  };
}

export async function migrationStatus(db: Kysely<DatabaseSchema>) {
  await validateMigrationLedger(db);
  const migrator = new Migrator({ db, provider: migrationProvider });
  return migrator.getMigrations();
}
