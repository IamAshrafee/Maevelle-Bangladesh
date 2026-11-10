import assert from 'node:assert/strict';
import { sql } from 'kysely';
import type { UpgradeCase } from '../upgrade-cases.js';
import { cartFixture } from '../testing/cart-fixture.js';
import { checkoutDeliveryUpgradeCase } from './delivery-upgrade-case.js';
import { createGuestCart, addGuestCartLine } from '../cart.js';
import { createPromotion, createCouponCode } from '../promotions.js';

let f: Awaited<ReturnType<typeof cartFixture>>,
  cartId = '',
  snapshot = '';
const preserved = async (db: Parameters<UpgradeCase['before']>[0]) =>
  JSON.stringify(
    (
      await sql`
  select (select jsonb_agg(to_jsonb(o) order by id) from orders.orders o where organization_id=${f.organizationId}) orders,
    (select jsonb_agg(to_jsonb(d) order by id) from orders.checkout_drafts d where organization_id=${f.organizationId}) drafts,
    (select jsonb_agg(to_jsonb(a) order by id) from customers.customer_addresses a where organization_id=${f.organizationId}) addresses,
    (select jsonb_agg(to_jsonb(c) order by id) from cart.carts c where id=${cartId}) cart,
    (select jsonb_agg(to_jsonb(l) order by id) from inventory.inventory_levels l where organization_id=${f.organizationId}) stock,
    (select count(*) from promotions.coupon_codes where organization_id=${f.organizationId}) coupons,
    (select count(*) from finance.finance_transactions where organization_id=${f.organizationId}) finance,
    (select count(*) from payments.payments where organization_id=${f.organizationId}) receipts`.execute(
        db,
      )
    ).rows,
  );

/** All before records are legitimate 3220 data; no quote or placement table exists yet. */
export const checkoutQuoteUpgradeCase: UpgradeCase = {
  async before(db) {
    f = await cartFixture({ db });
    await checkoutDeliveryUpgradeCase.before(db, f.organizationId);
    const guest = await createGuestCart(db, { organizationId: f.organizationId, currency: 'BDT' });
    const cart = await addGuestCartLine(db, {
      token: guest.token,
      variantId: f.variantId,
      quantity: '2',
      expectedVersion: guest.cart.version,
      idempotencyKey: crypto.randomUUID(),
    });
    cartId = cart.id;
    const promotion = await createPromotion(db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      name: 'Pre-quote upgrade coupon',
      promotionType: 'COUPON',
      combinability: 'STACKABLE',
      benefitType: 'FIXED_AMOUNT_DISCOUNT',
      benefitValue: '1',
    });
    await createCouponCode(db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      promotionId: promotion.id,
      code: 'UPGRADE-3221',
      usageLimitTotal: 2,
    });
    snapshot = await preserved(db);
  },
  async after(db, organizationId) {
    // Ignore only the additive current_quote_id column in the comparison.
    const after = JSON.parse(await preserved(db));
    for (const row of after) for (const draft of row.drafts ?? []) delete draft.current_quote_id;
    assert.equal(JSON.stringify(after), snapshot);
    const draft = (
      await sql<{
        id: string;
      }>`select id from orders.checkout_drafts where organization_id=${f.organizationId} and guest_session_id is not null limit 1`.execute(
        db,
      )
    ).rows[0]!;
    const price = (
      await sql<{
        id: string;
        amount: string;
      }>`select id,amount::text from pricing.price_definitions where organization_id=${f.organizationId} and variant_id=${f.variantId} limit 1`.execute(
        db,
      )
    ).rows[0]!;
    await db.transaction().execute(async (tx) => {
      const quote = (
        await sql<{
          id: string;
        }>`insert into orders.checkout_quotes(organization_id,draft_id,draft_revision,source_kind,currency_code,evaluated_at,expires_at,fingerprint,merchandise_subtotal,discount_total,shipping,evaluated_total,snapshot,discounts,coupons,changes)
        values(${f.organizationId},${draft.id},1,'BUY_NOW','BDT',now(),now()+interval '10 minutes',${'q'.repeat(43)},${price.amount},0,0,${price.amount},'{}','[]','[]','{}') returning id`.execute(
          tx,
        )
      ).rows[0]!;
      await sql`insert into orders.checkout_quote_lines(organization_id,draft_id,quote_id,id,variant_id,product_id,title,sku,quantity,price_definition_id,unit_price,gross,discount,net)
        values(${f.organizationId},${draft.id},${quote.id},uuidv7(),${f.variantId},${f.productId},'Historical upgrade fixture','UPGRADE',1,${price.id},${price.amount},${price.amount},0,${price.amount})`.execute(
        tx,
      );
      await sql`update orders.checkout_drafts set current_quote_id=${quote.id} where id=${draft.id}`.execute(
        tx,
      );
    });
    await assert.rejects(
      sql`update orders.checkout_quotes set shipping=shipping where draft_id=${draft.id}`.execute(
        db,
      ),
      { code: '23514' },
    );
    await assert.rejects(
      sql`insert into orders.checkout_quotes(organization_id,draft_id,draft_revision,source_kind,currency_code,evaluated_at,expires_at,fingerprint,merchandise_subtotal,discount_total,shipping,evaluated_total,snapshot,discounts,coupons,changes)
      values(${organizationId},${draft.id},2,'BUY_NOW','BDT',now(),now()+interval '10 minutes',${'q'.repeat(43)},0,0,0,0,'{}','[]','[]','{}')`.execute(
        db,
      ),
      { code: '23503' },
    );
  },
};
