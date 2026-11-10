import { writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql, type KyselyPlugin, type QueryId } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrationProvider } from '../migrations/index.js';
import { runMigrations } from '../migrate.js';
import { cartFixture, isolatedCartDatabase } from '../testing/cart-fixture.js';
import { createCheckoutDraft, updateCheckoutDraft, checkoutTransaction } from './commands.js';
import {
  createCheckoutGuestSession,
  revokeCheckoutGuestSession,
  lockCheckoutAuthority,
} from './authority.js';
import { updateCheckoutDelivery } from './delivery.js';
import { createCheckoutQuote, getCheckoutQuote, acknowledgeCheckoutQuote } from './quotes.js';
import { evaluateCheckoutInTransaction } from './quote-evaluation.js';
import { ownedDraft } from './queries.js';
import type { CheckoutAuthority } from './types.js';
import {
  createGuestCart,
  addGuestCartLine,
  setGuestCartLineQuantity,
  getGuestCart,
} from '../cart.js';
import { createPromotion, createCouponCode } from '../promotions.js';
import { setCurrentVariantPrice } from '../pricing.js';
import { parseMoney, money } from '../cart/value.js';
import { allocateDiscount } from '../promotions.js';
import { checkoutDeliveryUpgradeCase } from './delivery-upgrade-case.js';

const key = () => crypto.randomUUID();
let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let f: Awaited<ReturnType<typeof cartFixture>>;
let area: string, rule: string;
const db = () => isolation.database.db;
const context = () => ({ organizationId: f.organizationId, currency: 'BDT' });
const contact = () => ({
  recipientName: 'Synthetic shopper',
  mobile: '01712345678',
  geographyNodeId: area,
  addressLine1: 'Synthetic address',
});
function signal() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
async function ready(cart?: { id: string; revision: string; token: string }) {
  const g = await createCheckoutGuestSession(db(), context());
  const owner: CheckoutAuthority = {
    kind: 'GUEST',
    organizationId: f.organizationId,
    sessionId: g.session.id,
    token: g.token,
  };
  const draft = await createCheckoutDraft(
    db(),
    context(),
    owner,
    {
      source: cart
        ? { kind: 'CART', cartId: cart.id, cartRevision: cart.revision }
        : { kind: 'BUY_NOW', variantId: f.variantId, quantity: '2' },
    },
    key(),
    cart?.token,
  );
  await updateCheckoutDelivery(
    db(),
    owner,
    draft.id,
    { revision: draft.revision, delivery: contact() },
    key(),
  );
  return { owner, id: draft.id, revision: '2', token: cart?.token };
}
async function quote(d: Awaited<ReturnType<typeof ready>>, couponCodes?: string[]) {
  return createCheckoutQuote(
    db(),
    d.owner,
    d.id,
    { revision: d.revision, ...(couponCodes ? { couponCodes } : {}) },
    key(),
    d.token,
  );
}
async function promotion(
  type: 'AUTOMATIC' | 'COUPON' = 'AUTOMATIC',
  benefit = '10',
  combinability: 'STACKABLE' | 'EXCLUSIVE' = 'STACKABLE',
) {
  return createPromotion(db(), {
    organizationId: f.organizationId,
    actorId: f.actorId,
    name: 'Synthetic offer',
    promotionType: type,
    combinability,
    benefitType: 'PERCENTAGE_DISCOUNT',
    benefitValue: benefit,
  });
}
describe('Phase 03A real PostgreSQL commercial quotes', () => {
  beforeAll(async () => {
    isolation = await isolatedCartDatabase();
    await runMigrations(db());
  }, 60000);
  afterAll(async () => {
    if (isolation) await isolation.close();
  });
  beforeEach(async () => {
    f = await cartFixture(isolation.database);
    const country = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(node_type,canonical_name,country_code) values('COUNTRY',${key()},'BD') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
    area = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(parent_id,node_type,canonical_name) values(${country},'DISTRICT',${key()}) returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
    await sql`insert into delivery.delivery_methods(organization_id,code,name,method_type) values(${f.organizationId},'HOME_DELIVERY','Synthetic','HOME_DELIVERY')`.execute(
      db(),
    );
    rule = (
      await sql<{
        id: string;
      }>`insert into orders.delivery_pricing_rules(organization_id,name,country_code,geography_node_id,flat_amount,currency_code,priority,checkout_serviceability)
      values(${f.organizationId},'Synthetic','BD',${area},0,'BDT',1,'SUPPORTED') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
  });
  it('persists exact immutable components, stable replay and acknowledgement without purchase side effects', async () => {
    const d = await ready();
    const k = key();
    await setCurrentVariantPrice(db(), {
      ...context(),
      actorId: f.actorId,
      variantId: f.variantId,
      amount: '0.3333',
    });
    await promotion();
    const q = await createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k);
    expect(q).toMatchObject({
      status: 'CURRENT',
      draftRevision: '3',
      reviewRequired: true,
      stockReserved: false,
      purchaseAvailable: false,
      facts: {
        merchandiseSubtotal: '0.6666',
        discountTotal: '0.0666',
        shipping: '0.0000',
        evaluatedTotal: '0.6000',
        tax: null,
        paymentFees: null,
        payable: null,
        final: false,
      },
    });
    expect((await createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k)).id).toBe(q.id);
    await expect(
      createCheckoutQuote(db(), d.owner, d.id, { revision: '3' }, k),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const ackKey = key();
    const ack = { revision: '3', fingerprint: q.fingerprint };
    expect(await acknowledgeCheckoutQuote(db(), d.owner, d.id, q.id, ack, ackKey)).toMatchObject({
      acknowledged: true,
      reviewRequired: false,
    });
    await expect(
      sql`update orders.checkout_quotes set shipping=1 where id=${q.id}`.execute(db()),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`delete from orders.checkout_quote_lines where quote_id=${q.id}`.execute(db()),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`insert into orders.checkout_quote_lines select organization_id,draft_id,quote_id,uuidv7(),variant_id,product_id,title,sku,quantity,price_definition_id,unit_price,gross,discount,net from orders.checkout_quote_lines where quote_id=${q.id}`.execute(
        db(),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const facts =
      await sql`select (select count(*)::int from orders.orders) orders,(select count(*)::int from inventory.inventory_reservations) reservations,
      (select count(*)::int from payments.payment_intents) payments,(select count(*)::int from promotions.promotion_usage) redemptions,
      (select count(*)::int from cart.carts where status='CONVERTED') conversions,
      (select count(*)::int from finance.finance_transactions) postings,
      (select count(*)::int from analytics.storefront_events where event_name in ('ORDER_PLACED','PAYMENT_CONFIRMED')) events`.execute(
        db(),
      );
    expect(facts.rows[0]).toEqual({
      orders: 0,
      reservations: 0,
      payments: 0,
      redemptions: 0,
      conversions: 0,
      postings: 0,
      events: 0,
    });
  });
  it('uses the same merchandise evaluator for Cart and Buy Now and rejects changed complete-Cart intent', async () => {
    await promotion();
    const cart = await createGuestCart(db(), context());
    const changed = await addGuestCartLine(db(), {
      token: cart.token,
      variantId: f.variantId,
      quantity: '2',
      expectedVersion: cart.cart.version,
    });
    const d = await ready({ id: changed.id, revision: changed.intentRevision, token: cart.token });
    const a = await quote(d),
      b = await quote(await ready());
    expect([a.facts.merchandiseSubtotal, a.facts.discountTotal, a.facts.evaluatedTotal]).toEqual([
      b.facts.merchandiseSubtotal,
      b.facts.discountTotal,
      b.facts.evaluatedTotal,
    ]);
    await setGuestCartLineQuantity(db(), {
      token: cart.token,
      lineId: changed.lines[0]!.id,
      quantity: '3',
      expectedVersion: changed.version,
    });
    expect(await getCheckoutQuote(db(), d.owner, d.id, a.id, cart.token)).toMatchObject({
      status: 'INVALIDATED',
      issues: ['SOURCE_CHANGED'],
    });
    await expect(
      createCheckoutQuote(db(), d.owner, d.id, { revision: a.draftRevision }, key(), cart.token),
    ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect((await getGuestCart(db(), cart.token)).lines[0]!.quantity).toBe('3.000000');
  });
  it('evaluates limited coupons without consuming usage; expiry, targeting and minimum spend remove benefits', async () => {
    const p = await promotion('COUPON');
    const c = await createCouponCode(db(), {
      organizationId: f.organizationId,
      actorId: f.actorId,
      promotionId: p.id,
      code: 'LAST',
      usageLimitTotal: 1,
    });
    const a = await ready(),
      b = await ready();
    const results = await Promise.all([quote(a, ['LAST']), quote(b, ['LAST'])]);
    expect(results.map((q) => q.facts.discountTotal)).toEqual(['20.0000', '20.0000']);
    expect(
      (
        await sql`select id from promotions.promotion_usage where coupon_code_id=${c.id}`.execute(
          db(),
        )
      ).rows,
    ).toHaveLength(0);
    await sql`update promotions.promotions set ends_at=transaction_timestamp()-interval '1 second' where id=${p.id}`.execute(
      db(),
    );
    const invalid = await getCheckoutQuote(db(), a.owner, a.id);
    expect(invalid?.status).toBe('INVALIDATED');
    const newer = await createCheckoutQuote(
      db(),
      a.owner,
      a.id,
      { revision: '3', couponCodes: ['LAST'] },
      key(),
    );
    expect(newer.facts.coupons).toEqual([{ code: 'LAST', status: 'NO_CURRENT_BENEFIT' }]);
    expect(newer.facts.discountTotal).toBe('0.0000');
    await sql`update promotions.promotions set ends_at=null where id=${p.id}`.execute(db());
    await sql`update promotions.promotion_revisions set minimum_merchandise_subtotal=250 where id=${p.revisionId}`.execute(
      db(),
    );
    const other = await quote(await ready(), ['LAST']);
    expect(other.facts.discountTotal).toBe('0.0000');
    await sql`update promotions.promotion_revisions set minimum_merchandise_subtotal=null where id=${p.revisionId}`.execute(
      db(),
    );
    const excluded = (
      await sql<{
        id: string;
      }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature) values(${f.organizationId},${f.productId},'EXCLUDED','EXCLUDED','excluded') returning id`.execute(
        db(),
      )
    ).rows[0]!.id;
    await sql`insert into promotions.promotion_target_variants(organization_id,promotion_revision_id,variant_id)
      values(${f.organizationId},${p.revisionId},${excluded})`.execute(db());
    expect((await quote(await ready(), ['LAST'])).facts.discountTotal).toBe('0.0000');
  });
  it('invalidates changed delivery, stock, price and equal-total configuration without changing old facts', async () => {
    const d = await ready();
    const q = await quote(d);
    await sql`update pricing.price_definitions set version=version+1 where variant_id=${f.variantId}`.execute(
      db(),
    );
    expect(await getCheckoutQuote(db(), d.owner, d.id)).toMatchObject({
      status: 'INVALIDATED',
      issues: ['CONFIGURATION_CHANGED'],
      facts: q.facts,
    });
    await sql`update inventory.inventory_levels set sellable_quantity=0 where organization_id=${f.organizationId}`.execute(
      db(),
    );
    expect(await getCheckoutQuote(db(), d.owner, d.id)).toMatchObject({
      status: 'INVALIDATED',
      issues: ['INSUFFICIENT_STOCK'],
    });
    await sql`update inventory.inventory_levels set sellable_quantity=40 where organization_id=${f.organizationId}`.execute(
      db(),
    );
    await updateCheckoutDelivery(
      db(),
      d.owner,
      d.id,
      { revision: '3', delivery: { ...contact(), addressLine1: 'Explicit new destination' } },
      key(),
    );
    expect(await getCheckoutQuote(db(), d.owner, d.id)).toMatchObject({
      status: 'INVALIDATED',
      issues: ['DELIVERY_CHANGED'],
    });
    await expect(
      acknowledgeCheckoutQuote(
        db(),
        d.owner,
        d.id,
        q.id,
        { revision: '4', fingerprint: q.fingerprint },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    const newer = await createCheckoutQuote(db(), d.owner, d.id, { revision: '4' }, key());
    expect(newer.changes).toContain('DELIVERY');
    expect(await getCheckoutQuote(db(), d.owner, d.id, q.id)).toMatchObject({
      status: 'SUPERSEDED',
      facts: q.facts,
    });
  });
  it('fails closed on revoked coverage/method/publication and requires explicit delivery configuration review', async () => {
    const d = await ready();
    const q = await quote(d);
    await sql`update orders.delivery_pricing_rules set flat_amount=10,version=version+1 where id=${rule}`.execute(
      db(),
    );
    await expect(
      createCheckoutQuote(db(), d.owner, d.id, { revision: '3' }, key()),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_CHANGED' });
    await updateCheckoutDelivery(
      db(),
      d.owner,
      d.id,
      { revision: '3', action: 'REVALIDATE' },
      key(),
    );
    const next = await createCheckoutQuote(db(), d.owner, d.id, { revision: '4' }, key());
    expect(next.facts.shipping).toBe('10.0000');
    await sql`update orders.delivery_pricing_rules set checkout_serviceability='UNVERIFIED' where id=${rule}`.execute(
      db(),
    );
    expect((await getCheckoutQuote(db(), d.owner, d.id))?.issues).toContain('UNSUPPORTED_AREA');
    await sql`update orders.delivery_pricing_rules set checkout_serviceability='SUPPORTED' where id=${rule}`.execute(
      db(),
    );
    await sql`update delivery.delivery_methods set status='DISABLED' where organization_id=${f.organizationId}`.execute(
      db(),
    );
    expect((await getCheckoutQuote(db(), d.owner, d.id))?.issues).toContain('DELIVERY_UNAVAILABLE');
    await sql`update delivery.delivery_methods set status='ACTIVE' where organization_id=${f.organizationId}`.execute(
      db(),
    );
    await sql`update catalog.products set publication_status='UNPUBLISHED' where id=${f.productId}`.execute(
      db(),
    );
    expect((await getCheckoutQuote(db(), d.owner, d.id))?.issues).toContain('VARIANT_UNAVAILABLE');
    expect((await getCheckoutQuote(db(), d.owner, d.id, q.id))?.status).toBe('SUPERSEDED');
  });
  it('serializes two tabs, recovers simultaneous same-key requests, and fences source edits and guest revocation', async () => {
    const d = await ready();
    const k = key();
    const replay = await Promise.all(
      Array.from({ length: 3 }, () =>
        createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k),
      ),
    );
    expect(new Set(replay.map((q) => q.id)).size).toBe(1);
    const race = await Promise.allSettled([
      createCheckoutQuote(db(), d.owner, d.id, { revision: '3' }, key()),
      updateCheckoutDraft(
        db(),
        context(),
        d.owner,
        d.id,
        { revision: '3', source: { kind: 'BUY_NOW', variantId: f.variantId, quantity: '3' } },
        key(),
      ),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((race.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe(
      'STALE_REVISION',
    );
    await revokeCheckoutGuestSession(
      db(),
      d.owner as Extract<CheckoutAuthority, { kind: 'GUEST' }>,
    );
    await expect(
      createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('observes one commercial snapshot despite price updates and inserted promotion/rate phantoms between reads', async () => {
    const d = await ready();
    const seen = signal(),
      resume = signal();
    const queries = new Set<QueryId>();
    let once = false;
    const plugin: KyselyPlugin = {
      transformQuery(args) {
        const n = args.node as unknown as { sqlFragments?: string[] };
        if (!once && n.sqlFragments?.join('').includes('select distinct on (variant_id)'))
          queries.add(args.queryId);
        return args.node;
      },
      async transformResult(args) {
        if (!once && queries.has(args.queryId)) {
          once = true;
          seen.release();
          await resume.promise;
        }
        return args.result;
      },
    };
    const pending = createCheckoutQuote(
      db().withPlugin(plugin),
      d.owner,
      d.id,
      { revision: '2' },
      key(),
    );
    await seen.promise;
    try {
      await setCurrentVariantPrice(db(), {
        ...context(),
        actorId: f.actorId,
        variantId: f.variantId,
        amount: '200',
      });
      await promotion();
      await sql`insert into orders.delivery_pricing_rules(organization_id,name,country_code,geography_node_id,flat_amount,currency_code,priority,checkout_serviceability)
        values(${f.organizationId},'Inserted higher priority','BD',${area},70,'BDT',100,'SUPPORTED')`.execute(
        db(),
      );
    } finally {
      resume.release();
    }
    const q = await pending;
    expect(q.facts).toMatchObject({
      merchandiseSubtotal: '200.0000',
      discountTotal: '0.0000',
      shipping: '0.0000',
    });
    expect((await getCheckoutQuote(db(), d.owner, d.id))?.status).toBe('INVALIDATED');
    await updateCheckoutDelivery(
      db(),
      d.owner,
      d.id,
      { revision: '3', action: 'REVALIDATE' },
      key(),
    );
    const latest = await createCheckoutQuote(db(), d.owner, d.id, { revision: '4' }, key());
    expect(latest.facts).toMatchObject({
      merchandiseSubtotal: '400.0000',
      discountTotal: '40.0000',
      shipping: '70.0000',
    });
  });

  it('expires by the database clock during acknowledgement and recovers accepted intents after expiry', async () => {
    const d = await ready();
    await sql`update orders.checkout_drafts set expires_at=clock_timestamp()+interval '500 milliseconds' where id=${d.id}`.execute(
      db(),
    );
    const k = key();
    const q = await createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k);
    const seen = signal(),
      resume = signal();
    let paused = false;
    const plugin: KyselyPlugin = {
      transformQuery(a) {
        return a.node;
      },
      async transformResult(a) {
        if (!paused && a.result.rows.some((r) => r && typeof r === 'object' && 'configured' in r)) {
          paused = true;
          seen.release();
          await resume.promise;
        }
        return a.result;
      },
    };
    const pending = acknowledgeCheckoutQuote(
      db().withPlugin(plugin),
      d.owner,
      d.id,
      q.id,
      { revision: '3', fingerprint: q.fingerprint },
      key(),
    );
    await seen.promise;
    await sql`select pg_sleep(0.6)`.execute(db());
    resume.release();
    await expect(pending).rejects.toMatchObject({
      code: expect.stringMatching(/QUOTE_EXPIRED|DRAFT_EXPIRED/),
    });
    const replay = await createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k);
    expect(replay).toMatchObject({
      id: q.id,
      status: 'EXPIRED',
      acknowledged: false,
      reviewRequired: true,
    });
  });
  it('rolls back quote lines, current pointer, revision and receipt together on a failed durable receipt write', async () => {
    const d = await ready(),
      k = key();
    await sql`create function orders.synthetic_quote_failure() returns trigger language plpgsql as $$ begin
      if new.operation_type='checkout.foundation.quote.create' and new.status='SUCCEEDED' then raise exception 'synthetic quote failure';end if;return new;end $$;
      create trigger synthetic_quote_failure before update on platform.idempotency_records for each row execute function orders.synthetic_quote_failure()`.execute(
      db(),
    );
    try {
      await expect(createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k)).rejects.toThrow(
        'synthetic quote failure',
      );
    } finally {
      await sql`drop trigger synthetic_quote_failure on platform.idempotency_records;drop function orders.synthetic_quote_failure()`.execute(
        db(),
      );
    }
    expect(
      (await sql`select id from orders.checkout_quotes where draft_id=${d.id}`.execute(db())).rows,
    ).toHaveLength(0);
    expect(
      (
        await sql<{
          revision: string;
          current_quote_id: null;
        }>`select revision::text,current_quote_id from orders.checkout_drafts where id=${d.id}`.execute(
          db(),
        )
      ).rows[0],
    ).toEqual({ revision: '2', current_quote_id: null });
    expect((await createCheckoutQuote(db(), d.owner, d.id, { revision: '2' }, k)).status).toBe(
      'CURRENT',
    );
  });
  it('enforces tenant ownership and exact header/line/allocation equations on direct persistence attempts', async () => {
    const d = await ready(),
      q = await quote(d),
      foreign = await ready();
    const copy = async (tenant: string, withLines: boolean) =>
      db()
        .transaction()
        .execute(async (tx) => {
          const inserted = (
            await sql<{
              id: string;
            }>`insert into orders.checkout_quotes(organization_id,draft_id,draft_revision,source_kind,currency_code,evaluated_at,expires_at,fingerprint,
        merchandise_subtotal,discount_total,shipping,evaluated_total,snapshot,discounts,coupons,changes)
        select ${tenant},draft_id,draft_revision+100,source_kind,currency_code,evaluated_at,expires_at,fingerprint,
        merchandise_subtotal,discount_total,shipping,evaluated_total,snapshot,discounts,coupons,changes from orders.checkout_quotes where id=${q.id} returning id`.execute(
              tx,
            )
          ).rows[0]!.id;
          if (withLines)
            await sql`insert into orders.checkout_quote_lines
        select organization_id,draft_id,${inserted}::uuid,id,variant_id,product_id,title,sku,quantity,price_definition_id,unit_price,gross,1,gross-1
        from orders.checkout_quote_lines where quote_id=${q.id}`.execute(tx);
        });
    await expect(copy(key(), false)).rejects.toMatchObject({ code: '23503' });
    await expect(copy(f.organizationId, false)).rejects.toMatchObject({ code: '23514' });
    await expect(copy(f.organizationId, true)).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`update orders.checkout_drafts set current_quote_id=${q.id} where id=${foreign.id}`.execute(
        db(),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('measures batched quotation for 1, 5, 20 and 100 lines without per-line SELECTs', async () => {
    const ptype = (
      await sql<{
        product_type_id: string;
      }>`select product_type_id from catalog.products where id=${f.productId}`.execute(db())
    ).rows[0]!.product_type_id;
    await sql`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
      select ${f.organizationId},${ptype},'quote-stress-'||n,'Synthetic stress','ACTIVE','PUBLISHED',now() from generate_series(1,100) n`.execute(
      db(),
    );
    await sql`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
      select organization_id,id,handle,upper(handle),'default' from catalog.products where organization_id=${f.organizationId} and handle like 'quote-stress-%'`.execute(
      db(),
    );
    await sql`insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount,effective_from)
      select organization_id,id,'BDT',10,now()-interval '1 minute' from catalog.product_variants where organization_id=${f.organizationId} and sku like 'quote-stress-%'`.execute(
      db(),
    );
    await sql`insert into inventory.inventory_items(organization_id,variant_id)
      select organization_id,id from catalog.product_variants where organization_id=${f.organizationId} on conflict(variant_id) do nothing`.execute(
      db(),
    );
    await sql`insert into inventory.inventory_levels(organization_id,inventory_item_id,location_id,sellable_quantity)
      select i.organization_id,i.id,l.id,10 from inventory.inventory_items i join warehouse.locations l on l.organization_id=i.organization_id
      where i.organization_id=${f.organizationId} on conflict do nothing`.execute(db());
    await promotion();
    const results = [];
    for (const n of [1, 5, 20, 100]) {
      const cart = await createGuestCart(db(), context());
      await sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity)
        select organization_id,${cart.cart.id},id,1 from catalog.product_variants where organization_id=${f.organizationId} and sku like 'quote-stress-%' order by id limit ${n}`.execute(
        db(),
      );
      const d = await ready({ id: cart.cart.id, revision: '1', token: cart.token });
      const samples: number[] = [],
        counts: number[] = [];
      for (let sample = 0; sample < 8; sample++) {
        let queries = 0;
        const plugin: KyselyPlugin = {
          transformQuery(a) {
            queries++;
            return a.node;
          },
          async transformResult(a) {
            return a.result;
          },
        };
        const start = performance.now();
        const q = await createCheckoutQuote(
          db().withPlugin(plugin),
          d.owner,
          d.id,
          { revision: String(sample + 2) },
          key(),
          cart.token,
        );
        samples.push(performance.now() - start);
        counts.push(queries);
        expect(q.facts.lines).toHaveLength(n);
      }
      samples.sort((a, b) => a - b);
      results.push({ lines: n, queries: counts, p50: samples[3], p95: samples[7] });
    }
    expect(new Set(results.map((r) => r.queries[0])).size).toBe(1);
    console.info('CHECKOUT_QUOTE_SYNTHETIC_PERFORMANCE', JSON.stringify(results));
    const plan =
      await sql`explain (analyze,buffers,format json) select * from orders.checkout_quotes where organization_id=${f.organizationId} and draft_id=${key()} order by draft_revision desc limit 1`.execute(
        db(),
      );
    console.info('CHECKOUT_QUOTE_LOOKUP_PLAN', JSON.stringify(plan.rows));
    if (process.env.CHECKOUT_QUOTE_BENCHMARK_PATH)
      await writeFile(
        process.env.CHECKOUT_QUOTE_BENCHMARK_PATH,
        JSON.stringify({ results, plan: plan.rows }, null, 2),
      );
  }, 60000);
  it('denies wrong owners, tenant swaps, expired drafts, forged fingerprints and read-committed evaluation', async () => {
    const d = await ready(),
      q = await quote(d),
      other = await ready();
    await expect(getCheckoutQuote(db(), other.owner, d.id, q.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      getCheckoutQuote(db(), { ...d.owner, organizationId: key() }, d.id, q.id),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(
      acknowledgeCheckoutQuote(
        db(),
        d.owner,
        d.id,
        q.id,
        { revision: '3', fingerprint: 'x'.repeat(43) },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    await expect(
      checkoutTransaction(db(), async (tx) => {
        await lockCheckoutAuthority(tx, d.owner);
        return evaluateCheckoutInTransaction(tx, d.owner, await ownedDraft(tx, d.owner, d.id), []);
      }),
    ).rejects.toThrow('coherent snapshot');
    await sql`update orders.checkout_drafts set expires_at=clock_timestamp()-interval '1 second' where id=${d.id}`.execute(
      db(),
    );
    expect((await getCheckoutQuote(db(), d.owner, d.id))?.issues).toContain('DRAFT_EXPIRED');
    await expect(
      createCheckoutQuote(db(), d.owner, d.id, { revision: '3' }, key()),
    ).rejects.toMatchObject({ code: 'DRAFT_EXPIRED' });
  });
});

describe('exact money and allocation boundaries', () => {
  it('preserves zero and numeric(20,4) limits and rejects coercion, truncation and overflow', () => {
    expect(money(parseMoney('0'))).toBe('0.0000');
    expect(money(parseMoney('9999999999999999.9999'))).toBe('9999999999999999.9999');
    for (const v of ['-1', 'NaN', '1e2', '0.00001', '10000000000000000', '1.2.3'])
      expect(() => parseMoney(v)).toThrow();
    expect(() => money(parseMoney('9999999999999999.9999') * 2n)).toThrow();
  });
  it('allocates residual units deterministically and conserves amounts across shuffled lines', () => {
    const lines = [
      { lineId: 'c', gross: '0.3333' },
      { lineId: 'b', gross: '0.3333' },
      { lineId: 'a', gross: '0.3333' },
    ];
    const result = allocateDiscount('0.0002', lines);
    expect(result).toEqual([
      { lineId: 'a', amount: '0.0001' },
      { lineId: 'b', amount: '0.0001' },
      { lineId: 'c', amount: '0.0000' },
    ]);
    expect(allocateDiscount('0.0002', [...lines].reverse())).toEqual(result);
    for (let i = 0; i < 100; i++) {
      const d = money(BigInt(i) * 77n);
      const allocation = allocateDiscount(d, lines);
      expect(allocation.reduce((s, a) => s + parseMoney(a.amount), 0n)).toBe(parseMoney(d));
    }
  });
});

describe('Phase 03A populated 3220 upgrade', () => {
  it('preserves legacy Orders, draft ownership and delivery-compatible addresses', async () => {
    const isolated = await isolatedCartDatabase();
    try {
      const previous = await new Migrator({
        db: isolated.database.db,
        provider: migrationProvider,
      }).migrateTo('3220_checkout_delivery');
      if (previous.error) throw previous.error;
      const fixture = await cartFixture(isolated.database);
      await checkoutDeliveryUpgradeCase.before(isolated.database.db, fixture.organizationId);
      expect((await runMigrations(isolated.database.db)).executed).toEqual([
        '3221_checkout_quotes',
        '3222_manual_payment_integrity',
        '3223_checkout_placement',
        '3224_commerce_measurement',
        '3225_privacy_preferences',
        '3226_retail_money_settlement',
      ]);
      await checkoutDeliveryUpgradeCase.after(isolated.database.db, fixture.organizationId);
      expect(
        (
          await sql`select id from orders.checkout_drafts where current_quote_id is not null`.execute(
            isolated.database.db,
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await isolated.close();
    }
  }, 60000);
});
