import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrationProvider } from '../migrations/index.js';
import { runMigrations } from '../migrate.js';
import { isolatedCartDatabase, cartFixture } from '../testing/cart-fixture.js';
import { checkoutUpgradeCases } from './upgrade-cases.js';
import { createCheckoutGuestSession } from './authority.js';
import { createCheckoutDraft, getCheckoutDraft } from './commands.js';
import type { CheckoutAuthority } from './types.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let f: Awaited<ReturnType<typeof cartFixture>>;
describe('Checkout additive migration and database invariants', () => {
  beforeAll(async () => {
    isolation = await isolatedCartDatabase();
    const migrator = new Migrator({ db: isolation.database.db, provider: migrationProvider });
    const previous = await migrator.migrateTo('3218_cart_observations');
    if (previous.error) throw previous.error;
    f = await cartFixture(isolation.database);
    await checkoutUpgradeCases['3219_checkout_foundation']!.before(
      isolation.database.db,
      f.organizationId,
    );
    const result = await runMigrations(isolation.database.db);
    expect(result.executed).toEqual(['3219_checkout_foundation', '3220_checkout_delivery']);
    await checkoutUpgradeCases['3219_checkout_foundation']!.after(
      isolation.database.db,
      f.organizationId,
    );
  }, 60000);
  afterAll(async () => {
    if (isolation) await isolation.close();
  });
  it('enforces owner/source/revision/quantity and tenant foreign keys without changing legacy Orders', async () => {
    const db = isolation.database.db;
    const context = { organizationId: f.organizationId, currency: 'BDT' };
    const guest = await createCheckoutGuestSession(db, context);
    const owner: CheckoutAuthority = {
      kind: 'GUEST',
      organizationId: f.organizationId,
      sessionId: guest.session.id,
      token: guest.token,
    };
    const draft = await createCheckoutDraft(
      db,
      context,
      owner,
      { source: { kind: 'BUY_NOW', variantId: f.variantId, quantity: '1' } },
      crypto.randomUUID(),
    );
    await expect(
      sql`update orders.checkout_drafts set guest_session_id=null where id=${draft.id}`.execute(db),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`update orders.checkout_drafts set source_kind='CART',source_cart_id=null where id=${draft.id}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`update orders.checkout_drafts set revision=0 where id=${draft.id}`.execute(db),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`update orders.checkout_draft_lines set quantity=100 where draft_id=${draft.id}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const other = await cartFixture(isolation.database);
    await expect(
      sql`update orders.checkout_draft_lines set variant_id=${other.variantId} where draft_id=${draft.id}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect((await getCheckoutDraft(db, owner, draft.id)).revision).toBe('1');
    await sql`update orders.checkout_drafts set revision=9007199254740993 where id=${draft.id}`.execute(
      db,
    );
    expect((await getCheckoutDraft(db, owner, draft.id)).revision).toBe('9007199254740993');
    expect((await sql`select id from orders.orders`.execute(db)).rows).toHaveLength(1);
  });
  it('rolls back an initiation whose response/receipt write fails and then safely retries the same key', async () => {
    const db = isolation.database.db,
      context = { organizationId: f.organizationId, currency: 'BDT' };
    const guest = await createCheckoutGuestSession(db, context);
    const owner: CheckoutAuthority = {
      kind: 'GUEST',
      organizationId: f.organizationId,
      sessionId: guest.session.id,
      token: guest.token,
    };
    await sql`create function orders.checkout_test_fail_receipt() returns trigger language plpgsql as $$ begin
      if new.operation_type='checkout.foundation.initiate' and new.status='SUCCEEDED' then raise exception 'synthetic receipt failure'; end if;return new;end $$;
      create trigger checkout_test_receipt before update on platform.idempotency_records for each row execute function orders.checkout_test_fail_receipt()`.execute(
      db,
    );
    const key = crypto.randomUUID(),
      body = { source: { kind: 'BUY_NOW' as const, variantId: f.variantId, quantity: '1' } };
    try {
      await expect(createCheckoutDraft(db, context, owner, body, key)).rejects.toThrow(
        'synthetic receipt failure',
      );
    } finally {
      await sql`drop trigger checkout_test_receipt on platform.idempotency_records; drop function orders.checkout_test_fail_receipt()`.execute(
        db,
      );
    }
    expect(
      (
        await sql`select id from orders.checkout_drafts where guest_session_id=${owner.sessionId}`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(0);
    const retry = await createCheckoutDraft(db, context, owner, body, key);
    expect((await createCheckoutDraft(db, context, owner, body, key)).id).toBe(retry.id);
  });
});
