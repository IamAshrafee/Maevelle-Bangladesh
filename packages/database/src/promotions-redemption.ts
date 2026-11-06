import { sql, type Transaction } from 'kysely';
import type { DatabaseSchema } from './index.js';
import type { PromotionCalculation } from './promotions.js';

export class PromotionCapacityError extends Error {}

/** Both Order writers lock the same coupon rows before observing committed usage. */
export async function redeemOrderPromotionsInTransaction(
  tx: Transaction<DatabaseSchema>,
  input: {
    organizationId: string;
    customerId: string;
    orderId: string;
    calculations: readonly PromotionCalculation[];
  },
) {
  if (!input.calculations.length) return;
  const ids = [
    ...new Set(input.calculations.flatMap((p) => (p.couponCodeId ? [p.couponCodeId] : []))),
  ].sort();
  if (ids.length) {
    const locked = await sql`select id from promotions.coupon_codes
      where organization_id=${input.organizationId} and id=any(${ids}::uuid[]) and status='ACTIVE'
      order by id for update`.execute(tx);
    if (locked.rows.length !== ids.length) throw new PromotionCapacityError();
    // Separate statement so READ COMMITTED sees redemptions committed while waiting.
    const denied = await sql`select c.id from promotions.coupon_codes c
      left join promotions.promotion_usage u on u.organization_id=c.organization_id
        and u.coupon_code_id=c.id and u.status='COMMITTED'
      where c.organization_id=${input.organizationId} and c.id=any(${ids}::uuid[])
      group by c.id
      having count(u.id)>=c.usage_limit_total or
        count(u.id) filter(where u.customer_id=${input.customerId})>=c.usage_limit_per_customer`.execute(
      tx,
    );
    if (denied.rows.length) throw new PromotionCapacityError();
  }
  await sql`insert into promotions.promotion_usage(organization_id,promotion_id,promotion_revision_id,
    coupon_code_id,customer_id,order_id,discount_amount,status) values ${sql.join(
      input.calculations.map(
        (p) =>
          sql`(${input.organizationId},${p.promotionId},${p.revisionId},${p.couponCodeId},${input.customerId},${input.orderId},${p.discount}::numeric,'COMMITTED')`,
      ),
    )}`.execute(tx);
}
