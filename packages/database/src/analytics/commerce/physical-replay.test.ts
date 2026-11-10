import { it, expect } from 'vitest';
import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { isolatedCartDatabase } from '../../testing/cart-fixture.js';
import { manualPaymentFixture } from '../../testing/manual-payment-fixture.js';
import { runMigrations } from '../../migrate.js';
import { processCommerceAnalyticsOutbox } from './processing.js';

it.each(['CLAIMED', 'COMMITTED'])(
  'survives physical consumer termination at %s and replays once',
  async (stage) => {
    const isolated = await isolatedCartDatabase();
    try {
      const db = isolated.database.db;
      await runMigrations(db);
      const f = await manualPaymentFixture(db);
      await f.order();
      const business = (
        await sql`select (select count(*) from orders.orders) orders,(select count(*) from payments.payment_intents) obligations,(select count(*) from payments.payments) money`.execute(
          db,
        )
      ).rows;
      const child = fork(
        resolve(import.meta.dirname, '../../../../../scripts/fixtures/commerce-crash-child.mjs'),
        [],
        {
          env: { ...process.env, PHASE08_CHILD_DATABASE: isolated.url, PHASE08_CHILD_STAGE: stage },
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          execArgv: [],
        },
      );
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Consumer stage timeout')), 15000);
          child.once('message', (message) => {
            clearTimeout(timer);
            if (message === stage) resolve();
            else reject(new Error('Unexpected consumer stage'));
          });
          child.once('exit', () => {
            clearTimeout(timer);
            reject(new Error('Consumer exited before fault stage'));
          });
        });
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
        child.kill('SIGKILL');
        await exited;
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
      }
      const before = (
        await sql`select event_name,business_id from analytics.commerce_events order by id`.execute(
          db,
        )
      ).rows;
      if (stage === 'CLAIMED') expect(before).toHaveLength(0);
      else expect(before.length).toBeGreaterThan(0);
      await Promise.all([processCommerceAnalyticsOutbox(db), processCommerceAnalyticsOutbox(db)]);
      const rows = (
        await sql<{
          n: number;
        }>`select event_name,business_id,count(*)::int n from analytics.commerce_events group by event_name,business_id`.execute(
          db,
        )
      ).rows;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.n === 1)).toBe(true);
      expect(
        (
          await sql`select (select count(*) from orders.orders) orders,(select count(*) from payments.payment_intents) obligations,(select count(*) from payments.payments) money`.execute(
            db,
          )
        ).rows,
      ).toEqual(business);
    } finally {
      await isolated.close();
    }
  },
  30000,
);
