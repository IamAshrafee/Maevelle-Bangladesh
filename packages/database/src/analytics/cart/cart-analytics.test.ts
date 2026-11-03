import { afterAll, beforeAll, expect, it } from 'vitest';
import { Migrator } from 'kysely/migration';
import { sql } from '../../index.js';
import { migrationProvider } from '../../migrations/index.js';
import { runMigrations } from '../../migrate.js';
import { cartFixture, isolatedCartDatabase } from '../../testing/cart-fixture.js';
import {
  addCartLine,
  clearCart,
  createGuestCart,
  getGuestCart,
  setCartLineQuantity,
} from '../../cart.js';
import { parseCartMutationMeasurement, processCartAnalyticsOutbox } from './processing.js';
import { getCartActivity } from './reporting.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
beforeAll(async () => {
  isolation = await isolatedCartDatabase();
}, 30_000);
afterAll(async () => {
  await isolation?.close();
});

it('validates version, transfer kind, privacy allowlist and exact decimal values', () => {
  const measurement = {
    owner: 'ACCOUNT',
    wishlistAction: 'MOVE',
    currency: 'BDT',
    unitDelta: 2,
    unitsAfter: 2,
    linesAfter: 1,
    merchandiseGrossAfter: '9007199254740993.0000',
    merchandiseNetAfter: '9007199254740992.9999',
  };
  const payload = { operation: 'wishlist_transfer', measurement };
  expect(parseCartMutationMeasurement(2, payload)).toEqual(payload);
  expect(parseCartMutationMeasurement(1, payload)).toBeNull();
  for (const invalid of [
    { owner: 'GUEST' },
    { wishlistAction: null },
    { unitsAfter: 0 },
    { merchandiseNetAfter: '9007199254740993.0001' },
    { couponCode: 'private' },
  ]) {
    expect(
      parseCartMutationMeasurement(2, {
        ...payload,
        measurement: { ...measurement, ...invalid },
      }),
    ).toBeNull();
  }
});

it('upgrades a populated database and projects only committed revisions under concurrent consumers', async () => {
  const { database } = isolation;
  const db = database.db;
  const prior = await new Migrator({ db, provider: migrationProvider }).migrateTo(
    '3216_account_cart',
  );
  if (prior.error) throw prior.error;
  const fixture = await cartFixture(database);
  const { organizationId, variantId } = fixture;
  const { token, cart } = await createGuestCart(db, { organizationId, currency: 'BDT' });
  await sql`
    insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values (${organizationId},'cart.intent.mutated',1,'cart',${cart.id},1,'{}',now())
  `.execute(db);
  expect((await runMigrations(db)).executed).toEqual(['3217_cart_analytics']);

  const input = {
    token,
    variantId,
    quantity: '2',
    expectedVersion: cart.version,
    idempotencyKey: crypto.randomUUID(),
  };
  const from = new Date(Date.now() - 10_000);
  const attempts = await Promise.all([addCartLine(db, input), addCartLine(db, input)]);
  expect(attempts.map((result) => result.outcome!.replayed).sort()).toEqual([false, true]);
  expect(attempts[0]!.outcome!.eventIds).toEqual(attempts[1]!.outcome!.eventIds);
  const added = attempts[0]!;
  await expect(
    addCartLine(db, { ...input, idempotencyKey: crypto.randomUUID() }),
  ).rejects.toMatchObject({
    code: 'STALE_VERSION',
  });
  const unchanged = await setCartLineQuantity(db, {
    token,
    lineId: added.lines[0]!.id,
    quantity: '2',
    expectedVersion: added.version,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(unchanged.outcome!.eventIds).toEqual([]);
  await getGuestCart(db, token);

  // Put a malformed event before the valid Clear so a poison fact cannot stall the queue.
  await sql`
    with event as (
      insert into platform.outbox_events
        (organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
      values (${organizationId},'cart.intent.mutated',2,'cart',${cart.id},'{}',now()) returning id
    )
    insert into platform.event_consumer_receipts(outbox_event_id,consumer_name,status)
    select id,'analytics.cart.v1','PENDING' from event
  `.execute(db);
  await clearCart(db, {
    token,
    expectedVersion: added.version,
    idempotencyKey: crypto.randomUUID(),
  });
  // A transient projection write failure rolls back the claim and leaves the Cart available.
  await db.transaction().execute(async (blocker) => {
    await sql`lock table analytics.cart_mutations in access exclusive mode`.execute(blocker);
    await expect(processCartAnalyticsOutbox(db, 1)).rejects.toMatchObject({ code: '55P03' });
    expect((await getGuestCart(db, token)).lines).toEqual([]);
  });

  const results = await Promise.all([
    processCartAnalyticsOutbox(db, 1),
    processCartAnalyticsOutbox(db, 1),
  ]);
  expect(results).toContainEqual({ processed: 1, rejected: 0 });
  expect(results).toContainEqual({ processed: 0, rejected: 1 });
  expect(await processCartAnalyticsOutbox(db)).toEqual({ processed: 1, rejected: 0 });
  expect(await processCartAnalyticsOutbox(db)).toEqual({ processed: 0, rejected: 0 });

  const period = { from, to: new Date(Date.now() + 10_000) };
  const report = await getCartActivity(db, organizationId, period);
  expect(report).toMatchObject({
    mutations: '2',
    distinctCarts: '1',
    breakdown: [
      {
        operation: 'add_line',
        owner: 'GUEST',
        currency: 'BDT',
        netUnitChange: '2',
        mutations: '1',
      },
      { operation: 'clear', owner: 'GUEST', currency: 'BDT', netUnitChange: '-2', mutations: '1' },
    ],
  });
  expect(await getCartActivity(db, crypto.randomUUID(), period)).toEqual({
    mutations: '0',
    distinctCarts: '0',
    breakdown: [],
  });
  const facts = await sql<{ gross: string; net: string }>`
    select merchandise_gross_after::text as gross, merchandise_net_after::text as net
    from analytics.cart_mutations where organization_id=${organizationId} and operation='add_line'
  `.execute(db);
  expect(facts.rows).toEqual([{ gross: added.merchandiseGross, net: added.merchandiseNet }]);
}, 30_000);
