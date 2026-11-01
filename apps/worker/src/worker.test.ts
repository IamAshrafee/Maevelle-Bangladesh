import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '@maevelle/database';
import { createDatabase, sql } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { createOrganization } from '@maevelle/database/platform';

import { createWorker } from './worker.js';

describe('worker lifecycle', () => {
  it('checks PostgreSQL on startup and closes its shared database resource', async () => {
    const database: DatabaseClient = {
      db: {} as DatabaseClient['db'],
      ping: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
    };
    const worker = createWorker({
      database,
      heartbeatIntervalMs: 1_000,
      logger,
    });

    await worker.start();
    await worker.close();
    await worker.close();

    expect(database.ping).toHaveBeenCalledOnce();
    expect(database.close).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith({}, 'Worker started.');
    expect(logger.info).toHaveBeenCalledWith({}, 'Worker stopped.');
  });
});

const testUrl = process.env.TEST_DATABASE_URL;
describe('wishlist retention worker integration', () => {
  it.skipIf(!testUrl)('purges an expired share during the startup tick in an isolated database', async () => {
    if (!testUrl || new URL(testUrl).pathname !== '/maevelle_test')
      throw new Error('Use the isolated maevelle_test database URL.');
    const name = `maevelle_worker_wishlist_${crypto.randomUUID().replaceAll('-', '')}`;
    const adminUrl = new URL(testUrl);
    adminUrl.pathname = '/postgres';
    const admin = createDatabase({ connectionString: adminUrl.toString(), maxConnections: 1 });
    const url = new URL(testUrl);
    url.pathname = `/${name}`;
    let database: DatabaseClient | undefined;
    try {
      await sql.raw(`create database "${name}"`).execute(admin.db);
      database = createDatabase({ connectionString: url.toString(), maxConnections: 4 });
      await runMigrations(database.db);
      const organization = await createOrganization(database.db, {
        code: `worker-${crypto.randomUUID().slice(0, 8)}`, displayName: 'Worker test',
        timezone: 'Asia/Dhaka', defaultLocale: 'en', defaultCurrency: 'BDT',
      });
      const share = await sql<{ id: string }>`insert into wishlist.shares
        (organization_id,view_token_digest,manage_token_digest,created_at,expires_at)
        values (${organization.id},${Buffer.from(crypto.randomUUID())},${Buffer.from(crypto.randomUUID())},
          now()-interval '100 days',now()-interval '31 days') returning id::text`.execute(database.db);
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
        values (${organization.id},'wishlist.merge.completed',1,'wishlist.analytics',${crypto.randomUUID()}::uuid,1,'{}',now())`.execute(database.db);
      const worker = createWorker({ database, heartbeatIntervalMs: 60_000 });
      await worker.start();
      const remaining = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
        where organization_id=${organization.id} and id=${share.rows[0]!.id}::uuid`.execute(database.db);
      expect(remaining.rows[0]!.count).toBe(0);
      const outcomes = await sql<{ count: number }>`select count(*)::int count from analytics.wishlist_outcomes
        where organization_id=${organization.id} and event_name='wishlist.merge.completed'`.execute(database.db);
      expect(outcomes.rows[0]!.count).toBe(1);

      await worker.close();
      database = undefined;
    } finally {
      await database?.close();
      await sql.raw(`drop database if exists "${name}"`).execute(admin.db);
      await admin.close();
    }
  });
});
