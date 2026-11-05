import { isDeepStrictEqual } from 'node:util';
import { sql, type Transaction } from 'kysely';
import type { CheckoutQuoteDto, CheckoutQuoteFactsDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import type { QuoteSnapshot } from './quote-evaluation.js';
import { CheckoutError } from './types.js';

export interface StoredQuote {
  id: string;
  draft_id: string;
  draft_revision: string;
  source_kind: 'CART' | 'BUY_NOW';
  source_cart_id: string | null;
  source_revision: string | null;
  currency_code: string;
  evaluated_at: Date;
  expires_at: Date;
  fingerprint: string;
  merchandise_subtotal: string;
  discount_total: string;
  shipping: string;
  evaluated_total: string;
  snapshot: QuoteSnapshot;
  discounts: CheckoutQuoteFactsDto['discounts'];
  coupons: CheckoutQuoteFactsDto['coupons'];
  previous_quote_id: string | null;
  changes: CheckoutQuoteDto['changes'];
}
export async function loadQuote(
  tx: Transaction<DatabaseSchema>,
  organizationId: string,
  draftId: string,
  id: string,
) {
  const result = await sql<StoredQuote>`select *,draft_revision::text,source_revision::text,
    merchandise_subtotal::text,discount_total::text,shipping::text,evaluated_total::text
    from orders.checkout_quotes where organization_id=${organizationId} and draft_id=${draftId} and id=${id}`.execute(
    tx,
  );
  if (!result.rows[0]) throw new CheckoutError('NOT_FOUND', 'Checkout quote was not found.');
  return result.rows[0];
}
export async function quoteFacts(
  tx: Transaction<DatabaseSchema>,
  organizationId: string,
  q: StoredQuote,
): Promise<CheckoutQuoteFactsDto> {
  const lines = await sql<
    CheckoutQuoteFactsDto['lines'][number]
  >`select id,variant_id as "variantId",product_id as "productId",title,sku,
    quantity::text,price_definition_id as "priceDefinitionId",unit_price::text as "unitPrice",gross::text,discount::text,net::text
    from orders.checkout_quote_lines where organization_id=${organizationId} and quote_id=${q.id} order by id`.execute(
    tx,
  );
  return {
    currency: q.currency_code,
    lines: lines.rows,
    discounts: q.discounts,
    coupons: q.coupons,
    merchandiseSubtotal: q.merchandise_subtotal,
    discountTotal: q.discount_total,
    shipping: q.shipping,
    evaluatedTotal: q.evaluated_total,
    tax: null,
    paymentFees: null,
    payable: null,
    final: false,
  };
}
export function quoteChanges(
  previous: { facts: CheckoutQuoteFactsDto; snapshot: QuoteSnapshot } | null,
  current: { facts: CheckoutQuoteFactsDto; snapshot: QuoteSnapshot },
): CheckoutQuoteDto['changes'] {
  if (!previous) return [];
  const same = isDeepStrictEqual;
  const changes: CheckoutQuoteDto['changes'][number][] = [];
  if (!same(previous.snapshot.source, current.snapshot.source)) changes.push('SOURCE');
  if (!same(previous.snapshot.delivery, current.snapshot.delivery)) changes.push('DELIVERY');
  if (!same(previous.facts.lines, current.facts.lines)) changes.push('MERCHANDISE');
  if (
    !same(previous.facts.discounts, current.facts.discounts) ||
    !same(previous.facts.coupons, current.facts.coupons)
  )
    changes.push('DISCOUNTS');
  if (previous.facts.shipping !== current.facts.shipping) changes.push('SHIPPING');
  if (
    previous.snapshot.configuration !== current.snapshot.configuration ||
    !same(previous.snapshot.merchandise, current.snapshot.merchandise)
  )
    changes.push('CONFIGURATION');
  return changes;
}
