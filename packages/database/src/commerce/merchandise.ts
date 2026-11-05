import type { Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { availableToSellByVariant } from '../cart/availability.js';
import { parseMoney, money, quantity, availableWholeUnits } from '../cart/value.js';
import { resolveVariantPrices } from '../pricing.js';
import { evaluatePromotions } from '../promotions.js';

export interface MerchandiseLine {
  id: string;
  variant_id: string;
  product_id: string;
  quantity: string;
  visible: boolean;
  configured: boolean;
  category_ids: string[];
}
/** Shared merchandise authority for Cart and both Checkout sources. No redemption or stock writes. */
export async function evaluateMerchandise<T extends MerchandiseLine>(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    currency: string;
    at: string;
    lines: readonly T[];
    couponCodes: readonly string[];
    customerId?: string;
  },
) {
  if (input.lines.length > 100) throw new Error('Merchandise line limit exceeded.');
  const eligibleVariants = input.lines
    .filter((line) => line.visible && line.configured)
    .map((line) => line.variant_id);
  const [prices, stock] = await Promise.all([
    resolveVariantPrices(db, {
      organizationId: input.organizationId,
      variantIds: eligibleVariants,
      currency: input.currency,
      at: input.at,
    }),
    availableToSellByVariant(db, input.organizationId, eligibleVariants),
  ]);
  const computedLines = input.lines.map((line) => {
    const price = line.visible && line.configured ? prices.get(line.variant_id) : undefined;
    const ats = availableWholeUnits(stock.get(line.variant_id) ?? '0');
    const lineQuantity = quantity(line.quantity);
    const availability: 'UNAVAILABLE' | 'UNPRICED' | 'INSUFFICIENT_CURRENT_STOCK' | 'AVAILABLE' = !(
      line.visible && line.configured
    )
      ? 'UNAVAILABLE'
      : !price
        ? 'UNPRICED'
        : ats < lineQuantity
          ? ats === 0n
            ? 'UNAVAILABLE'
            : 'INSUFFICIENT_CURRENT_STOCK'
          : 'AVAILABLE';
    const gross = price ? money(parseMoney(price.amount) * lineQuantity) : '0.0000';
    const suggestedQuantity =
      availability === 'INSUFFICIENT_CURRENT_STOCK' ? Number(ats) : undefined;
    return { ...line, price, gross, availability, suggestedQuantity };
  });
  const calculations = await evaluatePromotions(db, {
    guestPreview: true,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    organizationId: input.organizationId,
    at: input.at,
    couponCodes: input.couponCodes,
    lines: computedLines
      .filter((line) => line.price && line.availability === 'AVAILABLE')
      .map((line) => ({
        lineId: line.id,
        variantId: line.variant_id,
        productId: line.product_id,
        categoryIds: line.category_ids,
        gross: line.gross,
      })),
  });
  return { computedLines, calculations };
}
