import { sql, type Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';

import type { DatabaseSchema } from './index.js';
import { migrationProvider } from './migrations/index.js';

export interface MigrationResult {
  readonly executed: readonly string[];
}

export async function runMigrations(db: Kysely<DatabaseSchema>): Promise<MigrationResult> {
  const serverVersion = await sql<{ server_version_num: string }>`show server_version_num`.execute(
    db,
  );
  if (Number(serverVersion.rows[0]?.server_version_num ?? 0) < 180000) {
    throw new Error('Maevelle migrations require PostgreSQL 18 or later.');
  }

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
  const migrator = new Migrator({ db, provider: migrationProvider });
  return migrator.getMigrations();
}
