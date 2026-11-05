import { sql, type Transaction } from 'kysely';
import type { CheckoutQuoteFactsDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { checkoutCartIntentInTransaction, CartDomainError } from '../cart.js';
import { catalogVariantIsStructurallyValid } from '../catalog-variant-integrity.js';
import { evaluateMerchandise, type MerchandiseLine } from '../commerce/merchandise.js';
import { money, parseMoney, quantity, fingerprint } from '../cart/value.js';
import { promotionConfigurationFingerprint } from '../promotions.js';
import { checkoutDeliveryInTransaction } from './delivery.js';
import { draftView } from './queries.js';
import { CheckoutError, type CheckoutAuthority, type DraftRow } from './types.js';

export interface QuoteSnapshot {
  source: unknown;
  delivery: unknown;
  configuration: string;
  merchandise: unknown;
}
/** Requires the caller's coherent snapshot transaction; reusable by future placement, before allocation. */
export async function evaluateCheckoutInTransaction(
  tx: Transaction<DatabaseSchema>,
  owner: CheckoutAuthority,
  row: DraftRow,
  couponCodes: readonly string[],
  cartToken?: string,
) {
  if (!tx.isTransaction) throw new Error('Commercial evaluation requires a transaction.');
  const isolation = await sql<{
    transaction_isolation: string;
  }>`show transaction_isolation`.execute(tx);
  if (!['repeatable read', 'serializable'].includes(isolation.rows[0]!.transaction_isolation))
    throw new Error('Commercial evaluation requires a coherent snapshot.');
  const organization = await sql<{
    default_currency: string;
    version: string;
  }>`select default_currency,version::text from platform.organizations
    where id=${owner.organizationId} and status='ACTIVE'`.execute(tx);
  if (organization.rows[0]?.default_currency !== row.currency_code)
    throw new CheckoutError(
      'CONFIGURATION_CHANGED',
      'Start a new Checkout for the current store configuration.',
    );
  const draft = await draftView(tx, row);
  if (draft.status !== 'ACTIVE')
    throw new CheckoutError('DRAFT_EXPIRED', 'Checkout is no longer active.');
  if (draft.sourceReviewRequired || !draft.lines.length || draft.lines.length > 100)
    throw new CheckoutError('SOURCE_CHANGED', 'Review the purchase source.');
  let codes = couponCodes;
  if (draft.source.kind === 'CART') {
    if (couponCodes.length)
      throw new CheckoutError('INVALID_REQUEST', 'Edit Cart coupons in your Bag first.');
    try {
      const cart = await checkoutCartIntentInTransaction(tx, {
        organizationId: owner.organizationId,
        currency: row.currency_code,
        ...(owner.kind === 'ACCOUNT'
          ? { account: { ...owner, currency: row.currency_code } }
          : cartToken
            ? { token: cartToken }
            : {}),
      });
      const expected = draft.lines.map((l) => [l.sourceCartLineId, l.variantId, l.quantity]).sort();
      const actual = cart.lines
        .map((l) => [l.id, l.variantId, String(quantity(l.quantity))])
        .sort();
      if (
        cart.id !== draft.source.cartId ||
        cart.revision !== draft.source.cartRevision ||
        JSON.stringify(expected) !== JSON.stringify(actual)
      )
        throw new CheckoutError('SOURCE_CHANGED', 'Review the current complete Cart.');
      codes = cart.couponCodes;
    } catch (error) {
      if (error instanceof CartDomainError)
        throw new CheckoutError('SOURCE_CHANGED', 'Restore and review your Bag.');
      throw error;
    }
  }
  const delivery = await checkoutDeliveryInTransaction(tx, row);
  if (delivery.savedAddress && delivery.savedAddress.status !== 'CURRENT')
    throw new CheckoutError('ADDRESS_CHANGED', 'Review the selected saved address.');
  if (!delivery.delivery)
    throw new CheckoutError('DELIVERY_CHANGED', 'Enter and review delivery details.');
  if (delivery.eligibility?.status !== 'ELIGIBLE' || !delivery.eligibility.tariff)
    throw new CheckoutError(
      delivery.eligibility?.status ?? 'DELIVERY_UNAVAILABLE',
      'Delivery is unavailable for this area.',
    );
  if (delivery.configurationChanged)
    throw new CheckoutError(
      'CONFIGURATION_CHANGED',
      'Review delivery configuration before requesting a quote.',
    );
  const at = (await sql<{ at: string }>`select transaction_timestamp()::text at`.execute(tx))
    .rows[0]!.at;
  const detail = await sql<MerchandiseLine & { title: string; sku: string; version: string }>`
    select l.id,l.variant_id,l.quantity::text,p.id product_id,p.title,v.sku,
      (v.status='ACTIVE' and p.status='ACTIVE' and p.publication_status='PUBLISHED') visible,
      ${catalogVariantIsStructurallyValid({ organizationId: sql.ref('v.organization_id'), productId: sql.ref('v.product_id'), variantId: sql.ref('v.id'), optionSignature: sql.ref('v.option_signature') })} configured,
      coalesce((select array_agg(c.category_id order by c.category_id) from catalog.product_categories c
        where c.organization_id=l.organization_id and c.product_id=p.id),'{}') category_ids,
      concat(p.version,':',v.version) version
    from orders.checkout_draft_lines l
    join catalog.product_variants v on v.organization_id=l.organization_id and v.id=l.variant_id
    join catalog.products p on p.organization_id=v.organization_id and p.id=v.product_id
    where l.organization_id=${owner.organizationId} and l.draft_id=${row.id} order by l.id limit 101`.execute(
    tx,
  );
  if (detail.rows.length !== draft.lines.length)
    throw new CheckoutError('VARIANT_UNAVAILABLE', 'An item is unavailable.');
  const { computedLines, calculations } = await evaluateMerchandise(tx, {
    organizationId: owner.organizationId,
    currency: row.currency_code,
    at,
    lines: detail.rows,
    couponCodes: codes,
    ...(owner.kind === 'ACCOUNT' ? { customerId: owner.customerId } : {}),
  });
  if (calculations.length > 100)
    throw new CheckoutError(
      'SOURCE_INELIGIBLE',
      'This purchase exceeds supported promotion limits.',
    );
  for (const l of computedLines) {
    if (!l.visible || !l.configured || !l.price)
      throw new CheckoutError(
        'VARIANT_UNAVAILABLE',
        'An item is unavailable or has no current price.',
      );
    if (l.availability !== 'AVAILABLE')
      throw new CheckoutError('INSUFFICIENT_STOCK', 'An item has insufficient current stock.');
  }
  const allocated = new Map<string, bigint>();
  for (const p of calculations)
    for (const a of p.allocations)
      allocated.set(a.lineId, (allocated.get(a.lineId) ?? 0n) + parseMoney(a.amount));
  const lines = computedLines.map((l) => ({
    id: l.id,
    variantId: l.variant_id,
    productId: l.product_id,
    title: l.title,
    sku: l.sku,
    quantity: String(quantity(l.quantity)),
    priceDefinitionId: l.price!.priceDefinitionId,
    unitPrice: l.price!.amount,
    gross: l.gross,
    discount: money(allocated.get(l.id) ?? 0n),
    net: money(parseMoney(l.gross) - (allocated.get(l.id) ?? 0n)),
  }));
  const subtotal = lines.reduce((s, l) => s + parseMoney(l.gross), 0n);
  const discount = lines.reduce((s, l) => s + parseMoney(l.discount), 0n);
  const shipping = delivery.eligibility.tariff.amount;
  const effective = new Set(calculations.map((c) => c.couponCodeId));
  const couponRows = codes.length
    ? (
        await sql<{
          id: string;
          normalized_code: string;
        }>`select id,normalized_code from promotions.coupon_codes
    where organization_id=${owner.organizationId} and normalized_code=any(${[...codes]}::text[])`.execute(
          tx,
        )
      ).rows
    : [];
  const facts: CheckoutQuoteFactsDto = {
    currency: row.currency_code,
    lines,
    discounts: calculations,
    coupons: codes.map((code) => ({
      code,
      status: effective.has(couponRows.find((c) => c.normalized_code === code)?.id ?? '')
        ? 'EFFECTIVE'
        : 'NO_CURRENT_BENEFIT',
    })),
    merchandiseSubtotal: money(subtotal),
    discountTotal: money(discount),
    shipping,
    evaluatedTotal: money(subtotal - discount + parseMoney(shipping)),
    tax: null,
    paymentFees: null,
    payable: null,
    final: false,
  };
  const snapshot: QuoteSnapshot = {
    source: { source: draft.source, lines: draft.lines },
    delivery: {
      delivery: delivery.delivery,
      savedAddress: delivery.savedAddress,
      configurationRevision: delivery.eligibility.configurationRevision,
    },
    configuration: fingerprint({
      organizationRevision: organization.rows[0]!.version,
      promotions: await promotionConfigurationFingerprint(tx, owner.organizationId),
    }),
    merchandise: computedLines.map((l) => [l.id, l.version, l.category_ids, l.price]),
  };
  return { facts, snapshot, fingerprint: fingerprint({ facts, snapshot }), at };
}
