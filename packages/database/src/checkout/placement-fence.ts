import { sql, type Transaction } from 'kysely';
import type { DatabaseSchema } from '../index.js';

const fenced = new WeakSet<Transaction<DatabaseSchema>>();
export const hasPlacementFence = (tx: Transaction<DatabaseSchema>) => fenced.has(tx);

/**
 * Deliberate development fence: SHARE conflicts with every config DML writer, including inserts.
 * Place before commercial reads. Placements share these locks; stock and coupon usage are
 * intentionally excluded and serialized by their own writers. Measure before public use.
 */
export async function lockPlacementConfiguration(tx: Transaction<DatabaseSchema>) {
  await sql`lock table catalog.product_categories, catalog.product_option_axes,
    catalog.product_option_values, catalog.product_variants, catalog.products,
    catalog.variant_option_values, customers.customer_addresses, customers.customer_aliases,
    customers.customer_restrictions, delivery.delivery_methods, finance.financial_accounts, geography.nodes,
    orders.delivery_pricing_rules, payments.operating_policy_revisions, payments.payment_methods,
    payments.receiving_destinations, platform.operational_controls, platform.organizations, pricing.price_definitions,
    promotions.coupon_codes, promotions.promotion_revisions, promotions.promotion_target_categories,
    promotions.promotion_target_products, promotions.promotion_target_variants, promotions.promotions,
    warehouse.location_capabilities, warehouse.locations in share mode`.execute(tx);
  fenced.add(tx);
}
