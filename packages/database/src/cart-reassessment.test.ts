import { afterAll, beforeAll, expect, it } from 'vitest';
import { Migrator } from 'kysely/migration';
import type { KyselyPlugin, RootOperationNode, QueryResult, UnknownRow } from 'kysely';
import { writeFileSync } from 'node:fs';
import { createDatabase, sql } from './index.js';
import { runMigrations } from './migrate.js';
import { migrations } from './migrations/index.js';
import { cartFixture, isolatedCartDatabase } from './testing/cart-fixture.js';
import {
  addGuestCartLine,
  clearGuestCart,
  createGuestCart,
  getGuestCart,
  applyGuestCartCoupon,
} from './cart.js';
import { createCouponCode, createPromotion } from './promotions.js';
import { resolveVariantPrice, resolveVariantPrices } from './pricing.js';

let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let f: Awaited<ReturnType<typeof cartFixture>>;
beforeAll(async () => {
  isolated = await isolatedCartDatabase();
  await runMigrations(isolated.database.db);
  f = await cartFixture(isolated.database);
}, 30000);
afterAll(async () => {
  await isolated?.close();
});
const guest = () =>
  createGuestCart(isolated.database.db, { organizationId: f.organizationId, currency: 'BDT' });

it('AR01 Clear atomically removes lines and coupons, duplicates commit one receipt/event and preserve stock', async () => {
  const db = isolated.database.db;
  const g = await guest();
  const added = await addGuestCartLine(db, {
    token: g.token,
    variantId: f.variantId,
    quantity: '2',
    expectedVersion: 1,
  });
  const p = await createPromotion(db, {
    organizationId: f.organizationId,
    actorId: f.actorId,
    name: 'Clear test',
    promotionType: 'COUPON',
    benefitType: 'PERCENTAGE_DISCOUNT',
    benefitValue: '10',
    combinability: 'EXCLUSIVE',
  });
  await createCouponCode(db, {
    organizationId: f.organizationId,
    actorId: f.actorId,
    promotionId: p.id,
    code: 'ARCLEAR',
  });
  const selected = await applyGuestCartCoupon(db, {
    token: g.token,
    couponCode: 'ARCLEAR',
    expectedVersion: added.version,
  });
  const before =
    await sql`select sellable_quantity,reserved_quantity from inventory.inventory_levels where organization_id=${f.organizationId} order by id`.execute(
      db,
    );
  const input = {
    token: g.token,
    organizationId: f.organizationId,
    currency: 'BDT',
    ownerContext: g.cart.ownerContext,
    expectedVersion: selected.version,
    idempotencyKey: crypto.randomUUID(),
  };
  const second = createDatabase({ connectionString: isolated.url });
  try {
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, (_, n) => clearGuestCart(n % 2 ? db : second.db, input)),
    );
    expect(outcomes.filter((v) => !v.outcome!.replayed)).toHaveLength(1);
    expect(new Set(outcomes.map((v) => v.outcome!.receiptId)).size).toBe(1);
    expect(outcomes[0]!.version).toBe(selected.version + 1);
    expect(outcomes[0]!.lines).toEqual([]);
    expect(outcomes[0]!.appliedCoupons).toEqual([]);
    expect(outcomes[0]!.outcome!.changes[0]).toMatchObject({
      previousQuantity: '2',
      quantity: '0',
    });
    expect(outcomes[0]!.outcome!.eventIds).toHaveLength(1);
    // Replay after reconnect still returns the same committed outcome.
    const replay = await clearGuestCart(second.db, input);
    expect(replay.outcome!.receiptId).toBe(outcomes[0]!.outcome!.receiptId);
    const after =
      await sql`select sellable_quantity,reserved_quantity from inventory.inventory_levels where organization_id=${f.organizationId} order by id`.execute(
        db,
      );
    expect(after.rows).toEqual(before.rows);
  } finally {
    await second.close();
  }
});
it('AR02 empty Clear produces a consumed no-op receipt and stale Clear cannot delete newer intent', async () => {
  const db = isolated.database.db,
    g = await guest();
  const noop = await clearGuestCart(db, {
    token: g.token,
    expectedVersion: 1,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(noop.version).toBe(1);
  expect(noop.outcome).toMatchObject({ changes: [], eventIds: [], committedVersion: '1' });
  await addGuestCartLine(db, {
    token: g.token,
    expectedVersion: 1,
    variantId: f.variantId,
    quantity: '1',
  });
  await expect(
    clearGuestCart(db, { token: g.token, expectedVersion: 1, idempotencyKey: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect((await getGuestCart(db, g.token)).lines).toHaveLength(1);
});
it('AR03 Clear versus Add uses one cart lock and one revision winner', async () => {
  const db = isolated.database.db,
    g = await guest();
  const v = await addGuestCartLine(db, {
    token: g.token,
    expectedVersion: 1,
    variantId: f.variantId,
    quantity: '1',
  });
  const results = await Promise.allSettled([
    clearGuestCart(db, {
      token: g.token,
      expectedVersion: v.version,
      idempotencyKey: crypto.randomUUID(),
    }),
    addGuestCartLine(db, {
      token: g.token,
      expectedVersion: v.version,
      variantId: f.variantId,
      quantity: '1',
      idempotencyKey: crypto.randomUUID(),
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')).toMatchObject({
    reason: { code: 'STALE_VERSION' },
  });
});
it('AR04 actual post-delete trigger failure rolls Clear and receipt back; exact retry recovers', async () => {
  const db = isolated.database.db,
    g = await guest();
  const v = await addGuestCartLine(db, {
    token: g.token,
    expectedVersion: 1,
    variantId: f.variantId,
    quantity: '1',
  });
  const input = { token: g.token, expectedVersion: v.version, idempotencyKey: crypto.randomUUID() };
  await sql`create function cart.synthetic_reject_clear() returns trigger language plpgsql as $$ begin raise exception 'synthetic clear rollback'; end $$;
    create trigger synthetic_reject_clear before update on cart.carts for each row execute function cart.synthetic_reject_clear()`.execute(
    db,
  );
  try {
    await expect(clearGuestCart(db, input)).rejects.toThrow('synthetic clear rollback');
  } finally {
    await sql`drop trigger synthetic_reject_clear on cart.carts; drop function cart.synthetic_reject_clear()`.execute(
      db,
    );
  }
  const still = await getGuestCart(db, g.token);
  expect(still.version).toBe(v.version);
  expect(still.lines).toHaveLength(1);
  const records =
    await sql`select id from platform.idempotency_records where idempotency_key=${input.idempotencyKey}`.execute(
      db,
    );
  expect(records.rows).toEqual([]);
  expect((await clearGuestCart(db, input)).outcome!.replayed).toBe(false);
});
it('AR05 PostgreSQL rejects fractional, excessive quantities, invalid revisions/prices and foreign customer links', async () => {
  const db = isolated.database.db,
    g = await guest();
  for (const q of ['0.5', '100', 'NaN'])
    await expect(
      sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${f.organizationId},${g.cart.id},${f.variantId},${q}::numeric)`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  await addGuestCartLine(db, {
    token: g.token,
    expectedVersion: 1,
    variantId: f.variantId,
    quantity: '1',
  });
  await expect(
    sql`update cart.cart_lines set version=0 where cart_id=${g.cart.id}`.execute(db),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    sql`update cart.cart_lines set last_seen_unit_price=-1 where cart_id=${g.cart.id}`.execute(db),
  ).rejects.toMatchObject({ code: '23514' });
  const foreign = await cartFixture(isolated.database);
  const customer = await sql<{
    id: string;
  }>`insert into customers.customers(organization_id,customer_number,display_name) values(${foreign.organizationId},'AR-FOREIGN','Synthetic foreign') returning id`.execute(
    db,
  );
  await expect(
    sql`update cart.carts set customer_id=${customer.rows[0]!.id} where id=${g.cart.id}`.execute(
      db,
    ),
  ).rejects.toMatchObject({ code: '23503' });
});
it('AR06 migration upgrades populated 3214, fails safely on invalid legacy data and supports forward repair', async () => {
  const old = await isolatedCartDatabase(),
    db = old.database.db;
  try {
    const previous = new Migrator({
      db,
      provider: {
        getMigrations: async () =>
          Object.fromEntries(
            Object.entries(migrations).filter(([name]) => name < '3215_cart_integrity'),
          ),
      },
    });
    const result = await previous.migrateToLatest();
    if (result.error) throw result.error;
    const fixture = await cartFixture(old.database);
    const g = await createGuestCart(db, {
      organizationId: fixture.organizationId,
      currency: 'BDT',
    });
    await sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${fixture.organizationId},${g.cart.id},${fixture.variantId},0.5)`.execute(
      db,
    );
    await expect(runMigrations(db)).rejects.toThrow();
    const retained = await sql<{
      quantity: string;
    }>`select quantity::text from cart.cart_lines where cart_id=${g.cart.id}`.execute(db);
    expect(retained.rows[0]!.quantity).toBe('0.500000');
    // Explicit synthetic-data repair. No automatic truncation belongs in the migration.
    await sql`update cart.cart_lines set quantity=2 where cart_id=${g.cart.id}`.execute(db);
    expect((await runMigrations(db)).executed).toEqual(['3215_cart_integrity']);
    expect((await getGuestCart(db, g.token)).lines[0]!.quantity).toBe('2.000000');
    expect((await runMigrations(db)).executed).toEqual([]);
  } finally {
    await old.close();
  }
}, 30000);
it('AR07 batch price resolution matches the existing single authoritative temporal contract', async () => {
  const at = new Date(),
    db = isolated.database.db;
  const input = { organizationId: f.organizationId, currency: 'BDT', at };
  const prices = await resolveVariantPrices(db, {
    ...input,
    variantIds: [f.variantId, crypto.randomUUID()],
  });
  expect(prices.size).toBe(1);
  expect(prices.get(f.variantId)).toEqual(
    await resolveVariantPrice(db, { ...input, variantId: f.variantId }),
  );
  expect((await resolveVariantPrices(db, { ...input, variantIds: [] })).size).toBe(0);
});
it('AR08 1/20/100-line hydration uses constant query count; capture focused timings and real query plans', async () => {
  const db = isolated.database.db,
    g = await guest();
  const samples: { lines: number; queryCount: number; medianMs: number; p95Ms: number }[] = [];
  let count = 0;
  const plugin: KyselyPlugin = {
    transformQuery(args: { node: RootOperationNode }) {
      count++;
      return args.node;
    },
    async transformResult(args: { result: QueryResult<UnknownRow> }) {
      return args.result;
    },
  };
  const measured = db.withPlugin(plugin);
  for (const size of [1, 20, 100]) {
    await sql`delete from cart.cart_lines where cart_id=${g.cart.id}`.execute(db);
    const variants = await sql<{
      id: string;
    }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
      select ${f.organizationId},${f.productId},upper('AR-'||${g.cart.id}||'-'||${size}||'-'||n),upper('AR-'||${g.cart.id}||'-'||${size}||'-'||n),'ar-'||${size}||'-'||n from generate_series(1,${size}) n returning id`.execute(
      db,
    );
    for (const v of variants.rows) {
      await sql`insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount,effective_from,status) values(${f.organizationId},${v.id},'BDT',100,now()-interval '1 day','ACTIVE')`.execute(
        db,
      );
      await sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${f.organizationId},${g.cart.id},${v.id},1)`.execute(
        db,
      );
    }
    const times: number[] = [],
      counts: number[] = [];
    for (let n = 0; n < 10; n++) {
      count = 0;
      const start = performance.now();
      const view = await getGuestCart(measured, g.token);
      times.push(performance.now() - start);
      counts.push(count);
      expect(view.lines).toHaveLength(size);
      expect(view.lines.every((line) => line.unitPrice === '100.0000')).toBe(true);
    }
    times.sort((a, b) => a - b);
    expect(new Set(counts).size).toBe(1);
    samples.push({ lines: size, queryCount: counts[0]!, medianMs: times[5]!, p95Ms: times[9]! });
  }
  expect(new Set(samples.map((s) => s.queryCount)).size).toBe(1);
  const pricePlan =
    await sql`explain (analyze,buffers,format json) select distinct on (variant_id) id,variant_id,amount from pricing.price_definitions
    where organization_id=${f.organizationId} and variant_id=any(array(select variant_id from cart.cart_lines where cart_id=${g.cart.id}))
      and currency_code='BDT' and status='ACTIVE' and effective_from<=now() and (effective_to is null or effective_to>now()) order by variant_id,effective_from desc,id desc`.execute(
      db,
    );
  const ownerPlan =
    await sql`explain (analyze,buffers,format json) select id from cart.carts where public_token_hash='synthetic-nonmatching-hash' and credential_state='SLOT_V1' and owner_account_id is null and status='ACTIVE' and expires_at>clock_timestamp()`.execute(
      db,
    );
  // Artifact writes are opt-in; regression tests must never overwrite historical phase evidence.
  if (process.env.CART_PERFORMANCE_OUTPUT)
    writeFileSync(
      process.env.CART_PERFORMANCE_OUTPUT,
      JSON.stringify(
        {
          samples,
          pricePlan: pricePlan.rows,
          ownerPlan: ownerPlan.rows,
          limitation:
            'Synthetic local 100-line reads; no concurrent load or representative catalog cardinality. Stock absent on benchmark variants.',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
}, 30000);

it('AR14 compare-at-only price edits change calculation fingerprint without changing customer intent revision', async () => {
  const db = isolated.database.db,
    g = await guest();
  const before = await addGuestCartLine(db, {
    token: g.token,
    variantId: f.variantId,
    quantity: '1',
    expectedVersion: 1,
  });
  await sql`update pricing.price_definitions set compare_at_amount=200,version=version+1 where organization_id=${f.organizationId} and variant_id=${f.variantId} and status='ACTIVE'`.execute(
    db,
  );
  const after = await getGuestCart(db, g.token);
  expect(after.version).toBe(before.version);
  expect(after.calculationFingerprint).not.toBe(before.calculationFingerprint);
  expect(after.lines[0]!.compareAtUnitPrice).toBe('200.0000');
});

it('AR15 failed issuance projection rolls back the new cart instead of leaking empty records', async () => {
  const db = isolated.database.db;
  const before = await sql<{ count: number }>`select count(*)::int count from cart.carts`.execute(
    db,
  );
  await expect(
    createGuestCart(db, {
      organizationId: f.organizationId,
      currency: 'BDT',
      expiresAt: new Date(Date.now() - 10000),
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const after = await sql<{ count: number }>`select count(*)::int count from cart.carts`.execute(
    db,
  );
  expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
});
