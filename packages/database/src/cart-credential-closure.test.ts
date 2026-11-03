import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from './index.js';
import { runMigrations } from './migrate.js';
import { cartFixture, isolatedCartDatabase } from './testing/cart-fixture.js';
import { createGuestCart, addGuestCartLine, getGuestCart } from './cart.js';
import { retireGuestCartCredential } from './cart/credentials.js';
import { hashToken } from '@maevelle/security';
let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let fixture: Awaited<ReturnType<typeof cartFixture>>;
beforeAll(async () => {
  isolated = await isolatedCartDatabase();
  await runMigrations(isolated.database.db);
  fixture = await cartFixture(isolated.database);
}, 30000);
afterAll(async () => {
  await isolated?.close();
});
async function guest() {
  return createGuestCart(isolated.database.db, {
    organizationId: fixture.organizationId,
    currency: 'BDT',
  });
}
it('retirement preserves items/revision/receipt, denies old facade and is irreversible', async () => {
  const g = await guest(),
    db = isolated.database.db;
  const input = {
    token: g.token,
    variantId: fixture.variantId,
    quantity: '2',
    expectedVersion: 1,
    idempotencyKey: crypto.randomUUID(),
  };
  const added = await addGuestCartLine(db, input);
  await retireGuestCartCredential(db, {
    token: g.token,
    organizationId: fixture.organizationId,
    ownerContext: g.cart.ownerContext,
  });
  await expect(getGuestCart(db, g.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(addGuestCartLine(db, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const state = await sql<{
    version: string;
    quantity: string;
    credential_state: string;
  }>`select c.version::text,l.quantity::text,c.credential_state from cart.carts c join cart.cart_lines l on l.cart_id=c.id where c.id=${g.cart.id}`.execute(
    db,
  );
  expect(state.rows[0]).toEqual({
    version: '2',
    quantity: '2.000000',
    credential_state: 'RETIRED',
  });
  const receipts = await sql<{
    safe_response: unknown;
  }>`select safe_response from platform.idempotency_records where id=${added.outcome!.receiptId}`.execute(
    db,
  );
  expect(receipts.rows[0]!.safe_response).toEqual(added.outcome);
  await expect(
    sql`update cart.carts set credential_state='SLOT_V1',public_token_hash=${hashToken(g.token)} where id=${g.cart.id}`.execute(
      db,
    ),
  ).rejects.toMatchObject({ code: '23514' });
});
it('duplicate retirements serialize, one succeeds, and wrong owner/tenant never retires', async () => {
  const g = await guest(),
    db = isolated.database.db;
  for (const scope of [
    { organizationId: crypto.randomUUID(), ownerContext: g.cart.ownerContext },
    { organizationId: fixture.organizationId, ownerContext: crypto.randomUUID() },
  ])
    await expect(retireGuestCartCredential(db, { token: g.token, ...scope })).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
  expect((await getGuestCart(db, g.token)).id).toBe(g.cart.id);
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      retireGuestCartCredential(db, {
        token: g.token,
        organizationId: fixture.organizationId,
        ownerContext: g.cart.ownerContext,
      }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
it('mutation and retirement on independent transactions serialize without resurrecting tokens', async () => {
  const g = await guest(),
    db = isolated.database.db;
  const outcomes = await Promise.allSettled([
    addGuestCartLine(db, {
      token: g.token,
      variantId: fixture.variantId,
      quantity: '1',
      expectedVersion: 1,
    }),
    retireGuestCartCredential(db, {
      token: g.token,
      organizationId: fixture.organizationId,
      ownerContext: g.cart.ownerContext,
    }),
  ]);
  expect(outcomes[1]!.status).toBe('fulfilled');
  await expect(getGuestCart(db, g.token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const rows = await sql<{
    version: string;
    count: number;
  }>`select version::text,(select count(*)::int from cart.cart_lines where cart_id=c.id) count from cart.carts c where id=${g.cart.id}`.execute(
    db,
  );
  expect(rows.rows[0]).toEqual(
    outcomes[0]!.status === 'fulfilled' ? { version: '2', count: 1 } : { version: '1', count: 0 },
  );
});
it('expired/forged credentials fail and token replacement is forbidden', async () => {
  const g = await guest(),
    db = isolated.database.db;
  await expect(
    sql`update cart.carts set public_token_hash=${hashToken('forged')} where id=${g.cart.id}`.execute(
      db,
    ),
  ).rejects.toMatchObject({ code: '23514' });
  await sql`update cart.carts set expires_at=clock_timestamp()-interval '1 second' where id=${g.cart.id}`.execute(
    db,
  );
  for (const token of [g.token, 'a'.repeat(43), g.cart.id])
    await expect(getGuestCart(db, token)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    addGuestCartLine(db, {
      token: g.token,
      variantId: fixture.variantId,
      quantity: '1',
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('expiry during a row-lock wait cannot retain transaction-start authority', async () => {
  const g = await guest(),
    db = isolated.database.db;
  await sql`update cart.carts set expires_at=clock_timestamp()+interval '1 second' where id=${g.cart.id}`.execute(
    db,
  );
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const held = db.transaction().execute(async (tx) => {
    await sql`select id from cart.carts where id=${g.cart.id} for update`.execute(tx);
    entered();
    await barrier;
    // Let the unchanged row expire after the contender evaluated its WHERE predicate.
    await sql`select pg_sleep(greatest(0,extract(epoch from expires_at-clock_timestamp())+0.02))
      from cart.carts where id=${g.cart.id}`.execute(tx);
  });
  await ready;
  const mutation = addGuestCartLine(db, {
    token: g.token,
    variantId: fixture.variantId,
    quantity: '1',
    expectedVersion: 1,
  });
  // Release only after PostgreSQL observes the competing Cart lock wait.
  for (let n = 0; n < 100; n++) {
    const waits = await sql<{
      waiting: boolean;
    }>`select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()) waiting`.execute(
      db,
    );
    if (waits.rows[0]!.waiting) break;
    if (n === 99) throw new Error('Mutation never reached lock barrier');
    await new Promise((r) => setTimeout(r, 10));
  }
  release();
  await held;
  await expect(mutation).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('pre-cutover insert shape fails closed instead of creating accepted authority', async () => {
  await expect(
    sql`insert into cart.carts(organization_id,public_token_hash,currency_code,expires_at) values(${fixture.organizationId},${hashToken(crypto.randomUUID())},'BDT',now()+interval '1 day')`.execute(
      isolated.database.db,
    ),
  ).rejects.toMatchObject({ code: '23514' });
});
