import { sql, type Kysely } from 'kysely';
import type { CartActivityBreakdown, CartActivityTotals } from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';

/** Internal read model. Callers must authorize Analytics access for the organization. */
export async function getCartActivity(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  period: { readonly from: Date; readonly to: Date },
): Promise<CartActivityTotals & { readonly breakdown: readonly CartActivityBreakdown[] }> {
  const duration = period.to.getTime() - period.from.getTime();
  if (!(duration > 0 && duration <= 366 * 86_400_000))
    throw new Error('Invalid Cart activity period');

  type ReportRow = CartActivityBreakdown | (CartActivityTotals & { operation: null });
  const result = await sql<ReportRow>`
    select operation,owner,wishlist_action as "wishlistAction",currency,
      count(*)::text as mutations,count(distinct cart_id)::text as "distinctCarts",
      coalesce(sum(unit_delta),0)::text as "netUnitChange"
    from analytics.cart_mutations
    where organization_id=${organizationId} and occurred_at>=${period.from} and occurred_at<${period.to}
    group by grouping sets ((),(operation,owner,wishlist_action,currency))
    order by operation nulls first,owner,wishlist_action,currency
  `.execute(db);
  const [totals, ...breakdown] = result.rows;
  return {
    mutations: totals!.mutations,
    distinctCarts: totals!.distinctCarts,
    breakdown: breakdown.filter((row): row is CartActivityBreakdown => row.operation !== null),
  };
}
