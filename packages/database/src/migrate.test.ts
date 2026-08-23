import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { migrationStatus, runMigrations } from './migrate.js';
import { migrations } from './migrations/index.js';

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
      expect(first.executed).toHaveLength(Object.keys(migrations).length);
      const extensions = await sql<{ extname: string }>`
        select extname from pg_extension where extname in ('pg_trgm', 'pg_stat_statements') order by extname
      `.execute(database.db);
      expect(extensions.rows.map((row) => row.extname)).toEqual(['pg_stat_statements', 'pg_trgm']);
      const schemas = await sql<{ schema_name: string }>`
        select schema_name from information_schema.schemata
        where schema_name in ('platform', 'audit', 'iam', 'warehouse', 'inventory', 'geography', 'customers', 'pricing', 'promotions', 'cart', 'orders', 'payments', 'fulfillment', 'delivery') order by schema_name
      `.execute(database.db);
      expect(schemas.rows.map((row) => row.schema_name)).toEqual([
        'audit',
        'cart',
        'customers',
        'delivery',
        'fulfillment',
        'geography',
        'iam',
        'inventory',
        'orders',
        'payments',
        'platform',
        'pricing',
        'promotions',
        'warehouse',
      ]);
      const tables = await sql<{ table_name: string }>`
        select table_name from information_schema.tables
        where table_schema = 'platform' and table_name in ('organizations', 'idempotency_records', 'outbox_events')
        union all
        select table_name from information_schema.tables
        where table_schema = 'audit' and table_name = 'audit_events'
        union all
        select table_name from information_schema.tables
        where table_schema = 'iam' and table_name in ('users', 'organization_memberships')
        union all
        select table_name from information_schema.tables
        where table_schema = 'warehouse' and table_name in ('locations', 'transfers', 'transfer_lines')
        union all
        select table_name from information_schema.tables
        where table_schema = 'inventory' and table_name in ('inventory_items', 'inventory_levels', 'inventory_movement_lines', 'inventory_reservations', 'inventory_reservation_allocations', 'stocktake_sessions')
        union all
        select table_name from information_schema.tables
        where table_schema = 'cart' and table_name in ('carts', 'cart_lines')
        union all
        select table_name from information_schema.tables
        where table_schema = 'customers' and table_name in ('customers', 'customer_phones', 'customer_addresses')
        union all
        select table_name from information_schema.tables
        where table_schema = 'geography' and table_name in ('datasets', 'nodes', 'node_aliases')
        union all
        select table_name from information_schema.tables
        where table_schema = 'pricing' and table_name = 'price_definitions'
        union all
        select table_name from information_schema.tables
        where table_schema = 'promotions' and table_name in ('promotions', 'promotion_revisions', 'coupon_codes')
        union all
        select table_name from information_schema.tables
        where table_schema = 'orders' and table_name in ('checkout_sessions', 'orders', 'order_lines', 'order_customer_snapshots', 'order_addresses')
        union all
        select table_name from information_schema.tables
        where table_schema = 'payments' and table_name in ('payment_methods', 'payment_intents', 'payment_attempts', 'payments', 'payment_allocations', 'refund_allocations', 'refunds')
        union all
        select table_name from information_schema.tables
        where table_schema = 'fulfillment' and table_name in ('fulfillments', 'fulfillment_lines')
        union all
        select table_name from information_schema.tables
        where table_schema = 'delivery' and table_name in ('deliveries', 'delivery_lines', 'delivery_events', 'delivery_attempts', 'courier_bookings', 'cod_collection_instructions')
        order by table_name
      `.execute(database.db);
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'audit_events',
        'cart_lines',
        'carts',
        'checkout_sessions',
        'cod_collection_instructions',
        'coupon_codes',
        'courier_bookings',
        'customer_addresses',
        'customer_phones',
        'customers',
        'datasets',
        'deliveries',
        'delivery_attempts',
        'delivery_events',
        'delivery_lines',
        'fulfillment_lines',
        'fulfillments',
        'idempotency_records',
        'inventory_items',
        'inventory_levels',
        'inventory_movement_lines',
        'inventory_reservation_allocations',
        'inventory_reservations',
        'locations',
        'node_aliases',
        'nodes',
        'order_addresses',
        'order_customer_snapshots',
        'order_lines',
        'orders',
        'organization_memberships',
        'organizations',
        'outbox_events',
        'payment_allocations',
        'payment_attempts',
        'payment_intents',
        'payment_methods',
        'payments',
        'price_definitions',
        'promotion_revisions',
        'promotions',
        'refund_allocations',
        'refunds',
        'stocktake_sessions',
        'transfer_lines',
        'transfers',
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
