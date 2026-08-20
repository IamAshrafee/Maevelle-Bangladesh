import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  const version = await sql<{ server_version_num: string }>`show server_version_num`.execute(db);
  const serverVersion = Number(version.rows[0]?.server_version_num ?? 0);

  if (serverVersion < 180000) {
    throw new Error(
      `Maevelle requires PostgreSQL 18 or later; connected server is ${serverVersion}.`,
    );
  }

  await sql`create extension if not exists pg_trgm`.execute(db);
  await sql`create extension if not exists pg_stat_statements`.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Baseline extensions are intentionally not removed by a down migration.');
}
