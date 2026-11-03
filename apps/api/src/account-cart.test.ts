import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { parseConfig } from '@maevelle/config';
import type {
  AccountCartViewDto,
  CartMergePreviewDto,
  GuestCartViewDto,
} from '@maevelle/contracts';
import { sql } from '@maevelle/database';
import {
  linkCustomerAccount,
  mergeCustomers,
  unlinkCustomerAccount,
} from '@maevelle/database/customers';
import { adjustInventory } from '@maevelle/database/inventory';
import { runMigrations } from '@maevelle/database/migrate';
import { createPriceDefinition, setCurrentVariantPrice } from '@maevelle/database/pricing';
import { createCouponCode, createPromotion } from '@maevelle/database/promotions';
import { cartFixture, isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { registerCartRoutes } from './routes/cart.js';
import { registerShopperAuthRoutes } from './routes/shopper-auth.js';

const origin = 'http://localhost:3001';
const guestBase = '/storefront/v1/carts';
const accountBase = guestBase + '/account';
let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let fixture: Awaited<ReturnType<typeof cartFixture>>;
let app: FastifyInstance;
let a: string, b: string;
let firstShopperEmail: string;
const password = 'synthetic-account-cart-password';
let variant2: string;
let locationId: string;
const mailbox: string[] = [];

function inject(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  cookie = '',
  payload?: object,
  key = crypto.randomUUID(),
  requestOrigin = origin,
) {
  return app.inject({
    method,
    url,
    headers: {
      cookie,
      origin: requestOrigin,
      'idempotency-key': key,
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { payload } : {}),
  });
}

function responseCookie(response: { headers: Record<string, unknown> }): string {
  return String(response.headers['set-cookie']).split(';')[0]!;
}

async function shopper() {
  const email = `account-cart-${crypto.randomUUID()}@example.test`;
  const signup = await inject('POST', '/shopper-auth/sign-up/email', '', {
    name: 'Synthetic',
    email,
    password,
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const link = new URL(mailbox.at(-1)!.match(/https?:\/\/\S+/)![0]);
  expect([200, 302]).toContain((await inject('GET', link.pathname + link.search)).statusCode);
  return { email, cookie: await signIn(email) };
}

async function signIn(email: string) {
  const login = await inject('POST', '/shopper-auth/sign-in/email', '', { email, password });
  expect(login.statusCode, login.body).toBe(200);
  return responseCookie(login);
}

beforeAll(async () => {
  isolation = await isolatedCartDatabase();
  const db = isolation.database.db;
  await runMigrations(db);
  fixture = await cartFixture(isolation.database);
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: isolation.url,
    TEST_DATABASE_URL: isolation.url,
    BETTER_AUTH_SECRET: 'synthetic-account-cart-auth-secret-32-characters',
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 67).toString('base64'),
    STOREFRONT_ORGANIZATION_CODE: fixture.code,
    STOREFRONT_BASE_URL: origin,
    BETTER_AUTH_URL: 'http://localhost:3002',
    AUTH_TRUSTED_ORIGINS: origin,
  });
  app = Fastify({ logger: false });
  const resolver = registerShopperAuthRoutes(app, config, isolation.database, async (m) => {
    mailbox.push(m.text);
  });
  registerCartRoutes(app, isolation.database, config, resolver);
  await app.ready();
  const { organizationId, actorId } = fixture;
  const product = await sql<{ id: string }>`
    insert into catalog.products (organization_id, product_type_id,handle,title,status,publication_status,published_at)
    select organization_id,product_type_id,'second-account-cart-product','Second synthetic clip','ACTIVE','PUBLISHED',now()
    from catalog.products where id=${fixture.productId} returning id`.execute(db);
  variant2 = (
    await sql<{ id: string }>`
    insert into catalog.product_variants (organization_id,product_id,sku,sku_normalized,option_signature)
    values (${organizationId},${product.rows[0]!.id},'ACCOUNT-CART-2','ACCOUNT-CART-2','default') returning id
  `.execute(db)
  ).rows[0]!.id;
  locationId = (
    await sql<{ id: string }>`
    select id from warehouse.locations where organization_id=${organizationId} and code='TEST'
  `.execute(db)
  ).rows[0]!.id;
  await adjustInventory(db, {
    organizationId,
    actorId,
    variantId: variant2,
    locationId,
    condition: 'SELLABLE',
    quantityDelta: '150',
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
  await createPriceDefinition(db, {
    organizationId,
    actorId,
    variantId: variant2,
    currency: 'BDT',
    amount: '25.0000',
  });
  for (const code of ['ACCOUNT03A', 'GUEST03A']) {
    const promotion = await createPromotion(db, {
      organizationId,
      actorId,
      name: code,
      promotionType: 'COUPON',
      benefitType: 'PERCENTAGE_DISCOUNT',
      benefitValue: '10',
      combinability: 'EXCLUSIVE',
    });
    await createCouponCode(db, { organizationId, actorId, promotionId: promotion.id, code });
  }
}, 30_000);

beforeEach(async () => {
  const first = await shopper();
  firstShopperEmail = first.email;
  a = first.cookie;
  b = (await shopper()).cookie;
});

async function establish(cookie: string): Promise<AccountCartViewDto> {
  const response = await inject('POST', accountBase, cookie, {});
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data;
}

afterAll(async () => {
  await app?.close();
  await isolation?.close();
});

async function current(cookie: string): Promise<AccountCartViewDto> {
  const response = await inject('GET', accountBase + '/current', cookie);
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data;
}

async function add(
  base: string,
  cookie: string,
  cart: GuestCartViewDto | AccountCartViewDto,
  variantId: string,
  quantity: string,
) {
  const response = await inject('POST', base + '/current/lines', cookie, {
    ownerContext: cart.ownerContext,
    version: cart.version,
    variantId,
    quantity,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data;
}

async function guest(variantId = fixture.variantId, quantity = '1') {
  const created = await inject('POST', guestBase, '', {});
  expect(created.statusCode, created.body).toBe(201);
  const cookie = responseCookie(created);
  return {
    cookie,
    cart: (await add(
      guestBase,
      cookie,
      created.json().data,
      variantId,
      quantity,
    )) as GuestCartViewDto,
  };
}

function select(account: AccountCartViewDto, guestCart: GuestCartViewDto) {
  return {
    ownerContext: account.ownerContext,
    guestCartId: guestCart.id,
    guestOwnerContext: guestCart.ownerContext,
  };
}

async function preview(
  account: AccountCartViewDto,
  guestCart: GuestCartViewDto,
  cookies: string,
): Promise<CartMergePreviewDto> {
  const response = await inject(
    'POST',
    accountBase + '/merge/preview',
    cookies,
    select(account, guestCart),
  );
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data;
}

function approval(review: CartMergePreviewDto) {
  return {
    ...review.selection,
    reviewFingerprint: review.reviewFingerprint,
    version: Number(review.accountRevision),
  };
}

it('establishes one persistent account Cart, scopes edits, and rejects stale device intent', async () => {
  expect((await inject('GET', accountBase + '/current', a)).statusCode).toBe(404);
  const device = await signIn(firstShopperEmail);
  expect(device).not.toBe(a);
  const creations = await Promise.all([
    inject('POST', accountBase, a, {}),
    inject('POST', accountBase, device, {}),
  ]);
  for (const response of creations) expect(response.statusCode, response.body).toBe(200);
  const original = await current(a);
  expect(creations.map((response) => response.json().data.id)).toEqual([original.id, original.id]);
  expect(original.expiresAt).toBeNull();
  expect(creations[0]!.headers['set-cookie']).toBeUndefined();
  const other = await inject('POST', accountBase, b, {});
  expect(other.statusCode, other.body).toBe(200);
  expect(other.json().data.id).not.toBe(original.id);
  const attempts = await Promise.all(
    ['1', '2'].map((quantity, index) =>
      inject('POST', accountBase + '/current/lines', index === 0 ? a : device, {
        ownerContext: original.ownerContext,
        version: original.version,
        variantId: fixture.variantId,
        quantity,
      }),
    ),
  );
  expect(attempts.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(attempts.find((r) => r.statusCode === 409)!.json().error.code).toBe('STALE_VERSION');
  const updated = await current(a);
  const lineId = updated.lines[0]!.id;
  const forbidden = await inject('DELETE', accountBase + '/current/lines/' + lineId, b, {
    ownerContext: other.json().data.ownerContext,
    version: other.json().data.version,
  });
  expect(forbidden.statusCode).toBe(404);
  expect(
    (
      await inject(
        'POST',
        accountBase + '/current/lines',
        a,
        {
          ownerContext: updated.ownerContext,
          version: updated.version,
          variantId: fixture.variantId,
          quantity: '1',
        },
        crypto.randomUUID(),
        'https://other.test',
      )
    ).statusCode,
  ).toBe(403);
  const changed = await inject('PATCH', accountBase + '/current/lines/' + lineId, a, {
    ownerContext: updated.ownerContext,
    version: updated.version,
    quantity: '2',
  });
  expect(changed.statusCode, changed.body).toBe(200);
  expect(Number(changed.json().data.lines[0].quantity)).toBe(2);
  const persisted = await sql<{ count: number }>`
    select count(*)::int count from cart.carts where id=${original.id}
      and credential_state='ACCOUNT' and public_token_hash is null and expires_at is null
  `.execute(isolation.database.db);
  expect(persisted.rows[0]!.count).toBe(1);
});

it('reviews both owners, consolidates and moves lines, and replays exactly after revocation', async () => {
  await establish(b);
  const { cookie, cart: first } = await guest();
  let account = await add(accountBase, a, await establish(a), fixture.variantId, '2');
  const guestCart = (await add(guestBase, cookie, first, variant2, '2')) as GuestCartViewDto;
  for (const [base, auth, view, couponCode] of [
    [accountBase, a, account, 'ACCOUNT03A'],
    [guestBase, cookie, guestCart, 'GUEST03A'],
  ] as const) {
    const coupon = await inject('POST', base + '/current/coupons', auth, {
      ownerContext: view.ownerContext,
      version: view.version,
      couponCode,
    });
    expect(coupon.statusCode, coupon.body).toBe(200);
  }
  account = await current(a);
  const other = await guest();
  const combined = `${a}; ${cookie}; ${other.cookie}`;
  const listed = await inject('GET', accountBase + '/merge/guests', combined);
  expect(listed.statusCode, listed.body).toBe(200);
  expect(listed.json().data).toHaveLength(2);
  expect(listed.headers['cache-control']).toBe('private, no-store');
  const noCookie = await inject(
    'POST',
    accountBase + '/merge/preview',
    a,
    select(account, guestCart),
  );
  expect(noCookie.statusCode).toBe(404);
  const wrongSlot = `${a}; ${cookie.split('=')[0]}=${other.cookie.split('=')[1]}`;
  expect(
    (await inject('POST', accountBase + '/merge/preview', wrongSlot, select(account, guestCart)))
      .statusCode,
  ).toBe(404);
  const review = await preview(account, guestCart, combined);
  expect(review.status).toBe('READY');
  expect(review.guest.appliedCoupons).toEqual(['GUEST03A']);
  expect(review.projected?.appliedCoupons).toEqual(['ACCOUNT03A']);
  expect(review.projected?.discountTotal).toBe('35.0000');
  expect(review.lines.find((line) => line.variantId === fixture.variantId)).toMatchObject({
    survivingLineId: account.lines[0]!.id,
    accountQuantity: 2,
    guestQuantity: 1,
    requestedQuantity: 3,
  });
  expect((await current(a)).version).toBe(account.version);
  const key = crypto.randomUUID();
  const body = approval(review);
  const responses = await Promise.all([
    inject('POST', accountBase + '/merge/commit', combined, body, key),
    inject('POST', accountBase + '/merge/commit', combined, body, key),
  ]);
  for (const response of responses) expect(response.statusCode, response.body).toBe(200);
  const [firstOutcome, secondOutcome] = responses.map((response) => response.json().data.outcome);
  expect([firstOutcome.replayed, secondOutcome.replayed].sort()).toEqual([false, true]);
  expect(firstOutcome.receiptId).toBe(secondOutcome.receiptId);
  expect(firstOutcome.eventIds).toHaveLength(1);
  expect(responses[0]!.headers['set-cookie']).toContain('Max-Age=0');
  const merged = await current(a);
  expect(merged.version).toBe(account.version + 1);
  expect(merged.lines.map((line) => line.id).sort()).toEqual(
    review.projected!.lines.map((line) => line.id).sort(),
  );
  expect((await inject('GET', guestBase + '/current', cookie)).statusCode).toBe(401);
  expect((await inject('GET', guestBase + '/current', other.cookie)).statusCode).toBe(200);
  const removed = await inject('DELETE', accountBase + '/current/coupons/ACCOUNT03A', a, {
    ownerContext: merged.ownerContext,
    version: merged.version,
  });
  expect(removed.statusCode, removed.body).toBe(200);
  const replay = await inject('POST', accountBase + '/merge/commit', a, body, key);
  expect(replay.statusCode, replay.body).toBe(200);
  expect(replay.json().data.version).toBe(merged.version + 1);
  expect(replay.json().data.outcome).toEqual({ ...firstOutcome, replayed: true });
  expect(
    (await inject('POST', accountBase + '/merge/commit', b, body, key)).json().error.code,
  ).toBe('OWNER_CHANGED');
  expect(
    (
      await inject(
        'POST',
        accountBase + '/merge/commit',
        a,
        { ...body, guestCartId: other.cart.id },
        key,
      )
    ).json().error.code,
  ).toBe('IDEMPOTENCY_CONFLICT');
  const fact = await sql<{
    status: string;
    credential_state: string;
    merged_into_id: string;
    events: number;
  }>`
    select status,credential_state,merged_into_id,
      (select count(*)::int from platform.outbox_events where event_id=${firstOutcome.eventIds[0]}) events
    from cart.carts where id=${guestCart.id}`.execute(isolation.database.db);
  expect(fact.rows[0]).toEqual({
    status: 'MERGED',
    credential_state: 'RETIRED',
    merged_into_id: merged.id,
    events: 1,
  });
});

it('rejects stale commerce, rolls back partial writes, and allows only one destination account', async () => {
  const { cookie, cart } = await guest(variant2, '2');
  const account = await add(accountBase, a, await establish(a), variant2, '1');
  await establish(b);
  const original = await preview(account, cart, `${a}; ${cookie}`);
  const db = isolation.database.db;
  await setCurrentVariantPrice(db, {
    organizationId: fixture.organizationId,
    actorId: fixture.actorId,
    variantId: variant2,
    currency: 'BDT',
    amount: '30.0000',
  });
  const stale = await inject(
    'POST',
    accountBase + '/merge/commit',
    `${a}; ${cookie}`,
    approval(original),
  );
  expect(stale.statusCode).toBe(409);
  expect(stale.json().error.code).toBe('MERGE_STALE');
  const reviewed = await preview(account, cart, `${a}; ${cookie}`);
  const key = crypto.randomUUID();
  await sql`
    create function cart.fail_merge_test() returns trigger language plpgsql as $$ begin
      if new.status='MERGED' then perform pg_advisory_xact_lock(30301); end if;
      return new;
    end $$;
    create trigger fail_merge_test before update on cart.carts for each row execute function cart.fail_merge_test()
  `.execute(db);
  try {
    const interrupted = await db.transaction().execute(async (blocker) => {
      await sql`select pg_advisory_xact_lock(30301)`.execute(blocker);
      const pending = inject(
        'POST',
        accountBase + '/merge/commit',
        `${a}; ${cookie}`,
        approval(reviewed),
        key,
      ).then((response) => response);
      await vi.waitFor(
        async () => {
          const waiting = await sql<{ terminated: boolean }>`
          select pg_terminate_backend(activity.pid) terminated
          from pg_stat_activity activity join pg_locks lock on lock.pid=activity.pid
          where activity.datname=current_database() and lock.locktype='advisory'
            and not lock.granted and lock.classid=0 and lock.objid=30301
        `.execute(blocker);
          expect(waiting.rows[0]?.terminated).toBe(true);
        },
        { timeout: 1500, interval: 20 },
      );
      return { pending };
    });
    const failed = await interrupted.pending;
    expect(failed.statusCode, failed.body).toBe(503);
    expect((await current(a)).version).toBe(account.version);
    expect((await inject('GET', guestBase + '/current', cookie)).statusCode).toBe(200);
    const receipt =
      await sql`select id from platform.idempotency_records where idempotency_key=${key}`.execute(
        db,
      );
    expect(receipt.rows).toEqual([]);
  } finally {
    await sql`drop trigger fail_merge_test on cart.carts; drop function cart.fail_merge_test()`.execute(
      db,
    );
  }
  const rival = await preview(await current(b), cart, `${b}; ${cookie}`);
  const results = await Promise.all([
    inject('POST', accountBase + '/merge/commit', `${a}; ${cookie}`, approval(reviewed), key),
    inject('POST', accountBase + '/merge/commit', `${b}; ${cookie}`, approval(rival)),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
});

it('preserves over-cap guest intent and refuses invalid shopper sessions', async () => {
  let account = await add(accountBase, b, await establish(b), fixture.variantId, '1');
  const clear = await inject('DELETE', accountBase + '/current', b, {
    ownerContext: account.ownerContext,
    version: account.version,
  });
  expect(clear.statusCode, clear.body).toBe(200);
  account = await add(accountBase, b, clear.json().data, variant2, '75');
  const { cart, cookie } = await guest(variant2, '30');
  const review = await preview(account, cart, `${b}; ${cookie}`);
  expect(review.status).toBe('REVIEW_REQUIRED');
  expect(review.blockers).toEqual(['QUANTITY_LIMIT']);
  expect(review.lines[0]!.requestedQuantity).toBe(105);
  expect(review.projected).toBeNull();
  const result = await inject(
    'POST',
    accountBase + '/merge/commit',
    `${b}; ${cookie}`,
    approval(review),
  );
  expect(result.json().error.code).toBe('MERGE_REVIEW_REQUIRED');
  expect((await inject('GET', guestBase + '/current', cookie)).json().data.version).toBe(
    cart.version,
  );
  expect((await inject('GET', accountBase + '/current', cookie)).statusCode).toBe(401);
  const logout = await inject('POST', '/shopper-auth/sign-out', b, {});
  expect(logout.statusCode, logout.body).toBe(200);
  expect((await inject('GET', accountBase + '/current', `${b}; ${cookie}`)).json().error.code).toBe(
    'SESSION_EXPIRED',
  );
});

it('requires new review after guest and account edits and serializes account edits against merge', async () => {
  const { cookie, cart } = await guest();
  const account = await establish(a);
  const combined = `${a}; ${cookie}`;
  const oldGuest = await preview(account, cart, combined);
  const editedGuest = await add(guestBase, cookie, cart, variant2, '1');
  const rejectedGuest = await inject(
    'POST',
    accountBase + '/merge/commit',
    combined,
    approval(oldGuest),
  );
  expect(rejectedGuest.json().error.code).toBe('MERGE_STALE');

  const oldAccount = await preview(account, editedGuest, combined);
  const editedAccount = await add(accountBase, a, account, variant2, '1');
  const rejectedAccount = await inject(
    'POST',
    accountBase + '/merge/commit',
    combined,
    approval(oldAccount),
  );
  expect(rejectedAccount.json().error.code).toBe('STALE_VERSION');

  const fresh = await preview(editedAccount, editedGuest, combined);
  const results = await Promise.all([
    inject('POST', accountBase + '/merge/commit', combined, approval(fresh)),
    inject('PATCH', accountBase + '/current/lines/' + editedAccount.lines[0].id, a, {
      ownerContext: editedAccount.ownerContext,
      version: editedAccount.version,
      quantity: '3',
    }),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(results.find((r) => r.statusCode === 409)!.json().error.code).toBe('STALE_VERSION');
  expect((await current(a)).version).toBe(editedAccount.version + 1);
});

it('binds guest and account authority to the tenant and preserves unavailable guest intent', async () => {
  const account = await establish(a);
  const foreign = await cartFixture(isolation.database);
  const { createGuestCart } = await import('@maevelle/database/cart');
  const foreignCart = await createGuestCart(isolation.database.db, {
    organizationId: foreign.organizationId,
    currency: 'BDT',
  });
  const foreignSlot = `maevelle_cart_${foreignCart.cart.id.replaceAll('-', '')}=${foreignCart.token}`;
  const foreignPreview = await inject(
    'POST',
    accountBase + '/merge/preview',
    `${a}; ${foreignSlot}`,
    select(account, foreignCart.cart),
  );
  expect(foreignPreview.statusCode).toBe(404);

  const { cookie, cart } = await guest();
  const db = isolation.database.db;
  const before = await preview(account, cart, `${a}; ${cookie}`);
  await sql`insert into catalog.product_option_axes (organization_id,product_id,code,name)
    values (${fixture.organizationId},${fixture.productId},'test-axis','Test option')`.execute(db);
  try {
    const stale = await inject(
      'POST',
      accountBase + '/merge/commit',
      `${a}; ${cookie}`,
      approval(before),
    );
    expect(stale.json().error.code).toBe('MERGE_STALE');
    const invalid = await preview(account, cart, `${a}; ${cookie}`);
    expect(invalid.status).toBe('READY');
    expect(invalid.projected?.commerceReview?.issues[0]?.code).toBe('INVALID_CONFIGURATION');
    expect(invalid.projected?.lines[0]).toMatchObject({ sku: '', unitPrice: null, options: [] });
    const response = await inject(
      'POST',
      accountBase + '/merge/commit',
      `${a}; ${cookie}`,
      approval(invalid),
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.lines[0]).toMatchObject({
      id: cart.lines[0]!.id,
      availability: 'UNAVAILABLE',
    });
  } finally {
    await sql`delete from catalog.product_option_axes where product_id=${fixture.productId} and code='test-axis'`.execute(
      db,
    );
  }
});

it('fences CRM account replacement while allowing the original shopper to regain access', async () => {
  const cart = await add(accountBase, a, await establish(a), fixture.variantId, '1');
  const { organizationId, actorId } = fixture;
  const db = isolation.database.db;
  const owner = (
    await sql<{ account_id: string; customer_id: string; user_id: string; version: string }>`
    select cart.owner_account_id account_id, cart.customer_id, cart.owner_user_id user_id, customer.version::text
    from cart.carts cart join customers.customers customer on customer.id=cart.customer_id
    where cart.id=${cart.id}
  `.execute(db)
  ).rows[0]!;
  const target = (
    await sql<{ id: string; version: string }>`
    insert into customers.customers(organization_id,customer_number,display_name)
    values (${organizationId},'ACCOUNT-CART-CRM-TARGET','Synthetic CRM target') returning id,version::text
  `.execute(db)
  ).rows[0]!;
  await expect(
    mergeCustomers(db, {
      organizationId,
      actorId,
      sourceCustomerId: owner.customer_id,
      targetCustomerId: target.id,
      sourceExpectedVersion: Number(owner.version),
      targetExpectedVersion: Number(target.version),
      reason: 'Synthetic duplicate review',
      idempotencyKey: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({
    code: 'CONFLICT',
    message: 'Resolve account-owned Carts before merging these customers.',
  });

  await unlinkCustomerAccount(db, {
    organizationId,
    actorId,
    customerId: owner.customer_id,
    reason: 'Synthetic unlink',
  });
  expect((await inject('GET', accountBase + '/current', a)).statusCode).toBe(503);
  const newUser = (
    await sql<{ id: string }>`
    insert into iam.users(name,email,email_normalized,email_verified)
    values ('Synthetic replacement','replacement-cart@example.test','replacement-cart@example.test',true) returning id
  `.execute(db)
  ).rows[0]!;
  const link = {
    organizationId,
    actorId,
    customerId: owner.customer_id,
    linkType: 'MANUAL_CLAIM' as const,
  };
  await expect(linkCustomerAccount(db, { ...link, userId: newUser.id })).rejects.toMatchObject({
    code: 'CONFLICT',
    message: 'An Account Cart is bound to the previous shopper.',
  });
  await expect(
    sql`update customers.customer_accounts set user_id=${newUser.id}
    where id=${owner.account_id}`.execute(db),
  ).rejects.toMatchObject({ code: '23503', constraint: 'cart_account_mapping_fk' });
  await linkCustomerAccount(db, { ...link, userId: owner.user_id });
  const restored = await current(a);
  expect(restored.id).toBe(cart.id);
  expect(restored.lines).toEqual(cart.lines);
});
