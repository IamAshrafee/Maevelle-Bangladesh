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
        where schema_name in ('platform', 'audit', 'iam', 'warehouse', 'inventory', 'geography', 'customers', 'pricing', 'promotions', 'cart', 'orders', 'payments', 'fulfillment', 'delivery', 'procurement', 'inbound_shipment', 'receiving', 'landed_cost', 'costing', 'returns') order by schema_name
      `.execute(database.db);
      expect(schemas.rows.map((row) => row.schema_name)).toEqual([
        'audit',
        'cart',
        'costing',
        'customers',
        'delivery',
        'fulfillment',
        'geography',
        'iam',
        'inbound_shipment',
        'inventory',
        'landed_cost',
        'orders',
        'payments',
        'platform',
        'pricing',
        'procurement',
        'promotions',
        'receiving',
        'returns',
        'warehouse',
      ]);
      const financeSchema = await sql<{ schema_name: string }>`
        select schema_name from information_schema.schemata where schema_name = 'finance'
      `.execute(database.db);
      expect(financeSchema.rows.map((row) => row.schema_name)).toEqual(['finance']);
      const financeTables = await sql<{ table_name: string }>`
        select table_name from information_schema.tables where table_schema = 'finance' order by table_name
      `.execute(database.db);
      expect(financeTables.rows.map((row) => row.table_name)).toEqual([
        'expense_adjustments',
        'expense_categories',
        'expense_links',
        'expense_payments',
        'expenses',
        'finance_transactions',
        'financial_account_entries',
        'financial_accounts',
        'internal_transfers',
        'reconciliation_issues',
        'reconciliation_sessions',
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
        union all
        select table_name from information_schema.tables
        where table_schema = 'procurement' and table_name in ('suppliers', 'purchases', 'purchase_lines')
        union all
        select table_name from information_schema.tables
        where table_schema = 'inbound_shipment' and table_name in ('shipments', 'purchase_line_allocations')
        union all
        select table_name from information_schema.tables
        where table_schema = 'receiving' and table_name in ('inbound_receipts', 'inbound_receipt_lines')
        union all
        select table_name from information_schema.tables
        where table_schema = 'landed_cost' and table_name in ('worksheets', 'worksheet_revisions', 'cost_components', 'allocation_targets', 'component_allocations', 'acquisition_cost_results')
        union all
        select table_name from information_schema.tables
        where table_schema = 'costing' and table_name in ('cost_layers', 'cost_layer_positions', 'cost_layer_adjustments', 'outbound_cost_assignments', 'outbound_cost_assignment_lines', 'cogs_recognitions')
        union all
        select table_name from information_schema.tables
        where table_schema = 'costing' and table_name in ('outbound_cost_assignment_adjustments', 'cogs_adjustments', 'return_cost_layers', 'cogs_recoveries')
        union all
        select table_name from information_schema.tables
        where table_schema = 'returns' and table_name in ('return_cases', 'return_lines', 'return_receipts', 'return_receipt_lines', 'return_refund_links')
        order by table_name
      `.execute(database.db);
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'acquisition_cost_results',
        'allocation_targets',
        'audit_events',
        'cart_lines',
        'carts',
        'checkout_sessions',
        'cod_collection_instructions',
        'cogs_adjustments',
        'cogs_recognitions',
        'cogs_recoveries',
        'component_allocations',
        'cost_components',
        'cost_layer_adjustments',
        'cost_layer_positions',
        'cost_layers',
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
        'inbound_receipt_lines',
        'inbound_receipts',
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
        'outbound_cost_assignment_adjustments',
        'outbound_cost_assignment_lines',
        'outbound_cost_assignments',
        'outbox_events',
        'payment_allocations',
        'payment_attempts',
        'payment_intents',
        'payment_methods',
        'payments',
        'price_definitions',
        'promotion_revisions',
        'promotions',
        'purchase_line_allocations',
        'purchase_lines',
        'purchases',
        'refund_allocations',
        'refunds',
        'return_cases',
        'return_cost_layers',
        'return_lines',
        'return_receipt_lines',
        'return_receipts',
        'return_refund_links',
        'shipments',
        'stocktake_sessions',
        'suppliers',
        'transfer_lines',
        'transfers',
        'users',
        'worksheet_revisions',
        'worksheets',
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
