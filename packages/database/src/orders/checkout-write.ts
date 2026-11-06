import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import type { CheckoutFinalTermsDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { nextOrderNumber } from './placement.js';
import { normalizeCustomerPhone } from '../customer-identities.js';
import { allocateCheckoutOrderLines } from '../inventory-order-allocation.js';
import { redeemOrderPromotionsInTransaction } from '../promotions-redemption.js';
import type { Evaluation } from '../checkout/final-terms.js';

type Tx = Transaction<DatabaseSchema>;
export type PlacementCheckpoint =
  'order' | 'inventory' | 'promotion' | 'payment' | 'cart' | 'outbox';

export async function writeCheckoutOrder(
  tx: Tx,
  input: {
    organizationId: string;
    draftId: string;
    customerId: string;
    actorId: string;
    actorType: 'USER' | 'GUEST_CHECKOUT';
    evaluation: Evaluation;
    terms: CheckoutFinalTermsDto;
    fault?: (stage: PlacementCheckpoint) => void | Promise<void>;
  },
) {
  const { organizationId: org, customerId, actorId, evaluation, terms, fault } = input;
  const { delivery: d, tariff, facts, savedAddress } = evaluation;
  const orderNumber = await nextOrderNumber(tx, org);
  const orderId = (
    await sql<{ id: string }>`
    insert into orders.orders(organization_id,checkout_draft_id,order_number,customer_id,source,currency_code,order_status,
      payment_method,subtotal_amount,discount_amount,delivery_amount,tax_amount,total_amount)
    values(${org},${input.draftId},${orderNumber},${customerId},'STOREFRONT','BDT','PENDING',${terms.method},
      ${terms.merchandiseSubtotal}::numeric,${terms.discountTotal}::numeric,${terms.shipping}::numeric,
      ${terms.tax}::numeric,${terms.payable}::numeric) returning id`.execute(tx)
  ).rows[0]!.id;
  await fault?.('order');
  await sql`insert into orders.order_customer_snapshots(order_id,organization_id,customer_id,display_name,phone,normalized_phone)
    values(${orderId},${org},${customerId},${d.recipientName},${d.mobile},${normalizeCustomerPhone(d.mobile)})`.execute(
    tx,
  );
  await sql`insert into orders.order_addresses(organization_id,order_id,source_customer_address_id,geography_node_id,
    recipient_name,phone,address_line_1,address_line_2,country_code)
    values(${org},${orderId},${savedAddress?.id ?? null},${d.geographyNodeId},${d.recipientName},${d.mobile},
      ${d.addressLine1},${d.addressLine2 ?? null},${d.countryCode})`.execute(tx);
  await sql`insert into orders.order_delivery_pricing_snapshots(order_id,organization_id,delivery_pricing_rule_id,
    rule_name_snapshot,country_code_snapshot,geography_node_id,amount,currency_code)
    select ${orderId},${org},id,name,${d.countryCode},${d.geographyNodeId},${terms.shipping}::numeric,'BDT'
    from orders.delivery_pricing_rules where organization_id=${org} and id=${tariff.ruleId}`.execute(
    tx,
  );
  const lines = facts.lines.map((line) => ({ ...line, draftLineId: line.id, id: randomUUID() }));
  await sql`insert into orders.order_lines(id,organization_id,order_id,product_id,variant_id,quantity,
    sku_snapshot,product_title_snapshot,unit_price,gross_amount,discount_amount,net_amount)
    values ${sql.join(
      lines.map(
        (l) => sql`(${l.id},${org},${orderId},${l.productId},${l.variantId},${l.quantity}::numeric,
      ${l.sku},${l.title},${l.unitPrice}::numeric,${l.gross}::numeric,${l.discount}::numeric,${l.net}::numeric)`,
      ),
    )}`.execute(tx);

  const allocations = await allocateCheckoutOrderLines(tx, {
    organizationId: org,
    actorId,
    actorType: input.actorType,
    lines,
  });
  const allocationRows = sql.join(
    allocations.map(
      (a) => sql`(${a.lineId}::uuid,${a.inventoryItemId}::uuid,${a.reservationId}::uuid)`,
    ),
  );
  await sql`update orders.order_lines l set inventory_item_id=a.item_id
    from (values ${allocationRows}) a(line_id,item_id,reservation_id)
    where l.organization_id=${org} and l.order_id=${orderId} and l.id=a.line_id`.execute(tx);
  await sql`insert into orders.order_inventory_reservations(organization_id,order_id,order_line_id,reservation_id)
    select ${org},${orderId},a.line_id,a.reservation_id
    from (values ${allocationRows}) a(line_id,item_id,reservation_id)`.execute(tx);
  await fault?.('inventory');

  await redeemOrderPromotionsInTransaction(tx, {
    organizationId: org,
    customerId,
    orderId,
    calculations: facts.discounts,
  });
  if (facts.discounts.length) {
    const discounts = facts.discounts.map((p) => ({ ...p, id: randomUUID() }));
    await sql`insert into orders.order_discount_applications(id,organization_id,order_id,promotion_id,
      promotion_revision_id,coupon_code_id,promotion_name_snapshot,coupon_code_snapshot,benefit_type_snapshot,
      benefit_value_snapshot,discount_amount)
      select a.id,${org},${orderId},p.id,r.id,c.id,p.name,c.normalized_code,r.benefit_type,r.benefit_value,a.amount
      from (values ${sql.join(
        discounts.map(
          (p) => sql`(${p.id}::uuid,${p.promotionId}::uuid,${p.revisionId}::uuid,
        ${p.couponCodeId}::uuid,${p.discount}::numeric)`,
        ),
      )}) a(id,promotion_id,revision_id,coupon_id,amount)
      join promotions.promotions p on p.organization_id=${org} and p.id=a.promotion_id
      join promotions.promotion_revisions r on r.promotion_id=p.id and r.id=a.revision_id
      left join promotions.coupon_codes c on c.organization_id=p.organization_id and c.id=a.coupon_id`.execute(
      tx,
    );
    const lineIds = new Map(lines.map((l) => [l.draftLineId, l.id]));
    const splits = discounts.flatMap((p) =>
      p.allocations.map((a) => sql`(${org},${p.id},${lineIds.get(a.lineId)},${a.amount}::numeric)`),
    );
    if (splits.length)
      await sql`insert into orders.order_discount_allocations(organization_id,
      discount_application_id,order_line_id,discount_amount) values ${sql.join(splits)}`.execute(
        tx,
      );
  }
  await fault?.('promotion');
  return { orderId, orderNumber };
}
