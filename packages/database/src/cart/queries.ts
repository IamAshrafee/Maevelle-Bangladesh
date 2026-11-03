import { CartDomainError } from './errors.js';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import type { CartView } from './types.js';
import { findCart } from './context.js';
import { availableToSellByVariant } from './availability.js';
import { parseMoney, money, quantity, availableWholeUnits, fingerprint } from './value.js';
import { resolveVariantPrices } from '../pricing.js';
import { evaluatePromotions } from '../promotions.js';
export async function getGuestCart(db: Kysely<DatabaseSchema>, token: string): Promise<CartView> {
  if (!db.isTransaction)
    return db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (tx) => {
        await sql`set local lock_timeout='2s'`.execute(tx);
        await sql`set local statement_timeout='5s'`.execute(tx);
        return getGuestCart(tx, token);
      });
  const evaluatedAt = new Date();
  const cart = await findCart(db, token);
  const lines = await sql<{
    id: string;
    variant_id: string;
    quantity: string;
    sku: string;
    product_id: string;
    product_title: string;
    eligible: boolean;
    category_ids: string[];
    product_handle: string;
    media_asset_id: string | null;
    options: { name: string; value: string }[];
  }>`
    select line.id, line.variant_id, line.quantity::text, variant.sku, product.id as product_id,
      product.title as product_title,product.handle as product_handle,
      (variant.status='ACTIVE' and product.status='ACTIVE' and product.publication_status='PUBLISHED') as eligible,
      coalesce(array_agg(category.category_id) filter (where category.category_id is not null), '{}') as category_ids,
      (select media_link.asset_id::text from catalog.product_media media_link
        join media.media_assets asset on asset.id=media_link.asset_id
        where media_link.organization_id=cart_row.organization_id and media_link.product_id=product.id
          and (media_link.variant_id=variant.id
            or (media_link.variant_id is null and media_link.option_value_id is null)
            or (media_link.variant_id is null and exists(
              select 1 from catalog.variant_option_values selected_option
              where selected_option.organization_id=cart_row.organization_id
                and selected_option.variant_id=variant.id
                and selected_option.option_value_id=media_link.option_value_id)))
          and asset.status in ('READY','ARCHIVED') and asset.visibility_class='PUBLIC'
        order by case when media_link.variant_id=variant.id then 0
          when media_link.option_value_id is not null then 1 else 2 end,
          media_link.is_primary desc,media_link.position,media_link.id limit 1) as media_asset_id,
      (select coalesce(jsonb_agg(jsonb_build_object('name',axis.name,'value',option_value.display_value) order by axis.position),'[]'::jsonb)
        from catalog.variant_option_values option_link
        join catalog.product_option_axes axis on axis.id=option_link.option_axis_id
        join catalog.product_option_values option_value on option_value.id=option_link.option_value_id
        where option_link.variant_id=variant.id) as options
    from cart.cart_lines line
    join cart.carts cart_row on cart_row.id=line.cart_id
    join catalog.product_variants variant on variant.id = line.variant_id
    join catalog.products product on product.id = variant.product_id
    left join catalog.product_categories category on category.product_id = product.id
    where line.cart_id = ${cart.id}
    group by line.id, line.variant_id, line.quantity, variant.id, variant.sku, product.id, product.title,product.handle,cart_row.organization_id
    order by line.created_at, line.id
    limit 101
  `.execute(db);
  if (lines.rows.length > 100)
    throw new CartDomainError(
      'LIMIT_EXCEEDED',
      'This legacy Cart exceeds the safe hydration limit and needs review.',
    );
  const coupons = await sql<{ normalized_code: string }>`
    select coupon.normalized_code
    from cart.cart_coupons link join promotions.coupon_codes coupon on coupon.id = link.coupon_code_id
    where link.cart_id = ${cart.id}
    order by coupon.normalized_code
    limit 11
  `.execute(db);
  if (coupons.rows.length > 10)
    throw new CartDomainError(
      'LIMIT_EXCEEDED',
      'This legacy Cart exceeds the safe coupon limit and needs review.',
    );
  const eligibleVariants = lines.rows
    .filter((line) => line.eligible)
    .map((line) => line.variant_id);
  const [prices, stock] = await Promise.all([
    resolveVariantPrices(db, {
      organizationId: cart.organizationId,
      variantIds: eligibleVariants,
      currency: cart.currency,
      at: evaluatedAt,
    }),
    availableToSellByVariant(db, cart.organizationId, eligibleVariants),
  ]);
  const computedLines = lines.rows.map((line) => {
    const price = line.eligible ? prices.get(line.variant_id) : undefined;
    const ats = stock.get(line.variant_id) ?? '0';
    const lineQuantity = quantity(line.quantity);
    const availability: CartView['lines'][number]['availability'] = !line.eligible
      ? 'UNAVAILABLE'
      : !price
        ? 'UNPRICED'
        : availableWholeUnits(ats) < lineQuantity
          ? availableWholeUnits(ats) === 0n
            ? 'UNAVAILABLE'
            : 'INSUFFICIENT_CURRENT_STOCK'
          : 'AVAILABLE';
    const gross = price ? money(parseMoney(price.amount) * lineQuantity) : '0.0000';
    return { ...line, price, gross, availability };
  });
  const calculations = await evaluatePromotions(db, {
    organizationId: cart.organizationId,
    at: evaluatedAt,
    couponCodes: coupons.rows.map((coupon) => coupon.normalized_code),
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
  const discountByLine = new Map<string, bigint>();
  for (const calculation of calculations) {
    for (const allocation of calculation.allocations) {
      discountByLine.set(
        allocation.lineId,
        (discountByLine.get(allocation.lineId) ?? 0n) + parseMoney(allocation.amount),
      );
    }
  }
  const viewLines = computedLines.map((line) => {
    const discount = discountByLine.get(line.id) ?? 0n;
    const gross = parseMoney(line.gross);
    return {
      id: line.id,
      variantId: line.variant_id,
      sku: line.eligible ? line.sku : '',
      productTitle: line.eligible ? line.product_title : 'Unavailable item',
      productHandle: line.eligible ? line.product_handle : '',
      mediaAssetId: line.eligible ? line.media_asset_id : null,
      options: line.eligible ? line.options : [],
      quantity: line.quantity,
      unitPrice: line.price?.amount ?? null,
      compareAtUnitPrice: line.price?.compareAtAmount ?? null,
      gross: line.gross,
      discount: money(discount),
      net: money(gross - discount),
      availability: line.availability,
    };
  });
  const merchandiseGross = viewLines.reduce((sum, line) => sum + parseMoney(line.gross), 0n);
  const discountTotal = viewLines.reduce((sum, line) => sum + parseMoney(line.discount), 0n);
  const calculationVersion = cart.version;
  return {
    id: cart.id,
    ownerContext: cart.ownerContext,
    intentRevision: String(cart.version),
    evaluatedAt: evaluatedAt.toISOString(),
    currency: cart.currency,
    version: cart.version,
    expiresAt: cart.expiresAt.toISOString(),
    calculationVersion,
    calculationFingerprint: fingerprint({
      calculationVersion,
      currency: cart.currency,
      lines: computedLines.map((line) => [
        line.variant_id,
        line.quantity,
        line.price?.priceDefinitionId ?? null,
        line.price?.amount ?? null,
        line.price?.compareAtAmount ?? null,
        line.availability,
      ]),
      coupons: coupons.rows.map((coupon) => coupon.normalized_code),
      discounts: calculations.map((calculation) => [
        calculation.promotionId,
        calculation.revisionId,
        calculation.discount,
      ]),
    }),
    lines: viewLines,
    appliedCoupons: coupons.rows.map((coupon) => coupon.normalized_code),
    merchandiseGross: money(merchandiseGross),
    discountTotal: money(discountTotal),
    merchandiseNet: money(merchandiseGross - discountTotal),
  };
}
