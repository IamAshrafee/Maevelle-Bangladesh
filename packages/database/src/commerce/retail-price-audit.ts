import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { wholeBdtAmount } from './retail-money.js';

/** Prepared authoring rule. Do not apply to procurement/valuation, percentages or retained historical prices. */
export function validateRetailBdtAuthoring(input: {
  kind: 'REGULAR_PRICE' | 'OFFER_PRICE' | 'MANUAL_DISCOUNT' | 'CAMPAIGN_FIXED_AMOUNT' | 'SHIPPING';
  amount: string;
}) {
  return { ...input, amount: wholeBdtAmount(input.amount) };
}
/** Read-only, paginated normalization inventory; never rewrites prices or commercial history. */
export async function auditFractionalRetailPrices(
  db: Kysely<DatabaseSchema>,
  org: string,
  page = 1,
  pageSize = 50,
) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new Error('Invalid pagination');
  const candidates = sql`
    select 'SELLING_PRICE' source,id,amount from pricing.price_definitions where organization_id=${org} and currency_code='BDT' and mod(amount,1)<>0
    union all select 'COMPARE_AT',id,compare_at_amount from pricing.price_definitions where organization_id=${org} and currency_code='BDT' and mod(compare_at_amount,1)<>0
    union all select 'SHIPPING',id,flat_amount from orders.delivery_pricing_rules where organization_id=${org} and currency_code='BDT' and mod(flat_amount,1)<>0`;
  const [rows, count] = await Promise.all([
    sql<{
      source: string;
      id: string;
      amount: string;
    }>`select source,id,amount::text from (${candidates}) candidates
      order by source,id limit ${pageSize} offset ${(page - 1) * pageSize}`.execute(db),
    sql<{ total: string }>`select count(*)::text total from (${candidates}) candidates`.execute(db),
  ]);
  const identities = await sql<{
    id: string;
    productId: string;
    variantId: string;
    title: string;
    status: string;
  }>`
    select d.id,v.product_id as "productId",v.id as "variantId",p.title,d.status
    from pricing.price_definitions d join catalog.product_variants v on v.organization_id=d.organization_id and v.id=d.variant_id
    join catalog.products p on p.organization_id=v.organization_id and p.id=v.product_id
    where d.organization_id=${org} and d.id=any(${rows.rows.filter((r) => r.source !== 'SHIPPING').map((r) => r.id)}::uuid[])`.execute(
    db,
  );
  const byId = new Map(identities.rows.map((r) => [r.id, r]));
  return {
    items: rows.rows.map(({ source, id, amount }) => {
      const p = source === 'SHIPPING' ? undefined : byId.get(id);
      return {
        source,
        id,
        amount,
        productId: p?.productId ?? null,
        variantId: p?.variantId ?? null,
        title: p?.title ?? 'Customer shipping charge',
        status: p?.status ?? 'REVIEW_REQUIRED',
      };
    }),
    page,
    pageSize,
    total: Number(count.rows[0]!.total),
    activation: 'PREPARED_NOT_ENFORCED_ON_LEGACY_AUTHORING' as const,
  };
}
