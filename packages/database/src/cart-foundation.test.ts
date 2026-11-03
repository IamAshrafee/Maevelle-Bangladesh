import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Migrator } from 'kysely/migration';
import { createDatabase, sql } from './index.js';
import { runMigrations } from './migrate.js';
import { migrations } from './migrations/index.js';
import {
  addGuestCartLine,
  applyGuestCartCoupon,
  createGuestCart,
  getGuestCart,
  removeGuestCartCoupon,
  removeGuestCartLine,
  setGuestCartLineQuantity,
} from './cart.js';
import { mutateGuestCart } from './cart/receipts.js';
import { createCouponCode, createPromotion } from './promotions.js';
import { setCurrentVariantPrice } from './pricing.js';
import { cartFixture, isolatedCartDatabase } from './testing/cart-fixture.js';
import { hashToken } from '@maevelle/security';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let database: ReturnType<typeof createDatabase>;
let url: string;
const connectionErrors: string[] = [];
beforeAll(async () => {
  isolation = await isolatedCartDatabase();
  url = isolation.url;
  database = createDatabase({
    connectionString: url,
    maxConnections: 10,
    onConnectionError: (code) => {
      connectionErrors.push(code);
    },
  });
  await runMigrations(database.db);
}, 30_000);
afterAll(async () => {
  await database?.close();
  await isolation?.close();
});
async function setup() {
  const fixture = await cartFixture(database);
  const guest = await createGuestCart(database.db, {
    organizationId: fixture.organizationId,
    currency: 'BDT',
  });
  return { ...fixture, ...guest };
}
describe('Cart foundation actual PostgreSQL', () => {
  it('S03/S04 sequential and concurrent replay commits one outcome and outbox fact', async () => {
    const f = await setup();
    const input = {
      token: f.token,
      variantId: f.variantId,
      quantity: '2',
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => addGuestCartLine(database.db, input)),
    );
    expect(results.filter((r) => !r.outcome!.replayed)).toHaveLength(1);
    expect(new Set(results.map((r) => r.outcome!.receiptId)).size).toBe(1);
    expect((await getGuestCart(database.db, f.token)).lines[0]!.quantity).toBe('2.000000');
    const events = await sql<{
      count: number;
    }>`select count(*)::int count from platform.outbox_events where aggregate_id=${f.cart.id}`.execute(
      database.db,
    );
    expect(events.rows[0]!.count).toBe(1);
    const recovered = await addGuestCartLine(database.db, input); // lost response/connection, new transaction
    expect(recovered.outcome!.replayed).toBe(true);
  });
  it('S03 same key changed quantity conflicts; owners and tenants have separate scopes', async () => {
    const f = await setup();
    const g = await setup();
    const input = {
      token: f.token,
      ownerContext: f.cart.ownerContext,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    await addGuestCartLine(database.db, input);
    await expect(addGuestCartLine(database.db, { ...input, quantity: '2' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const sameOrg = await createGuestCart(database.db, {
      organizationId: f.organizationId,
      currency: 'BDT',
    });
    expect(
      (
        await addGuestCartLine(database.db, {
          ...input,
          token: sameOrg.token,
          ownerContext: sameOrg.cart.ownerContext,
        })
      ).outcome!.replayed,
    ).toBe(false);
    expect(
      (
        await addGuestCartLine(database.db, {
          ...input,
          token: g.token,
          ownerContext: g.cart.ownerContext,
          variantId: g.variantId,
        })
      ).outcome!.replayed,
    ).toBe(false);
  });
  it('S19 competing edits serialize and report current revision', async () => {
    const f = await setup();
    const added = await addGuestCartLine(database.db, {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
    });
    const edits = await Promise.allSettled(
      ['2', '3'].map((quantity) =>
        setGuestCartLineQuantity(database.db, {
          token: f.token,
          lineId: added.lines[0]!.id,
          quantity,
          expectedVersion: 2,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );
    expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = edits.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: 'STALE_VERSION', currentVersion: 3 });
  });
  it('S07/S13 every existing mutation replays including quantity/remove/coupon selection', async () => {
    const f = await setup();
    const added = await addGuestCartLine(database.db, {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
    });
    const set = {
      token: f.token,
      lineId: added.lines[0]!.id,
      quantity: '2',
      expectedVersion: 2,
      idempotencyKey: crypto.randomUUID(),
    };
    await setGuestCartLineQuantity(database.db, set);
    expect((await setGuestCartLineQuantity(database.db, set)).outcome!.replayed).toBe(true);
    const promotion = await createPromotion(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      name: 'Synthetic',
      promotionType: 'COUPON',
      benefitType: 'PERCENTAGE_DISCOUNT',
      benefitValue: '10',
      combinability: 'EXCLUSIVE',
    });
    await createCouponCode(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      promotionId: promotion.id,
      code: 'CART10',
    });
    const apply = {
      token: f.token,
      couponCode: 'CART10',
      expectedVersion: 3,
      idempotencyKey: crypto.randomUUID(),
    };
    await applyGuestCartCoupon(database.db, apply);
    expect((await applyGuestCartCoupon(database.db, apply)).outcome!.replayed).toBe(true);
    const removeCoupon = { ...apply, expectedVersion: 4, idempotencyKey: crypto.randomUUID() };
    await removeGuestCartCoupon(database.db, removeCoupon);
    expect((await removeGuestCartCoupon(database.db, removeCoupon)).outcome!.replayed).toBe(true);
    const remove = {
      token: f.token,
      lineId: added.lines[0]!.id,
      expectedVersion: 5,
      idempotencyKey: crypto.randomUUID(),
    };
    await removeGuestCartLine(database.db, remove);
    expect((await removeGuestCartLine(database.db, remove)).outcome!.replayed).toBe(true);
    expect((await getGuestCart(database.db, f.token)).version).toBe(6);
  });
  it('S08 evaluation changes while immutable outcome/revision do not', async () => {
    const f = await setup();
    const input = {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    const first = await addGuestCartLine(database.db, input);
    await setCurrentVariantPrice(database.db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      currency: 'BDT',
      amount: '125.0000',
    });
    const replay = await addGuestCartLine(database.db, input);
    expect(replay.outcome!.committedVersion).toBe(first.outcome!.committedVersion);
    expect(replay.version).toBe(first.version);
    expect(replay.calculationFingerprint).not.toBe(first.calculationFingerprint);
    expect(replay.lines[0]!.unitPrice).toBe('125.0000');
  });
  it('S04 immutable committed quantity outcome remains distinct from the current projection', async () => {
    const f = await setup();
    const input = {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    const first = await addGuestCartLine(database.db, input);
    await setGuestCartLineQuantity(database.db, {
      token: f.token,
      lineId: first.lines[0]!.id,
      quantity: '3',
      expectedVersion: 2,
      idempotencyKey: crypto.randomUUID(),
    });
    const replay = await addGuestCartLine(database.db, input);
    expect(replay.outcome!.committedVersion).toBe('2');
    expect(replay.outcome!.changes).toEqual([
      { lineId: first.lines[0]!.id, variantId: f.variantId, previousQuantity: '0', quantity: '1' },
    ]);
    expect(replay.version).toBe(3);
    expect(replay.lines[0]!.quantity).toBe('3.000000');
  });
  it('S07 desired-state no-op receipts do not invent intent revisions/events', async () => {
    const f = await setup();
    const added = await addGuestCartLine(database.db, {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
    });
    const same = await setGuestCartLineQuantity(database.db, {
      token: f.token,
      lineId: added.lines[0]!.id,
      quantity: '1',
      expectedVersion: 2,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(same.version).toBe(2);
    expect(same.outcome!.changes).toEqual([]);
    expect(same.outcome!.eventIds).toEqual([]);
  });
  it('S53 rollback includes partial domain writes, receipt claim and outbox', async () => {
    const f = await setup();
    const key = crypto.randomUUID();
    await expect(
      mutateGuestCart(
        database.db,
        { token: f.token, expectedVersion: 1, idempotencyKey: key },
        'fault',
        async (tx) => {
          await sql`update cart.carts set version=version+1 where id=${f.cart.id}`.execute(tx);
          throw new Error('Synthetic disconnect before commit');
        },
      ),
    ).rejects.toThrow('Synthetic disconnect');
    expect((await getGuestCart(database.db, f.token)).version).toBe(1);
    const receipts = await sql<{
      count: number;
    }>`select count(*)::int count from platform.idempotency_records where principal_id=${f.cart.id}`.execute(
      database.db,
    );
    expect(receipts.rows[0]!.count).toBe(0);
  });
  it('S53 actual PostgreSQL connection termination rolls back and same intent can recover safely', async () => {
    const f = await setup();
    const input = { token: f.token, expectedVersion: 1, idempotencyKey: crypto.randomUUID() };
    await expect(
      mutateGuestCart(database.db, input, 'disconnect', async (tx) => {
        await sql`update cart.carts set version=2 where id=${f.cart.id}`.execute(tx);
        const pid = await sql<{ pid: number }>`select pg_backend_pid() pid`.execute(tx);
        await sql`select pg_terminate_backend(${pid.rows[0]!.pid})`.execute(database.db);
        return getGuestCart(tx, f.token);
      }),
    ).rejects.toThrow();
    expect((await getGuestCart(database.db, f.token)).version).toBe(1);
    expect(connectionErrors).toContain('DATABASE_CONNECTION_LOST');
    const recovered = await mutateGuestCart(database.db, input, 'disconnect', async (tx) => {
      await sql`update cart.carts set version=2 where id=${f.cart.id}`.execute(tx);
      return getGuestCart(tx, f.token);
    });
    expect(recovered.outcome).toMatchObject({ committedVersion: '2', replayed: false });
    const replay = await mutateGuestCart(database.db, input, 'disconnect', async () => {
      throw new Error('must never reexecute');
    });
    expect(replay.outcome!.replayed).toBe(true);
  });
  it('S03 expired receipt stays consumed and cannot reexecute', async () => {
    const f = await setup();
    const input = {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    const result = await addGuestCartLine(database.db, input);
    await sql`update platform.idempotency_records set expires_at=now()-interval '1 second' where id=${result.outcome!.receiptId}`.execute(
      database.db,
    );
    await expect(addGuestCartLine(database.db, input)).rejects.toMatchObject({
      code: 'INTENT_EXPIRED',
    });
    expect((await getGuestCart(database.db, f.token)).lines[0]!.quantity).toBe('1.000000');
  });
  it('S36 tenant/currency/context and public ID cannot authorize mutations', async () => {
    const f = await setup();
    const input = { token: f.token, variantId: f.variantId, quantity: '1', expectedVersion: 1 };
    await expect(
      addGuestCartLine(database.db, { ...input, organizationId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      addGuestCartLine(database.db, { ...input, currency: 'USD' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      addGuestCartLine(database.db, { ...input, ownerContext: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'OWNER_CHANGED' });
    await expect(getGuestCart(database.db, f.cart.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('S11 unpublished read redacts metadata, options, media and prices; remove remains possible', async () => {
    const f = await setup();
    const added = await addGuestCartLine(database.db, {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
    });
    await sql`update catalog.products set publication_status='UNPUBLISHED' where id=${f.productId}`.execute(
      database.db,
    );
    const view = await getGuestCart(database.db, f.token);
    expect(JSON.stringify(view)).not.toContain('Synthetic public clip');
    expect(view.lines[0]).toMatchObject({
      sku: '',
      productHandle: '',
      mediaAssetId: null,
      options: [],
      unitPrice: null,
      availability: 'UNAVAILABLE',
    });
    expect(
      (
        await removeGuestCartLine(database.db, {
          token: f.token,
          lineId: added.lines[0]!.id,
          expectedVersion: 2,
        })
      ).lines,
    ).toHaveLength(0);
  });
  it('S36 database scoped foreign keys reject mismatched tenant lines', async () => {
    const f = await setup();
    const g = await setup();
    await expect(
      sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${g.organizationId},${f.cart.id},${g.variantId},1)`.execute(
        database.db,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${f.organizationId},${f.cart.id},${g.variantId},1)`.execute(
        database.db,
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('S12 domain bounds reject huge/fractional/zero quantities before SQL work', async () => {
    const f = await setup();
    for (const quantity of ['0', '-1', '1.5', '1e9', '9'.repeat(5000), '100'])
      await expect(
        addGuestCartLine(database.db, {
          token: f.token,
          variantId: f.variantId,
          quantity,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await getGuestCart(database.db, f.token)).version).toBe(1);
  });
  it('T08/S33 owning Promotions caps stacks against remaining gross', async () => {
    const f = await setup();
    for (const suffix of ['first', 'second'])
      await createPromotion(database.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        name: `Stack ${suffix}`,
        promotionType: 'AUTOMATIC',
        benefitType: 'PERCENTAGE_DISCOUNT',
        benefitValue: '70',
        combinability: 'STACKABLE',
      });
    const added = await addGuestCartLine(database.db, {
      token: f.token,
      variantId: f.variantId,
      quantity: '1',
      expectedVersion: 1,
    });
    expect(added.merchandiseGross).toBe('100.0000');
    expect(added.discountTotal).toBe('91.0000');
    expect(added.merchandiseNet).toBe('9.0000');
  });
  it('migration 3213 upgrades populated prior schema and is ledger-repeatable', async () => {
    const sibling = `maevelle_cart01a_upgrade_${crypto.randomUUID().replaceAll('-', '')}`;
    await sql`create database ${sql.id(sibling)}`.execute(database.db);
    const u = new URL(url);
    u.pathname = `/${sibling}`;
    const upgrade = createDatabase({ connectionString: u.href });
    try {
      const previous = Object.fromEntries(
        Object.entries(migrations).filter(([name]) => name < '3213_cart_foundation'),
      );
      const migrator = new Migrator({
        db: upgrade.db,
        provider: { getMigrations: async () => previous },
      });
      const result = await migrator.migrateToLatest();
      if (result.error) throw result.error;
      const f = await cartFixture(upgrade);
      const token = 'upgrade-token-only-for-synthetic-local-fixture';
      const old = await sql<{
        id: string;
      }>`insert into cart.carts(organization_id,public_token_hash,currency_code,expires_at) values(${f.organizationId},${hashToken(token)},'BDT',now()+interval '1 day') returning id`.execute(
        upgrade.db,
      );
      await sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${f.organizationId},${old.rows[0]!.id},${f.variantId},2)`.execute(
        upgrade.db,
      );
      const promotion = await createPromotion(upgrade.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        name: 'Legacy coupon',
        promotionType: 'COUPON',
        benefitType: 'PERCENTAGE_DISCOUNT',
        benefitValue: '10',
        combinability: 'EXCLUSIVE',
      });
      const coupon = await createCouponCode(upgrade.db, {
        organizationId: f.organizationId,
        actorId: f.actorId,
        promotionId: promotion.id,
        code: 'UPGRADE10',
      });
      await sql`insert into cart.cart_coupons(cart_id,coupon_code_id) values(${old.rows[0]!.id},${coupon.id})`.execute(
        upgrade.db,
      );
      const key = crypto.randomUUID();
      await sql`update cart.carts set version=2 where id=${old.rows[0]!.id}`.execute(upgrade.db);
      await sql`insert into platform.idempotency_records
        (organization_id,principal_type,principal_id,operation_type,idempotency_key,request_fingerprint,status,safe_response,completed_at)
        values(${f.organizationId},'GUEST_CART',${old.rows[0]!.id},'cart.add_line',${key},
          ${hashToken(JSON.stringify({ variantId: f.variantId, quantity: '2' }))},'SUCCEEDED',
          ${JSON.stringify({ cartId: old.rows[0]!.id, version: 2 })}::jsonb,now())`.execute(
        upgrade.db,
      );
      const foundation = new Migrator({
        db: upgrade.db,
        provider: {
          getMigrations: async () =>
            Object.fromEntries(
              Object.entries(migrations).filter(([name]) => name <= '3213_cart_foundation'),
            ),
        },
      });
      const applied = await foundation.migrateToLatest();
      if (applied.error) throw applied.error;
      // Current facade deliberately cannot authorize pre-cutover credentials; inspect retained intent.
      await runMigrations(upgrade.db);
      await expect(getGuestCart(upgrade.db, token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const retained = await sql<{
        quantity: string;
        version: string;
        credential_state: string;
      }>`select line.quantity::text, cart.version::text, cart.credential_state from cart.carts cart join cart.cart_lines line on line.cart_id=cart.id where cart.id=${old.rows[0]!.id}`.execute(
        upgrade.db,
      );
      expect(retained.rows[0]).toEqual({
        quantity: '2.000000',
        version: '2',
        credential_state: 'RETIRED',
      });
      const receipt = await sql<{
        count: number;
      }>`select count(*)::int count from platform.idempotency_records where principal_id=${old.rows[0]!.id} and idempotency_key=${key}`.execute(
        upgrade.db,
      );
      expect(receipt.rows[0]!.count).toBe(1);
      const scope = await sql<{
        organization_id: string;
      }>`select organization_id from cart.cart_coupons where cart_id=${old.rows[0]!.id}`.execute(
        upgrade.db,
      );
      expect(scope.rows[0]!.organization_id).toBe(f.organizationId);
      const other = await cartFixture(upgrade);
      const foreign = await createPromotion(upgrade.db, {
        organizationId: other.organizationId,
        actorId: other.actorId,
        name: 'Foreign',
        promotionType: 'COUPON',
        benefitType: 'PERCENTAGE_DISCOUNT',
        benefitValue: '10',
        combinability: 'EXCLUSIVE',
      });
      const foreignCoupon = await createCouponCode(upgrade.db, {
        organizationId: other.organizationId,
        actorId: other.actorId,
        promotionId: foreign.id,
        code: 'FOREIGN10',
      });
      await expect(
        sql`insert into cart.cart_coupons(cart_id,coupon_code_id) values(${old.rows[0]!.id},${foreignCoupon.id})`.execute(
          upgrade.db,
        ),
      ).rejects.toMatchObject({ code: '23503' });
      expect((await runMigrations(upgrade.db)).executed).toEqual([]);
    } finally {
      await upgrade.close();
      await sql`drop database ${sql.id(sibling)}`.execute(database.db);
    }
  }, 30_000);
});
