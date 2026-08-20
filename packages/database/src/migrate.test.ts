import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { migrationStatus, runMigrations } from './migrate.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const configuredDatabaseName = testDatabaseUrl ? new URL(testDatabaseUrl).pathname.slice(1) : '';

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/.test(identifier)) throw new Error('Unsafe disposable database identifier.');
  return `"${identifier}"`;
}

describe('clean PostgreSQL migration path', () => {
  it('migrates a disposable empty database to the current schema and is safe to rerun', async () => {
    expect(configuredDatabaseName).toBe('maevelle_test');
    if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for migration testing.');

    const disposableName = `maevelle_migration_${crypto.randomUUID().replaceAll('-', '')}`;
    const disposableUrl = new URL(testDatabaseUrl);
    disposableUrl.pathname = `/${disposableName}`;
    const adminUrl = new URL(testDatabaseUrl);
    adminUrl.pathname = '/postgres';
    const adminPool = new Pool({ connectionString: adminUrl.toString() });
    let database: ReturnType<typeof createDatabase> | undefined;

    try {
      await adminPool.query(`create database ${quoteIdentifier(disposableName)}`);
      database = createDatabase({ connectionString: disposableUrl.toString(), maxConnections: 2 });

      const first = await runMigrations(database.db);
      expect(first.executed).toHaveLength(6);
      const extensions = await sql<{ extname: string }>`
        select extname from pg_extension where extname in ('pg_trgm', 'pg_stat_statements') order by extname
      `.execute(database.db);
      expect(extensions.rows.map((row) => row.extname)).toEqual(['pg_stat_statements', 'pg_trgm']);
      const schemas = await sql<{ schema_name: string }>`
        select schema_name from information_schema.schemata
        where schema_name in ('platform', 'audit', 'iam') order by schema_name
      `.execute(database.db);
      expect(schemas.rows.map((row) => row.schema_name)).toEqual(['audit', 'iam', 'platform']);
      const tables = await sql<{ table_name: string }>`
        select table_name from information_schema.tables
        where table_schema = 'platform' and table_name in ('organizations', 'idempotency_records', 'outbox_events')
        union all
        select table_name from information_schema.tables
        where table_schema = 'audit' and table_name = 'audit_events'
        union all
        select table_name from information_schema.tables
        where table_schema = 'iam' and table_name in ('users', 'organization_memberships')
        order by table_name
      `.execute(database.db);
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'audit_events',
        'idempotency_records',
        'organization_memberships',
        'organizations',
        'outbox_events',
        'users',
      ]);
      expect((await migrationStatus(database.db)).every((migration) => migration.executedAt)).toBe(
        true,
      );

      const second = await runMigrations(database.db);
      expect(second.executed).toEqual([]);
    } finally {
      await database?.close();
      await adminPool.query(
        'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
        [disposableName],
      );
      await adminPool.query(`drop database if exists ${quoteIdentifier(disposableName)}`);
      await adminPool.end();
    }
  }, 60_000);
});
