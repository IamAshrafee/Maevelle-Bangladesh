import { orderView } from '../orders/queries.js';
import { processCommerceAnalyticsOutbox } from '../analytics/commerce/processing.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from '../index.js';
import { postgresCommitFault } from '../testing/postgres-wire-fault.js';
import { setTimeout as delay } from 'node:timers/promises';
import { runMigrations } from '../migrate.js';
import { isolatedCartDatabase, cartFixture } from '../testing/cart-fixture.js';
import { createCheckoutGuestSession, revokeCheckoutGuestSession } from './authority.js';
import { createCheckoutDraft, getCheckoutDraft } from './commands.js';
import { updateCheckoutDelivery } from './delivery.js';
import { acknowledgeCheckoutQuote, createCheckoutQuote } from './quotes.js';
import {
  checkoutPlacementEngine,
  placeReviewedCheckout,
  reviewCheckoutFinalTerms,
} from './placement.js';
import { getCommittedCheckoutOrder } from './placement-status.js';
import {
  checkoutOrderPaymentEngine,
  getCheckoutOrderPayment,
  recoverCheckoutPaymentClaim,
  submitCheckoutPaymentClaim,
} from './order-payment.js';
import { listManualClaimQueue, reviewManualClaim } from '../payments/review-claims.js';
import { verifyManualPayment } from '../payments/manual-receipts.js';
import { checkoutGuestOrderCredential } from './guest-order-credential.js';
import {
  createGuestCart,
  addGuestCartLine,
  establishAccountCart,
  addCartLine,
  setGuestCartLineQuantity,
} from '../cart.js';
import { resolveOrEnrollShopper } from '../shopper.js';
import {
  lockShopperSession,
  setShopperStorageValue,
  revokeShopperStorageValue,
} from '../shopper-session-fence.js';
import { createCouponCode, createPromotion } from '../promotions.js';
import { configurePaymentMethod } from '../payments.js';
import { adjustInventory } from '../inventory.js';
import { processExpiredPaymentOrders } from '../orders/lifecycle.js';
import { setCurrentVariantPrice } from '../pricing.js';
import { setOperationalControl } from '../platform.js';
import { syntheticWholePolicy } from '../testing/whole-taka-policy.js';
import { rebuildAnalyticsProjections } from '../analytics.js';
import type { CheckoutAuthority } from './types.js';
import type { PlacementPolicy } from './final-terms.js';
import type { CheckoutPlacementMethod } from '@maevelle/contracts';

let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let fixture: Awaited<ReturnType<typeof cartFixture>>;
let area: string, tariff: string;
let mobileSequence = 0;
const db = () => isolated.database.db;
const key = () => crypto.randomUUID();
const context = () => ({ organizationId: fixture.organizationId, currency: 'BDT' });
const codPolicy: PlacementPolicy = async (_tx, { organizationId, method, evaluation }) => {
  // Bound to this test's disposable organization, location, method and tariff.
  expect(organizationId).toBe(fixture.organizationId);
  expect(method).toBe('COD');
  expect(evaluation.delivery.geographyNodeId).toBe(area);
  expect(evaluation.tariff.ruleId).toBe(tariff);
  return {
    revision: 'test-cod-v1',
    taxTreatment: 'SYNTHETIC_ZERO',
    tax: '0',
    paymentFees: '0',
    rounding: 'EXACT_BDT_2',
    payment: { method: 'COD' },
  };
};
const engine = checkoutPlacementEngine(codPolicy);

async function guest(): Promise<CheckoutAuthority> {
  const g = await createCheckoutGuestSession(db(), context());
  return { kind: 'GUEST', ...context(), sessionId: g.session.id, token: g.token };
}
async function account(): Promise<Extract<CheckoutAuthority, { kind: 'ACCOUNT' }>> {
  const userId = key(),
    email = `${userId}@example.test`;
  await sql`insert into iam.users(id,name,email,email_normalized,email_verified) values
    (${userId},'Synthetic account',${email},${email},true)`.execute(db());
  const shopper = await resolveOrEnrollShopper(db(), fixture.organizationId, userId);
  const sessionKeyHash = key();
  await setShopperStorageValue(
    db(),
    sessionKeyHash,
    Buffer.from('synthetic'),
    new Date(Date.now() + 600_000),
  );
  return { ...shopper!, kind: 'ACCOUNT', sessionKeyHash };
}
async function sourceCart(owner: CheckoutAuthority) {
  if (owner.kind === 'ACCOUNT') {
    const authority = { ...owner, currency: 'BDT' };
    const initial = await establishAccountCart(db(), authority);
    const cart = await addCartLine(db(), {
      account: authority,
      ownerContext: initial.ownerContext,
      variantId: fixture.variantId,
      quantity: '1',
      expectedVersion: initial.version,
      idempotencyKey: key(),
    });
    return { id: cart.id, revision: cart.intentRevision, version: cart.version, token: undefined };
  }
  const initial = await createGuestCart(db(), context());
  const cart = await addGuestCartLine(db(), {
    token: initial.token,
    variantId: fixture.variantId,
    quantity: '1',
    expectedVersion: initial.cart.version,
    idempotencyKey: key(),
  });
  return {
    id: cart.id,
    revision: cart.intentRevision,
    version: cart.version,
    token: initial.token,
  };
}

async function growSyntheticCart(cartId: string, size: number) {
  const org = fixture.organizationId;
  await sql`with products as (
      insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
      select ${org},p.product_type_id,'fixture-'||uuidv7()::text,'Synthetic accessory','ACTIVE','PUBLISHED',now()
      from catalog.products p cross join generate_series(1,${size - 1}::int)
      where p.organization_id=${org} and p.id=${fixture.productId} returning id,handle
    ), variants as (
      insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
      select ${org},id,upper(handle),upper(handle),'default' from products returning id
    ), items as (
      insert into inventory.inventory_items(organization_id,variant_id)
      select ${org},id from variants returning id
    ), levels as (
      insert into inventory.inventory_levels(organization_id,inventory_item_id,location_id,sellable_quantity)
      select ${org},i.id,w.id,1 from items i join warehouse.locations w on w.organization_id=${org} and w.code='TEST'
      returning inventory_item_id,location_id
    ), conditions as (
      insert into inventory.inventory_level_conditions(organization_id,inventory_item_id,location_id,condition_code,quantity)
      select ${org},inventory_item_id,location_id,'SELLABLE',1 from levels
    ), prices as (
      insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount,effective_from)
      select ${org},id,'BDT',10,now()-interval '1 minute' from variants
    )
    insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity)
    select ${org},${cartId},id,1 from variants`.execute(db());
}
async function draft(
  owner: CheckoutAuthority,
  cart?: Awaited<ReturnType<typeof sourceCart>>,
  couponCodes?: string[],
  method: CheckoutPlacementMethod = 'COD',
  buyNowQuantity = '1',
) {
  const root = await createCheckoutDraft(
    db(),
    context(),
    owner,
    {
      source: cart
        ? { kind: 'CART', cartId: cart.id, cartRevision: cart.revision }
        : { kind: 'BUY_NOW', variantId: fixture.variantId, quantity: buyNowQuantity },
    },
    key(),
    cart?.token,
  );
  const delivery = await updateCheckoutDelivery(
    db(),
    owner,
    root.id,
    {
      revision: root.revision,
      delivery: {
        recipientName: 'Synthetic buyer',
        mobile: `017${String(++mobileSequence).padStart(8, '0')}`,
        geographyNodeId: area,
        addressLine1: 'Synthetic delivery',
      },
    },
    key(),
  );
  const quote = await createCheckoutQuote(
    db(),
    owner,
    root.id,
    {
      revision: delivery.revision,
      ...(couponCodes ? { couponCodes } : {}),
    },
    key(),
    cart?.token,
  );
  const review = {
    revision: quote.draftRevision,
    quoteId: quote.id,
    quoteFingerprint: quote.fingerprint,
    method,
  };
  await acknowledgeCheckoutQuote(
    db(),
    owner,
    root.id,
    quote.id,
    {
      revision: review.revision,
      fingerprint: review.quoteFingerprint,
    },
    key(),
    cart?.token,
  );
  return { cmd: { owner, draftId: root.id, cartToken: cart?.token }, review };
}
async function ready(
  owner: CheckoutAuthority,
  cart?: Awaited<ReturnType<typeof sourceCart>>,
  couponCodes?: string[],
) {
  const { cmd, review } = await draft(owner, cart, couponCodes);
  const terms = await engine.review(db(), cmd, review);
  return { cmd, input: { ...review, finalTermsFingerprint: terms.fingerprint }, key: key() };
}
const place = (r: Awaited<ReturnType<typeof ready>>) => engine.place(db(), r.cmd, r.input, r.key);

async function effects() {
  const org = fixture.organizationId;
  return (
    await sql<Record<string, number>>`select
    (select count(*)::int from orders.orders where organization_id=${org}) orders,
    (select count(*)::int from orders.checkout_placements where organization_id=${org}) placements,
    (select count(*)::int from inventory.inventory_reservations where organization_id=${org}) reservations,
    (select count(*)::int from inventory.inventory_reservation_allocations where organization_id=${org}) allocations,
    (select count(*)::int from payments.payment_intents where organization_id=${org}) obligations,
    (select count(*)::int from payments.payments where organization_id=${org}) payments,
    (select count(*)::int from finance.finance_transactions where organization_id=${org}) finance,
    (select count(*)::int from promotions.promotion_usage where organization_id=${org}) redemptions,
    (select count(*)::int from cart.carts where organization_id=${org} and status='CONVERTED') converted,
    (select count(*)::int from audit.audit_events where organization_id=${org} and action='orders.order.placed') audit,
    (select count(*)::int from platform.outbox_events where organization_id=${org} and event_type='orders.order.placed') outbox`.execute(
      db(),
    )
  ).rows[0]!;
}
async function coupon() {
  const promotion = await createPromotion(db(), {
    ...context(),
    actorId: fixture.actorId,
    name: 'Synthetic limited coupon',
    promotionType: 'COUPON',
    combinability: 'STACKABLE',
    benefitType: 'FIXED_AMOUNT_DISCOUNT',
    benefitValue: '5',
  });
  await createCouponCode(db(), {
    ...context(),
    actorId: fixture.actorId,
    promotionId: promotion.id,
    code: 'LIMITED',
    usageLimitTotal: 1,
  });
}
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
async function expectLockWait(queryFragment: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const waiting = await sql`select 1 from pg_stat_activity where datname=current_database()
      and pid<>pg_backend_pid() and wait_event_type='Lock' and strpos(query,${queryFragment})>0`.execute(
      db(),
    );
    if (waiting.rows.length) return;
    await delay(15);
  }
  throw new Error('Expected a PostgreSQL lock wait.');
}

async function wallet(owner?: CheckoutAuthority) {
  const org = fixture.organizationId,
    maker = key(),
    reviewer = key();
  await configurePaymentMethod(db(), {
    ...context(),
    actorId: fixture.actorId,
    code: 'BKASH_MANUAL',
    name: 'Synthetic wallet',
    status: 'ACTIVE',
    displayOrder: 2,
    paymentWindowMinutes: 60,
  });
  const row = (
    await sql<{ destination: string; policy: string }>`
    with account as (
      insert into finance.financial_accounts(organization_id,account_number,name,account_type,currency_code)
      values(${org},'SYNTHETIC-WALLET','Synthetic','MOBILE_WALLET','BDT') returning id
    ), destination as (
      insert into payments.receiving_destinations(organization_id,provider,account_type,receiving_number,
        recipient_name,transfer_action,instructions,financial_account_id,state,
        provider_evidence_reference,created_by,approved_by,approved_at)
      select ${org},'BKASH','PERSONAL_RETAIL_ACCOUNT','01700000000','Synthetic recipient','MERCHANT_PAYMENT',
        'Synthetic instructions',id,'APPROVED','synthetic-only',${maker},${reviewer},now() from account returning *
    ), history as (
      insert into payments.receiving_destination_history(organization_id,destination_id,revision,snapshot,actor_id,reason)
      select organization_id,id,revision,to_jsonb(destination),${reviewer},'synthetic-only' from destination
    ), proposal as (
      insert into payments.operating_policy_proposals(organization_id,submission_minutes,review_minutes,created_by)
      values(${org},60,30,${maker}) returning id
    ), policy as (
      insert into payments.operating_policy_revisions(organization_id,submission_minutes,review_minutes,
        approval_reference,created_by,approved_by,proposal_id)
      select ${org},60,30,'synthetic-only',${maker},${reviewer},id from proposal returning id
    )
    select destination.id destination,policy.id policy from destination cross join policy`.execute(
      db(),
    )
  ).rows[0]!;
  const policy: PlacementPolicy = async (_tx, { organizationId, method, evaluation }) => {
    expect(organizationId).toBe(org);
    expect(method).toBe('BKASH_MANUAL');
    expect(evaluation.tariff.ruleId).toBe(tariff);
    return {
      revision: 'test-bkash-v1',
      taxTreatment: 'SYNTHETIC_ZERO',
      tax: '0',
      paymentFees: '0',
      rounding: 'EXACT_BDT_2',
      payment: {
        method: 'BKASH_MANUAL',
        destinationId: row.destination,
        operatingPolicyId: row.policy,
      },
    };
  };
  const w = checkoutPlacementEngine(policy);
  const r = await draft(owner ?? (await guest()), undefined, undefined, 'BKASH_MANUAL');
  const terms = await w.review(db(), r.cmd, r.review);
  return {
    ...r,
    ...row,
    key: key(),
    input: { ...r.review, finalTermsFingerprint: terms.fingerprint },
    engine: w,
    resolver: policy,
  };
}

describe('Checkout atomic placement on disposable PostgreSQL', () => {
  beforeAll(async () => {
    isolated = await isolatedCartDatabase();
    await runMigrations(db());
  }, 60000);
  afterAll(async () => {
    if (isolated) await isolated.close();
  });
  beforeEach(async () => {
    fixture = await cartFixture(isolated.database);
    await configurePaymentMethod(db(), {
      ...context(),
      actorId: fixture.actorId,
      code: 'COD',
      name: 'Synthetic COD',
      status: 'ACTIVE',
      displayOrder: 1,
    });
    const country = (
      await sql<{ id: string }>`insert into geography.nodes(node_type,canonical_name,country_code)
      values('COUNTRY',${key()},'BD') returning id`.execute(db())
    ).rows[0]!.id;
    area = (
      await sql<{ id: string }>`insert into geography.nodes(parent_id,node_type,canonical_name)
      values(${country},'DISTRICT',${key()}) returning id`.execute(db())
    ).rows[0]!.id;
    await sql`insert into delivery.delivery_methods(organization_id,code,name,method_type)
      values(${fixture.organizationId},'HOME_DELIVERY','Synthetic','HOME_DELIVERY')`.execute(db());
    tariff = (
      await sql<{
        id: string;
      }>`insert into orders.delivery_pricing_rules(organization_id,name,country_code,
      geography_node_id,flat_amount,currency_code,priority,checkout_serviceability)
      values(${fixture.organizationId},'Synthetic','BD',${area},0,'BDT',1,'SUPPORTED') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
  });

  it.each([
    ['80.4000', '0', '1', '80.0000', '-0.4000'],
    ['80.5000', '0', '1', '81.0000', '0.5000'],
    ['80.6000', '0', '1', '81.0000', '0.4000'],
    ['79.9900', '0.4100', '1', '80.0000', '-0.4000'],
    ['33.3333', '0', '3', '100.0000', '0.0001'],
    ['0.0000', '0', '1', '0.0000', '0.0000'],
  ])(
    'persists exact whole-taka terms for price %s tax %s quantity %s',
    async (price, tax, quantity, payable, rounding) => {
      await setCurrentVariantPrice(db(), {
        ...context(),
        actorId: fixture.actorId,
        variantId: fixture.variantId,
        amount: price!,
      });
      const r = await draft(await guest(), undefined, undefined, 'COD', quantity);
      const policy: PlacementPolicy = async (tx, input) => ({
        ...(await codPolicy(tx, input)),
        tax: tax!,
        taxTreatment: 'SYNTHETIC_TAX_COMPONENT',
        rounding: 'WHOLE_BDT_V1',
        wholeTakaPolicy: syntheticWholePolicy,
      });
      const wholeEngine = checkoutPlacementEngine(policy),
        terms = await wholeEngine.review(db(), r.cmd, r.review);
      expect(terms).toMatchObject({ payable, roundingAdjustment: rounding, payableUnit: 'BDT_1' });
      const placed = await wholeEngine.place(
        db(),
        r.cmd,
        { ...r.review, finalTermsFingerprint: terms.fingerprint },
        key(),
      );
      if (placed.kind !== 'COMMITTED') throw new Error('Expected synthetic commitment');
      const rows = (
        await sql`select o.total_amount::text,i.expected_amount::text,o.rounding_adjustment::text,o.tax_amount::text
      from orders.orders o join payments.payment_intents i on i.order_id=o.id where o.id=${placed.receipt.orderId}`.execute(
          db(),
        )
      ).rows[0];
      expect(rows).toMatchObject({
        total_amount: payable,
        expected_amount: payable,
        rounding_adjustment: rounding,
      });
      expect(await orderView(db(), placed.receipt.orderId)).toMatchObject({
        roundingAdjustment: rounding,
        paymentFees: '0.0000',
      });
      await rebuildAnalyticsProjections(db(), fixture.organizationId);
      expect(
        (
          await sql`select order_total_amount::text from analytics.order_facts where source_order_id=${placed.receipt.orderId}`.execute(
            db(),
          )
        ).rows[0],
      ).toMatchObject({ order_total_amount: payable });
      await expect(
        sql`update orders.orders set total_amount=total_amount+1,rounding_adjustment=rounding_adjustment+1 where id=${placed.receipt.orderId}`.execute(
          db(),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );

  it('refuses manual-wallet customer fees even under an explicit whole-taka policy', async () => {
    const w = await wallet();
    const withFee: PlacementPolicy = async (tx, input) => ({
      ...(await w.resolver(tx, input)),
      paymentFees: '1',
      rounding: 'WHOLE_BDT_V1',
      wholeTakaPolicy: syntheticWholePolicy,
    });
    await expect(
      checkoutPlacementEngine(withFee).review(db(), w.cmd, w.review),
    ).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
  });

  it('refuses a new fractional payable under the legacy exact policy', async () => {
    await setCurrentVariantPrice(db(), {
      ...context(),
      actorId: fixture.actorId,
      variantId: fixture.variantId,
      amount: '80.6000',
    });
    const r = await draft(await guest());
    await expect(
      checkoutPlacementEngine(codPolicy).review(db(), r.cmd, r.review),
    ).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
  });

  it('keeps fractional discounts exact and refuses unresolved tax in a whole-taka policy', async () => {
    await createPromotion(db(), {
      ...context(),
      actorId: fixture.actorId,
      name: 'Synthetic fractional discount',
      promotionType: 'AUTOMATIC',
      combinability: 'STACKABLE',
      benefitType: 'FIXED_AMOUNT_DISCOUNT',
      benefitValue: '0.6000',
    });
    const r = await draft(await guest());
    const policy: PlacementPolicy = async (tx, input) => ({
      ...(await codPolicy(tx, input)),
      rounding: 'WHOLE_BDT_V1',
      wholeTakaPolicy: syntheticWholePolicy,
    });
    const terms = await checkoutPlacementEngine(policy).review(db(), r.cmd, r.review);
    expect(terms).toMatchObject({
      discountTotal: '0.6000',
      precisePayable: '99.4000',
      payable: '99.0000',
      roundingAdjustment: '-0.4000',
    });
    const invalid: PlacementPolicy = async (tx, input) => ({
      ...(await policy(tx, input)),
      taxTreatment: 'UNRESOLVED',
    });
    await expect(
      checkoutPlacementEngine(invalid).review(db(), r.cmd, r.review),
    ).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
  });

  it.each([
    ['GUEST', false],
    ['ACCOUNT', false],
    ['GUEST', true],
    ['ACCOUNT', true],
  ] as const)(
    '%s placement (Cart: %s) commits only reviewed source and one unpaid obligation',
    async (kind, usesCart) => {
      const owner = kind === 'ACCOUNT' ? await account() : await guest();
      const cart = await sourceCart(owner);
      const r = await ready(owner, usesCart ? cart : undefined);
      const t0 = performance.now();
      const result = await place(r);
      console.info('synthetic placement ms', kind, usesCart, (performance.now() - t0).toFixed(1));
      expect(result).toMatchObject({
        kind: 'COMMITTED',
        receipt: { terms: { payable: '100.0000', shipping: '0.0000' } },
      });
      expect(await effects()).toEqual({
        orders: 1,
        placements: 1,
        reservations: 1,
        allocations: 1,
        obligations: 1,
        payments: 0,
        finance: 0,
        redemptions: 0,
        converted: Number(usesCart),
        audit: 1,
        outbox: 1,
      });
      expect(await getCheckoutDraft(db(), owner, r.cmd.draftId)).toMatchObject({
        status: 'COMMITTED',
        purchaseAvailable: false,
      });
      if (result.kind !== 'COMMITTED') throw new Error('Expected a committed Order');
      const grant =
        owner.kind === 'GUEST'
          ? checkoutGuestOrderCredential(owner, r.cmd.draftId, result.receipt.orderId)
          : undefined;
      expect(await getCommittedCheckoutOrder(db(), owner, r.cmd.draftId, grant)).toMatchObject({
        status: 'PENDING',
        payment: { status: 'UNPAID', outstanding: '100.0000' },
      });
      const other = kind === 'ACCOUNT' ? await account() : await guest();
      await expect(
        getCommittedCheckoutOrder(db(), other, r.cmd.draftId, grant),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      if (grant) {
        await expect(
          getCommittedCheckoutOrder(db(), owner, r.cmd.draftId, 'z'.repeat(43)),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(getCommittedCheckoutOrder(db(), owner, r.cmd.draftId)).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      }
    },
  );

  it('replays a lost response and serializes same-key and different-key submissions', async () => {
    const owner = await guest();
    const r = await ready(owner);
    await sql`update orders.checkout_drafts set expires_at=clock_timestamp()+interval '1 second' where id=${r.cmd.draftId}`.execute(
      db(),
    );
    const [a, b] = await Promise.all([place(r), place(r)]);
    expect(a).toEqual(b);
    expect(a.kind).toBe('COMMITTED');
    await sql`select pg_sleep(1)`.execute(db());
    expect(await place(r)).toEqual(a);
    await expect(place({ ...r, key: key() })).rejects.toMatchObject({ code: 'CHECKOUT_COMMITTED' });
    await expect(
      place({ ...r, input: { ...r.input, finalTermsFingerprint: 'x'.repeat(43) } }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await effects()).orders).toBe(1);
    const beforeAnalytics = await effects();
    await Promise.all([processCommerceAnalyticsOutbox(db()), processCommerceAnalyticsOutbox(db())]);
    await processCommerceAnalyticsOutbox(db());
    expect(await effects()).toEqual(beforeAnalytics);
    const measured =
      await sql`select event_name,amount::text,currency from analytics.commerce_events where organization_id=${fixture.organizationId}`.execute(
        db(),
      );
    expect(measured.rows).toEqual([
      { event_name: 'ORDER_COMMITTED', amount: '100.0000', currency: 'BDT' },
    ]);
    if (owner.kind !== 'GUEST') throw new Error('Expected guest');
    await revokeCheckoutGuestSession(db(), owner);
    await expect(place(r)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(getCommittedCheckoutOrder(db(), owner, r.cmd.draftId)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('binds each guest grant to one Order and enforces Checkout uniqueness in PostgreSQL', async () => {
    const owner = await guest();
    if (owner.kind !== 'GUEST') throw new Error('Expected guest authority');
    const r = await ready(owner);
    const first = await place(r);
    const b = await ready(owner);
    const second = await place(b);
    if (first.kind !== 'COMMITTED' || second.kind !== 'COMMITTED')
      throw new Error('Expected fixture Orders');
    const grant = checkoutGuestOrderCredential(owner, r.cmd.draftId, first.receipt.orderId);
    expect(await placeReviewedCheckout(db(), r.cmd, r.input, r.key)).toEqual(first);
    await expect(
      getCommittedCheckoutOrder(db(), owner, b.cmd.draftId, grant),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      getCommittedCheckoutOrder(db(), { ...owner, organizationId: key() }, r.cmd.draftId, grant),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(
      sql`insert into orders.orders(organization_id,checkout_draft_id,order_number,currency_code,
      payment_method,subtotal_amount,discount_amount,total_amount)
      values(${owner.organizationId},${r.cmd.draftId},${`DUP-${key()}`},'BDT','COD',0,0,0)`.execute(
        db(),
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'one_order_per_checkout_draft' });
    await expect(
      sql`update orders.checkout_drafts set guest_session_id=null where id=${r.cmd.draftId}`.execute(
        db(),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('fails closed for the HTTP-bound engine and does not accept a component acknowledgement as final acceptance', async () => {
    const r = await ready(await guest());
    const before = await effects();
    await expect(reviewCheckoutFinalTerms(db(), r.cmd, r.input)).rejects.toMatchObject({
      code: 'POLICY_BLOCKED',
    });
    await expect(placeReviewedCheckout(db(), r.cmd, r.input, r.key)).rejects.toMatchObject({
      code: 'POLICY_BLOCKED',
    });
    const forged = { ...r, input: { ...r.input, finalTermsFingerprint: r.input.quoteFingerprint } };
    const result = { kind: 'REVIEW_REQUIRED', reason: 'FINAL_TERMS_CHANGED' };
    expect(await place(forged)).toEqual(result);
    expect(await place(forged)).toEqual(result);
    expect(await effects()).toEqual(before);
    await processCommerceAnalyticsOutbox(db());
    expect(
      (
        await sql`select 1 from analytics.commerce_events where organization_id=${fixture.organizationId}`.execute(
          db(),
        )
      ).rows,
    ).toEqual([]);
  });

  it('rejects a modified Cart and never converts it', async () => {
    const owner = await guest();
    const cart = await sourceCart(owner);
    const r = await ready(owner, cart);
    const line = (
      await sql<{ id: string }>`select id from cart.cart_lines where cart_id=${cart.id}`.execute(
        db(),
      )
    ).rows[0]!.id;
    await setGuestCartLineQuantity(db(), {
      token: cart.token!,
      lineId: line,
      quantity: '2',
      expectedVersion: cart.version,
      idempotencyKey: key(),
    });
    const before = await effects();
    expect(await place(r)).toMatchObject({ kind: 'REVIEW_REQUIRED', reason: 'SOURCE_CHANGED' });
    expect(await effects()).toEqual(before);
  });

  it.each(['order', 'inventory', 'promotion', 'payment', 'cart', 'outbox'] as const)(
    'rolls back a failure after %s',
    async (stage) => {
      await createPromotion(db(), {
        ...context(),
        actorId: fixture.actorId,
        name: 'Synthetic discount',
        promotionType: 'AUTOMATIC',
        combinability: 'STACKABLE',
        benefitType: 'FIXED_AMOUNT_DISCOUNT',
        benefitValue: '5',
      });
      const owner = await guest(),
        cart = await sourceCart(owner);
      const r = await ready(owner, cart);
      const before = await effects();
      const faulty = checkoutPlacementEngine(codPolicy, (at) => {
        if (at === stage) throw new Error('synthetic placement fault');
      });
      await expect(faulty.place(db(), r.cmd, r.input, r.key)).rejects.toThrow(
        'synthetic placement fault',
      );
      expect(await effects()).toEqual(before);
      expect(await place(r)).toMatchObject({ kind: 'COMMITTED' });
    },
  );

  it.each(['stock', 'coupon'] as const)(
    'allows only one winner for the last %s',
    async (resource) => {
      if (resource === 'stock') {
        const location = await sql<{
          id: string;
        }>`select id from warehouse.locations where organization_id=${fixture.organizationId} and code='TEST'`.execute(
          db(),
        );
        await adjustInventory(db(), {
          organizationId: fixture.organizationId,
          actorId: fixture.actorId,
          variantId: fixture.variantId,
          locationId: location.rows[0]!.id,
          condition: 'SELLABLE',
          quantityDelta: '-39',
          reasonCode: 'CORRECTION',
          idempotencyKey: key(),
        });
      } else await coupon();
      const a = await ready(
        await guest(),
        undefined,
        resource === 'coupon' ? ['LIMITED'] : undefined,
      );
      const b = await ready(
        await guest(),
        undefined,
        resource === 'coupon' ? ['LIMITED'] : undefined,
      );
      const entered = gate(),
        release = gate();
      const first = checkoutPlacementEngine(codPolicy, async (stage) => {
        if (stage === 'order') {
          entered.open();
          await release.promise;
        }
      }).place(db(), a.cmd, a.input, a.key);
      await Promise.race([entered.promise, first]);
      const second = place(b);
      try {
        await expectLockWait('platform.number_sequences');
      } finally {
        release.open();
      }
      const results = await Promise.all([first, second]);
      expect(results.map((r) => r.kind)).toEqual(['COMMITTED', 'REVIEW_REQUIRED']);
      expect(await effects()).toEqual({
        orders: 1,
        placements: 1,
        reservations: 1,
        allocations: 1,
        obligations: 1,
        payments: 0,
        finance: 0,
        redemptions: Number(resource === 'coupon'),
        converted: 0,
        audit: 1,
        outbox: 1,
      });
    },
  );

  it('sees a higher-priority tariff inserted by an overlapping writer before placement', async () => {
    const r = await ready(await guest());
    const wrote = gate(),
      release = gate();
    const writer = db()
      .transaction()
      .execute(async (tx) => {
        await sql`insert into orders.delivery_pricing_rules(organization_id,name,country_code,geography_node_id,
        flat_amount,currency_code,priority,checkout_serviceability)
        values(${fixture.organizationId},'New rule','BD',${area},10,'BDT',5,'SUPPORTED')`.execute(
          tx,
        );
        wrote.open();
        await release.promise;
      });
    await Promise.race([wrote.promise, writer]);
    const pending = place(r);
    try {
      await expectLockWait('lock table catalog.product_categories');
    } finally {
      release.open();
    }
    await writer;
    expect(await pending).toEqual({ kind: 'REVIEW_REQUIRED', reason: 'CONFIGURATION_CHANGED' });
    expect((await effects()).orders).toBe(0);
  });

  it('serializes account logout on either side of placement', async () => {
    const old = await account();
    const r = await ready(old);
    await revokeShopperStorageValue(db(), old.sessionKeyHash);
    await expect(place(r)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect((await effects()).orders).toBe(0);
    const owner = await account();
    const active = await ready(owner);
    const paused = gate(),
      release = gate();
    const pending = checkoutPlacementEngine(codPolicy, async (stage) => {
      if (stage === 'order') {
        paused.open();
        await release.promise;
      }
    }).place(db(), active.cmd, active.input, active.key);
    await Promise.race([paused.promise, pending]);
    const logout = revokeShopperStorageValue(db(), owner.sessionKeyHash);
    try {
      await expectLockWait('pg_advisory_xact_lock(');
    } finally {
      release.open();
    }
    expect(await pending).toMatchObject({ kind: 'COMMITTED' });
    await logout;
    await expect(place(active)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('blocks disabled payment methods before any business effects', async () => {
    const r = await ready(await guest());
    await configurePaymentMethod(db(), {
      ...context(),
      actorId: fixture.actorId,
      code: 'COD',
      name: 'Disabled COD',
      status: 'DISABLED',
      displayOrder: 1,
    });
    expect(await place(r)).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'PAYMENT_METHOD_UNAVAILABLE',
    });
    expect((await effects()).orders).toBe(0);
  });

  it('does not commit an account COD order after a restriction is added', async () => {
    const owner = await account();
    const r = await ready(owner);
    await sql`insert into customers.customer_restrictions(organization_id,customer_id,restriction_type,reason,created_by)
      values(${owner.organizationId},${owner.customerId},'COD_RESTRICTED','Synthetic restriction',${fixture.actorId})`.execute(
      db(),
    );
    await expect(engine.review(db(), r.cmd, r.input)).rejects.toMatchObject({
      code: 'CUSTOMER_RESTRICTED',
    });
    expect(await place(r)).toEqual({ kind: 'REVIEW_REQUIRED', reason: 'CUSTOMER_RESTRICTED' });
    expect(await effects()).toMatchObject({
      orders: 0,
      reservations: 0,
      obligations: 0,
      payments: 0,
      finance: 0,
      audit: 0,
      outbox: 0,
    });
  });

  it('observes the existing Checkout kill switch for new work', async () => {
    const r = await ready(await guest());
    await setOperationalControl(db(), {
      organizationId: fixture.organizationId,
      key: 'checkout_enabled',
      type: 'KILL_SWITCH',
      enabled: false,
    });
    await expect(place(r)).rejects.toMatchObject({ code: 'CHECKOUT_DISABLED' });
    expect(await effects()).toMatchObject({
      orders: 0,
      reservations: 0,
      obligations: 0,
      outbox: 0,
    });
  });

  it('preserves a legitimate zero price and zero shipping as an exact zero obligation', async () => {
    await setCurrentVariantPrice(db(), {
      ...context(),
      actorId: fixture.actorId,
      variantId: fixture.variantId,
      amount: '0.0000',
    });
    const r = await ready(await guest());
    expect(await place(r)).toMatchObject({
      kind: 'COMMITTED',
      receipt: { terms: { payable: '0.0000', shipping: '0.0000' } },
    });
    await processCommerceAnalyticsOutbox(db());
    expect(
      (
        await sql`select event_name,amount::text from analytics.commerce_events where organization_id=${fixture.organizationId}`.execute(
          db(),
        )
      ).rows,
    ).toEqual([{ event_name: 'ORDER_COMMITTED', amount: '0.0000' }]);
    const payment = await sql`select expected_amount::text,status from payments.payment_intents
      where organization_id=${fixture.organizationId}`.execute(db());
    expect(payment.rows).toEqual([{ expected_amount: '0.0000', status: 'READY' }]);
    expect(await effects()).toMatchObject({ obligations: 1, payments: 0, finance: 0 });
  });

  it('serializes concurrent different keys for one draft', async () => {
    const r = await ready(await guest());
    const outcomes = await Promise.allSettled([place(r), place({ ...r, key: key() })]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toMatchObject([
      { value: { kind: 'COMMITTED' } },
    ]);
    expect(outcomes.filter((o) => o.status === 'rejected')).toMatchObject([
      { reason: { code: 'CHECKOUT_COMMITTED' } },
    ]);
    expect(await effects()).toMatchObject({
      orders: 1,
      placements: 1,
      reservations: 1,
      obligations: 1,
      outbox: 1,
    });
  });

  it('rejects a newer authoritative price while preserving the old review receipt', async () => {
    const r = await ready(await guest());
    await setCurrentVariantPrice(db(), {
      ...context(),
      actorId: fixture.actorId,
      variantId: fixture.variantId,
      amount: '100.0100',
    });
    const changed = { kind: 'REVIEW_REQUIRED', reason: 'CONFIGURATION_CHANGED' };
    expect(await place(r)).toEqual(changed);
    expect(await place(r)).toEqual(changed);
    expect((await effects()).orders).toBe(0);
  });

  it('authorizes only the committed guest, gates transfer and claims, and reconciles a lost response', async () => {
    const w = await wallet(),
      payment = checkoutOrderPaymentEngine(true);
    await expect(payment.get(db(), w.cmd)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const placed = await w.engine.place(db(), w.cmd, w.input, w.key);
    if (placed.kind !== 'COMMITTED' || w.cmd.owner.kind !== 'GUEST')
      throw new Error('Expected guest placement');
    const access = {
      ...w.cmd,
      guestCredential: checkoutGuestOrderCredential(
        w.cmd.owner,
        w.cmd.draftId,
        placed.receipt.orderId,
      ),
    };
    await expect(payment.get(db(), w.cmd)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(payment.get(db(), { ...access, owner: await guest() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(payment.get(db(), { ...access, draftId: w.review.quoteId })).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
    await expect(
      payment.get(db(), { ...access, draftId: placed.receipt.orderId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await getCheckoutOrderPayment(db(), access)).toMatchObject({
      instructions: null,
      claimAvailability: 'POLICY_BLOCKED',
      originalPayable: '100.0000',
    });
    const body = { transactionId: 'Fixture-Claim-01' },
      claimKey = key();
    await expect(submitCheckoutPaymentClaim(db(), access, body, claimKey)).rejects.toMatchObject({
      code: 'POLICY_BLOCKED',
    });
    await expect(
      payment.submit(db(), access, { transactionId: '???' }, key()),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(await payment.get(db(), access)).toMatchObject({
      transferAvailability: 'AVAILABLE',
      outstanding: '100.0000',
      instructions: { accountNumber: '01700000000', transferAction: 'MERCHANT_PAYMENT' },
    });
    const before = await effects();
    const start = performance.now();
    const claims = await Promise.all([
      payment.submit(db(), access, body, claimKey),
      payment.submit(db(), access, body, claimKey),
    ]);
    console.info(
      'Concurrent synthetic claim and exact retry wall time (ms)',
      (performance.now() - start).toFixed(2),
    );
    expect(claims[0]).toEqual(claims[1]);
    expect(claims[0]).toMatchObject({ status: 'PENDING_VERIFICATION', reviewState: 'PENDING' });
    expect(JSON.stringify(claims[0])).not.toContain(body.transactionId);
    expect(await recoverCheckoutPaymentClaim(db(), access, claimKey)).toEqual(claims[0]);
    await expect(
      payment.submit(db(), access, { transactionId: body.transactionId.toUpperCase() }, claimKey),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(payment.submit(db(), access, body, key())).rejects.toMatchObject({
      code: 'CLAIM_ALREADY_SUBMITTED',
    });
    expect(await effects()).toEqual(before);
    expect(
      (
        await sql`select payload from platform.outbox_events where organization_id=${fixture.organizationId}
      and event_type='payments.payment_attempt.submitted'`.execute(db())
      ).rows,
    ).toEqual([{ payload: { attemptId: claims[0].id, orderId: placed.receipt.orderId } }]);
    expect(await payment.get(db(), access)).toMatchObject({
      transferAvailability: 'CLAIM_UNDER_REVIEW',
      instructions: null,
      paymentStatus: 'PAYMENT_PENDING',
      allocated: '0.0000',
      verifiedWalletReceipts: '0.0000',
    });
    const bound = (
      await sql<{
        bounded: boolean;
      }>`select guest_grant_expires_at<=created_at+interval '1 hour' bounded
      from orders.checkout_placements where draft_id=${w.cmd.draftId}`.execute(db())
    ).rows[0];
    expect(bound?.bounded).toBe(true);
    await revokeCheckoutGuestSession(db(), w.cmd.owner);
    await expect(recoverCheckoutPaymentClaim(db(), access, claimKey)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('shows actual Admin review, partial receipt and excess settlement to the account owner', async () => {
    const owner = await account();
    const w = await wallet(owner),
      payment = checkoutOrderPaymentEngine(true);
    const placed = await w.engine.place(db(), w.cmd, w.input, w.key);
    if (placed.kind !== 'COMMITTED') throw new Error('Expected account placement');
    await expect(payment.get(db(), { ...w.cmd, owner: await account() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      payment.get(db(), { ...w.cmd, owner: { ...owner, organizationId: key() } }),
    ).rejects.toMatchObject({ code: 'OWNER_CHANGED' });
    const actorId = key(),
      email = `${actorId}@example.test`;
    await sql`insert into iam.users(id,name,email,email_normalized) values(${actorId},'Synthetic Owner',${email},${email})`.execute(
      db(),
    );
    await sql`insert into iam.organization_memberships(organization_id,user_id,membership_type,status)
      values(${fixture.organizationId},${actorId},'OWNER','ACTIVE')`.execute(db());
    const operator = { organizationId: fixture.organizationId, actorId };
    const financialAccountId = (
      await sql<{ financial_account_id: string }>`select financial_account_id
      from payments.receiving_destinations where id=${w.destination}`.execute(db())
    ).rows[0]!.financial_account_id;
    const claimKey = key(),
      transactionId = 'Fixture-Partial';
    expect(await payment.get(db(), w.cmd)).toMatchObject({ instructions: { provider: 'BKASH' } });
    const first = await payment.submit(db(), w.cmd, { transactionId }, claimKey);
    expect((await listManualClaimQueue(db(), operator)).items).toMatchObject([
      {
        id: first.id,
        orderId: placed.receipt.orderId,
        customerReference: transactionId,
        expectedAmount: '100.0000',
      },
    ]);
    await reviewManualClaim(db(), {
      ...operator,
      attemptId: first.id,
      state: 'UNDER_REVIEW',
      note: 'Synthetic private note',
    });
    expect(await payment.recover(db(), w.cmd, claimKey)).toMatchObject({
      id: first.id,
      reviewState: 'UNDER_REVIEW',
    });
    const verify = (
      attemptId: string,
      reference: string,
      confirmedAmount: string,
      idempotencyKey: string,
      accountId = financialAccountId,
    ) =>
      verifyManualPayment(db(), {
        ...operator,
        attemptId,
        confirmedAmount,
        idempotencyKey,
        evidence: {
          transactionId: reference,
          financialAccountId: accountId,
          receivingNumber: '01700000000',
          currency: 'BDT',
          valueTime: new Date().toISOString(),
          source: 'ACCOUNT_HISTORY',
          evidenceReference: 'Isolated statement fixture',
        },
      });
    const otherAccount = (
      await sql<{ id: string }>`insert into finance.financial_accounts
      (organization_id,account_number,name,account_type,currency_code)
      values(${fixture.organizationId},'SYNTHETIC-OTHER-WALLET','Unrelated wallet','MOBILE_WALLET','BDT')
      returning id`.execute(db())
    ).rows[0]!.id;
    await expect(verify(first.id, transactionId, '40', key(), otherAccount)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await effects()).toMatchObject({ payments: 0, finance: 0 });
    await verify(first.id, transactionId, '40', key());
    expect(await payment.get(db(), w.cmd)).toMatchObject({
      originalPayable: '100.0000',
      outstanding: '60.0000',
      verifiedWalletReceipts: '40.0000',
      allocated: '40.0000',
      paymentStatus: 'PARTIALLY_PAID',
      transferAvailability: 'AVAILABLE',
    });
    const second = await payment.submit(
      db(),
      w.cmd,
      { transactionId: 'Fixture-Excess', sendingMobile: '01800000000' },
      key(),
    );
    const entered = gate(),
      release = gate();
    const fence = db()
      .transaction()
      .execute(async (tx) => {
        await sql`select id from orders.orders where id=${placed.receipt.orderId} for update`.execute(
          tx,
        );
        entered.open();
        await release.promise;
      });
    await Promise.race([fence, entered.promise]);
    const verification = verify(second.id, 'Fixture-Excess', '75', key());
    let concurrentClaim: Promise<unknown> | undefined;
    try {
      await expectLockWait('select order_status from orders.orders');
      concurrentClaim = payment
        .submit(db(), w.cmd, { transactionId: 'Fixture-Settled-Race' }, key())
        .catch((error: unknown) => error);
      await expectLockWait('select order_number,order_status,total_amount');
    } finally {
      release.open();
    }
    await fence;
    await verification;
    expect(await concurrentClaim).toMatchObject({ code: 'PAYMENT_ALREADY_SETTLED' });
    expect(await payment.get(db(), w.cmd)).toMatchObject({
      outstanding: '0.0000',
      verifiedWalletReceipts: '115.0000',
      unallocatedAtVerification: '15.0000',
      allocated: '100.0000',
      paymentStatus: 'PAID',
      instructions: null,
      transferAvailability: 'PAYMENT_ALREADY_SETTLED',
    });
    expect(await effects()).toMatchObject({ orders: 1, obligations: 1, payments: 2, finance: 2 });
    expect(await payment.submit(db(), w.cmd, { transactionId }, claimKey)).toMatchObject({
      id: first.id,
      status: 'VERIFIED',
    });
    const sessionHeld = gate(),
      releaseSession = gate();
    const sessionFence = db()
      .transaction()
      .execute(async (tx) => {
        await lockShopperSession(tx, owner.sessionKeyHash, true);
        sessionHeld.open();
        await releaseSession.promise;
      });
    await Promise.race([sessionFence, sessionHeld.promise]);
    const logout = revokeShopperStorageValue(db(), owner.sessionKeyHash);
    let recovery: Promise<unknown> | undefined;
    try {
      await expectLockWait('pg_advisory_xact_lock(');
      recovery = payment.recover(db(), w.cmd, claimKey).catch((error: unknown) => error);
      await expectLockWait('pg_advisory_xact_lock_shared(');
    } finally {
      releaseSession.open();
    }
    await sessionFence;
    await logout;
    expect(await recovery).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('waits for destination suspension and does not expose an obsolete instruction snapshot', async () => {
    const owner = await account(),
      w = await wallet(owner);
    const payment = checkoutOrderPaymentEngine(true);
    expect(await w.engine.place(db(), w.cmd, w.input, w.key)).toMatchObject({ kind: 'COMMITTED' });
    const entered = gate(),
      release = gate();
    const writer = db()
      .transaction()
      .execute(async (tx) => {
        await sql`update payments.receiving_destinations set state='SUSPENDED',revision=revision+1
        where id=${w.destination}`.execute(tx);
        entered.open();
        await release.promise;
      });
    await Promise.race([writer, entered.promise]);
    const pending = payment.get(db(), w.cmd);
    try {
      await expectLockWait('from payments.receiving_destinations where');
    } finally {
      release.open();
    }
    await writer;
    expect(await pending).toMatchObject({
      instructions: null,
      transferAvailability: 'DESTINATION_UNAVAILABLE',
    });
  });

  it('keeps an expired pending claim for review and rejects a new claim after Worker cancellation', async () => {
    const w = await wallet(),
      payment = checkoutOrderPaymentEngine(true);
    const placed = await w.engine.place(db(), w.cmd, w.input, w.key);
    if (placed.kind !== 'COMMITTED' || w.cmd.owner.kind !== 'GUEST')
      throw new Error('Expected guest placement');
    const access = {
      ...w.cmd,
      guestCredential: checkoutGuestOrderCredential(
        w.cmd.owner,
        w.cmd.draftId,
        placed.receipt.orderId,
      ),
    };
    const claimKey = key();
    const claim = await payment.submit(
      db(),
      access,
      { transactionId: 'Fixture-Review-Window' },
      claimKey,
    );
    await sql`update payments.payment_intents set expires_at=clock_timestamp()-interval '2 minutes'
      where order_id=${placed.receipt.orderId}`.execute(db());
    expect(await processExpiredPaymentOrders(db())).toBe(0);
    expect(await payment.get(db(), access)).toMatchObject({
      orderStatus: 'PENDING',
      transferAvailability: 'PAYMENT_WINDOW_EXPIRED',
      latestClaim: claim,
    });
    await sql`update payments.payment_intents set review_expires_at=clock_timestamp()-interval '1 minute'
      where order_id=${placed.receipt.orderId}`.execute(db());
    const entered = gate(),
      release = gate();
    const fence = db()
      .transaction()
      .execute(async (tx) => {
        await sql`select id from orders.orders where id=${placed.receipt.orderId} for update`.execute(
          tx,
        );
        entered.open();
        await release.promise;
      });
    await Promise.race([fence, entered.promise]);
    const worker = processExpiredPaymentOrders(db());
    let submission: Promise<unknown> | undefined;
    try {
      await expectLockWait('select order_status, version::text,customer_id from orders.orders');
      submission = payment
        .submit(db(), access, { transactionId: 'Fixture-New-After-Expiry' }, key())
        .catch((error: unknown) => error);
      await expectLockWait('select order_number,order_status,total_amount');
    } finally {
      release.open();
    }
    await fence;
    expect(await worker).toBe(1);
    expect(await submission).toMatchObject({ code: 'ORDER_CANCELLED' });
    expect(await payment.recover(db(), access, claimKey)).toEqual(claim);
    expect(await payment.get(db(), access)).toMatchObject({
      orderStatus: 'CANCELLED',
      instructions: null,
      transferAvailability: 'ORDER_CANCELLED',
    });
  });

  it('serializes distinct claim keys and fails closed after destination suspension and expiry', async () => {
    const w = await wallet(),
      payment = checkoutOrderPaymentEngine(true);
    const placed = await w.engine.place(db(), w.cmd, w.input, w.key);
    if (placed.kind !== 'COMMITTED' || w.cmd.owner.kind !== 'GUEST')
      throw new Error('Expected guest placement');
    const access = {
      ...w.cmd,
      guestCredential: checkoutGuestOrderCredential(
        w.cmd.owner,
        w.cmd.draftId,
        placed.receipt.orderId,
      ),
    };
    const result = await Promise.allSettled([
      payment.submit(db(), access, { transactionId: 'Fixture-Duplicate' }, key()),
      payment.submit(db(), access, { transactionId: 'Fixture-Duplicate' }, key()),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(result.find((item) => item.status === 'rejected')).toMatchObject({
      reason: { code: 'CLAIM_ALREADY_SUBMITTED' },
    });
    for (const reference of ['Fixture-One', 'fixture-one', 'Fixture-Three', 'Fixture-Four'])
      await payment.submit(db(), access, { transactionId: reference }, key());
    await expect(
      payment.submit(db(), access, { transactionId: 'Fixture-Limit' }, key()),
    ).rejects.toMatchObject({ code: 'CLAIM_LIMIT_REACHED' });
    await sql`update payments.receiving_destinations set state='SUSPENDED',revision=revision+1 where id=${w.destination}`.execute(
      db(),
    );
    expect(await payment.get(db(), access)).toMatchObject({
      instructions: null,
      transferAvailability: 'DESTINATION_UNAVAILABLE',
    });
    await sql`update payments.payment_intents set expires_at=now()-interval '1 second' where order_id=${placed.receipt.orderId}`.execute(
      db(),
    );
    await expect(
      payment.submit(db(), access, { transactionId: 'Fixture-Too-Late' }, key()),
    ).rejects.toMatchObject({ code: 'PAYMENT_WINDOW_EXPIRED' });
    expect(await payment.get(db(), access)).toMatchObject({
      instructions: null,
      transferAvailability: 'PAYMENT_WINDOW_EXPIRED',
    });
  });

  it('writes a private manual obligation, preserves original provenance and releases unpaid stock via Worker expiry', async () => {
    const w = await wallet();
    const result = await w.engine.place(db(), w.cmd, w.input, w.key);
    if (result.kind !== 'COMMITTED' || w.cmd.owner.kind !== 'GUEST')
      throw new Error('Expected a guest Order');
    const grant = checkoutGuestOrderCredential(w.cmd.owner, w.cmd.draftId, result.receipt.orderId);
    expect(JSON.stringify(result)).not.toContain('01700000000');
    expect(await getCommittedCheckoutOrder(db(), w.cmd.owner, w.cmd.draftId, grant)).toMatchObject({
      payment: { status: 'UNPAID', outstanding: '100.0000' },
    });
    const obligations =
      await sql`select expected_amount::text,status,destination_id,destination_revision::text,
      operating_policy_id,instructions_snapshot,expires_at<review_expires_at bounded
      from payments.payment_intents where organization_id=${fixture.organizationId}`.execute(db());
    expect(obligations.rows).toMatchObject([
      {
        expected_amount: '100.0000',
        status: 'READY',
        destination_id: w.destination,
        destination_revision: '1',
        operating_policy_id: w.policy,
        bounded: true,
        instructions_snapshot: { provider: 'BKASH', transferAction: 'MERCHANT_PAYMENT' },
      },
    ]);
    await sql`update payments.payment_intents set expires_at=now()-interval '1 minute'
      where organization_id=${fixture.organizationId}`.execute(db());
    expect(await processExpiredPaymentOrders(db())).toBe(1);
    expect(await processExpiredPaymentOrders(db())).toBe(0);
    expect(await getCommittedCheckoutOrder(db(), w.cmd.owner, w.cmd.draftId, grant)).toMatchObject({
      status: 'CANCELLED',
    });
    const stock =
      await sql`select reserved_quantity::text,sellable_quantity::text from inventory.inventory_levels
      where organization_id=${fixture.organizationId}`.execute(db());
    expect(stock.rows).toEqual([{ reserved_quantity: '0.000000', sellable_quantity: '40.000000' }]);
    expect(await effects()).toMatchObject({ orders: 1, payments: 0, finance: 0, outbox: 1 });
  });

  it.each(['writer-first', 'placement-first'] as const)(
    'serializes wallet destination suspension (%s)',
    async (winner) => {
      const w = await wallet(),
        entered = gate(),
        release = gate();
      const suspend = (hold: boolean) =>
        db()
          .transaction()
          .execute(async (tx) => {
            await sql`update payments.receiving_destinations set state='SUSPENDED',revision=revision+1
        where id=${w.destination}`.execute(tx);
            if (hold) {
              entered.open();
              await release.promise;
            }
          });
      if (winner === 'writer-first') {
        const writer = suspend(true);
        await Promise.race([writer, entered.promise]);
        const pending = w.engine.place(db(), w.cmd, w.input, w.key);
        try {
          await expectLockWait('lock table catalog.product_categories');
        } finally {
          release.open();
        }
        await writer;
        expect(await pending).toEqual({
          kind: 'REVIEW_REQUIRED',
          reason: 'PAYMENT_METHOD_UNAVAILABLE',
        });
        expect(await effects()).toMatchObject({
          orders: 0,
          obligations: 0,
          reservations: 0,
          outbox: 0,
        });
      } else {
        const pending = checkoutPlacementEngine(w.resolver, async (stage) => {
          if (stage === 'payment') {
            entered.open();
            await release.promise;
          }
        }).place(db(), w.cmd, w.input, w.key);
        await Promise.race([pending, entered.promise]);
        const writer = suspend(false);
        try {
          await expectLockWait('update payments.receiving_destinations');
        } finally {
          release.open();
        }
        expect(await pending).toMatchObject({ kind: 'COMMITTED' });
        await writer;
        expect(await w.engine.place(db(), w.cmd, w.input, w.key)).toEqual(await pending);
        expect(await effects()).toMatchObject({
          orders: 1,
          obligations: 1,
          payments: 0,
          finance: 0,
        });
      }
    },
  );

  it('rejects a destination without provider approval evidence even if marked approved', async () => {
    const w = await wallet();
    await sql`update payments.receiving_destinations set provider_evidence_reference=null where id=${w.destination}`.execute(
      db(),
    );
    expect(await w.engine.place(db(), w.cmd, w.input, w.key)).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'PAYMENT_METHOD_UNAVAILABLE',
    });
    expect(await effects()).toMatchObject({
      orders: 0,
      obligations: 0,
      reservations: 0,
      outbox: 0,
    });
  });

  it.each([5, 25, 100])(
    'measures a complete Cart with %i distinct lines',
    async (size) => {
      const owner = await guest(),
        cart = await sourceCart(owner);
      await growSyntheticCart(cart.id, size);
      const r = await ready(owner, cart);
      let queries = 0;
      const observed = db().withPlugin({
        transformQuery({ node }) {
          queries++;
          return node;
        },
        async transformResult({ result }) {
          return result;
        },
      });
      const started = performance.now();
      const result = await engine.place(observed, r.cmd, r.input, r.key);
      console.info('synthetic Cart placement profile', {
        size,
        ms: Math.round(performance.now() - started),
        queries,
      });
      expect(result).toMatchObject({ kind: 'COMMITTED' });
      expect(await effects()).toMatchObject({
        orders: 1,
        reservations: size,
        allocations: size,
        converted: 1,
        outbox: 1,
      });
    },
    15000,
  );

  it('retries the entire intent after a synthetic serialization failure without duplicate effects', async () => {
    const r = await ready(await guest());
    let attempts = 0;
    const retrying = checkoutPlacementEngine(codPolicy, (stage) => {
      if (stage === 'payment' && ++attempts === 1)
        throw Object.assign(new Error('synthetic serialization failure'), { code: '40001' });
    });
    expect(await retrying.place(db(), r.cmd, r.input, r.key)).toMatchObject({ kind: 'COMMITTED' });
    expect(attempts).toBe(2);
    expect(await effects()).toMatchObject({
      orders: 1,
      reservations: 1,
      obligations: 1,
      payments: 0,
      outbox: 1,
    });
  });
  it.each(['BEFORE_COMMIT', 'AFTER_COMMIT'] as const)(
    'recovers the same placement identity after physical %s socket loss',
    async (mode) => {
      const r = await ready(await guest());
      const fault = await postgresCommitFault(isolated.url, mode);
      const broken = createDatabase({ connectionString: fault.url, maxConnections: 1 });
      try {
        await expect(engine.place(broken.db, r.cmd, r.input, r.key)).rejects.toThrow();
        expect(fault.evidence).toEqual({
          intercepted: true,
          serverCommitSeen: mode === 'AFTER_COMMIT',
        });
        expect(await effects()).toMatchObject({
          orders: mode === 'AFTER_COMMIT' ? 1 : 0,
          payments: 0,
          finance: 0,
        });
        const result = await place(r);
        expect(result.kind).toBe('COMMITTED');
        expect(await place(r)).toEqual(result);
        expect(await effects()).toMatchObject({
          orders: 1,
          placements: 1,
          reservations: 1,
          allocations: 1,
          obligations: 1,
          payments: 0,
          finance: 0,
          audit: 1,
          outbox: 1,
        });
      } finally {
        await broken.close();
        await fault.close();
      }
    },
    15000,
  );
  it.each(['GUEST', 'ACCOUNT'] as const)(
    'keeps %s committed recovery and payment status available while new purchasing is disabled',
    async (kind) => {
      const owner = kind === 'GUEST' ? await guest() : await account();
      const committed = await ready(owner);
      const placed = await place(committed);
      if (placed.kind !== 'COMMITTED') throw new Error('Expected committed fixture');
      const next = await ready(owner);
      const grant =
        owner.kind === 'GUEST'
          ? checkoutGuestOrderCredential(owner, committed.cmd.draftId, placed.receipt.orderId)
          : undefined;
      const before = await effects();
      await setOperationalControl(db(), {
        organizationId: fixture.organizationId,
        key: 'checkout_enabled',
        type: 'KILL_SWITCH',
        enabled: false,
      });
      await expect(place(next)).rejects.toMatchObject({ code: 'CHECKOUT_DISABLED' });
      expect(await place(committed)).toEqual(placed);
      expect(
        await getCommittedCheckoutOrder(db(), owner, committed.cmd.draftId, grant),
      ).toMatchObject({ receipt: { orderId: placed.receipt.orderId } });
      expect(
        await getCheckoutOrderPayment(db(), {
          owner,
          draftId: committed.cmd.draftId,
          ...(grant ? { guestCredential: grant } : {}),
        }),
      ).toMatchObject({ method: 'COD' });
      expect(await effects()).toEqual(before);
    },
  );
  it('keeps existing manual claim submission and exact recovery available after disabling new purchasing', async () => {
    const w = await wallet();
    const placed = await w.engine.place(db(), w.cmd, w.input, w.key);
    if (placed.kind !== 'COMMITTED' || w.cmd.owner.kind !== 'GUEST')
      throw new Error('Expected guest fixture');
    const access = {
      owner: w.cmd.owner,
      draftId: w.cmd.draftId,
      guestCredential: checkoutGuestOrderCredential(
        w.cmd.owner,
        w.cmd.draftId,
        placed.receipt.orderId,
      ),
    };
    await setOperationalControl(db(), {
      organizationId: fixture.organizationId,
      key: 'checkout_enabled',
      type: 'KILL_SWITCH',
      enabled: false,
    });
    const engine = checkoutOrderPaymentEngine(true),
      intent = key();
    const claim = await engine.submit(
      db(),
      access,
      { transactionId: 'Synthetic-09A-Claim' },
      intent,
    );
    expect(await engine.recover(db(), access, intent)).toEqual(claim);
    expect(
      await engine.submit(db(), access, { transactionId: 'Synthetic-09A-Claim' }, intent),
    ).toEqual(claim);
  });

  it('bounds a real placement row-lock timeout and permits an exact-key retry after release', async () => {
    const r = await ready(await guest());
    const held = gate(),
      acquired = gate();
    const blocker = db()
      .transaction()
      .execute(async (tx) => {
        await sql`select 1 from orders.checkout_drafts where id=${r.cmd.draftId} for update`.execute(
          tx,
        );
        acquired.open();
        await held.promise;
      });
    try {
      await acquired.promise;
      await expect(place(r)).rejects.toMatchObject({ code: '55P03' });
      expect(await effects()).toMatchObject({
        orders: 0,
        reservations: 0,
        obligations: 0,
        outbox: 0,
      });
    } finally {
      held.open();
      await blocker;
    }
    expect(await place(r)).toMatchObject({ kind: 'COMMITTED' });
    expect(await effects()).toMatchObject({ orders: 1, obligations: 1 });
  }, 15000);
});
