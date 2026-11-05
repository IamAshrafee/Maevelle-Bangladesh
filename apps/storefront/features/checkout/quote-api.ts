import type { CheckoutQuoteDto } from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { ownerHeaders } from './foundation-api';
import type { ReviewOwner } from './foundation-types';
import type { PrivateQuoteIntent } from './quote-types';

const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const revision = (v: unknown): v is string =>
  typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;
const amount = (v: unknown): v is string => typeof v === 'string' && /^\d{1,16}\.\d{4}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const issueCodes = [
  'DRAFT_EXPIRED',
  'SOURCE_CHANGED',
  'DELIVERY_CHANGED',
  'ADDRESS_CHANGED',
  'CONFIGURATION_CHANGED',
  'VARIANT_UNAVAILABLE',
  'INSUFFICIENT_STOCK',
  'UNSUPPORTED_AREA',
  'DELIVERY_UNAVAILABLE',
  'QUOTE_EXPIRED',
  'SUPERSEDED',
];
const changeCodes = ['SOURCE', 'DELIVERY', 'MERCHANDISE', 'DISCOUNTS', 'SHIPPING', 'CONFIGURATION'];
function invalid(): never {
  throw new StorefrontClientApiError(
    502,
    'INVALID_RESPONSE',
    'The evaluation could not be checked.',
  );
}
/** Validate transport integrity, never synthesize commercial facts or a valid quote. */
export function quoteResult(
  value: CheckoutQuoteDto,
  draftId: string,
  quoteId?: string,
): CheckoutQuoteDto {
  if (
    !value ||
    !uuid(value.id) ||
    value.draftId !== draftId ||
    (quoteId && value.id !== quoteId) ||
    !revision(value.draftRevision) ||
    !text(value.fingerprint, 43) ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.fingerprint) ||
    !Number.isFinite(Date.parse(value.evaluatedAt)) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.parse(value.evaluatedAt) ||
    !['CURRENT', 'EXPIRED', 'SUPERSEDED', 'INVALIDATED'].includes(value.status) ||
    typeof value.acknowledged !== 'boolean' ||
    typeof value.reviewRequired !== 'boolean' ||
    value.reviewRequired !== (value.status !== 'CURRENT' || !value.acknowledged) ||
    !Array.isArray(value.issues) ||
    value.issues.length > issueCodes.length ||
    value.issues.some((i) => !issueCodes.includes(i)) ||
    (value.status === 'CURRENT' && value.issues.length !== 0) ||
    !Array.isArray(value.changes) ||
    value.changes.length > changeCodes.length ||
    value.changes.some((i) => !changeCodes.includes(i)) ||
    (value.previousQuoteId !== null && !uuid(value.previousQuoteId)) ||
    !value.source ||
    !['CART', 'BUY_NOW'].includes(value.source.kind) ||
    (value.source.kind === 'CART' &&
      (!uuid(value.source.cartId) || !revision(value.source.cartRevision))) ||
    value.stockReserved !== false ||
    value.purchaseAvailable !== false ||
    !Array.isArray(value.blockers) ||
    value.blockers.length !== 3 ||
    ![
      'TAX_POLICY_UNRESOLVED',
      'PAYMENT_POLICY_UNRESOLVED',
      'COURIER_COMPATIBILITY_UNVERIFIED',
    ].every((b) => value.blockers.includes(b as (typeof value.blockers)[number]))
  )
    invalid();
  const f = value.facts;
  if (
    !f ||
    !/^[A-Z]{3}$/.test(f.currency) ||
    f.tax !== null ||
    f.paymentFees !== null ||
    f.payable !== null ||
    f.final !== false ||
    ![f.merchandiseSubtotal, f.discountTotal, f.shipping, f.evaluatedTotal].every(amount) ||
    !Array.isArray(f.lines) ||
    f.lines.length < 1 ||
    f.lines.length > 100 ||
    (value.source.kind === 'BUY_NOW' && f.lines.length !== 1) ||
    f.lines.some(
      (l) =>
        !l ||
        !uuid(l.id) ||
        !uuid(l.variantId) ||
        !uuid(l.productId) ||
        !uuid(l.priceDefinitionId) ||
        !text(l.title, 2000) ||
        !text(l.sku, 500) ||
        typeof l.quantity !== 'string' ||
        !/^[1-9][0-9]?$/.test(l.quantity) ||
        ![l.unitPrice, l.gross, l.discount, l.net].every(amount),
    ) ||
    !Array.isArray(f.coupons) ||
    f.coupons.length > 10 ||
    f.coupons.some(
      (c) =>
        !c ||
        !text(c.code, 64) ||
        !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(c.code) ||
        !['EFFECTIVE', 'NO_CURRENT_BENEFIT'].includes(c.status),
    ) ||
    !Array.isArray(f.discounts) ||
    f.discounts.length > 100 ||
    f.discounts.some(
      (p) =>
        !p ||
        !uuid(p.promotionId) ||
        !uuid(p.revisionId) ||
        (p.couponCodeId !== null && !uuid(p.couponCodeId)) ||
        !amount(p.discount) ||
        !Array.isArray(p.allocations) ||
        p.allocations.length > 100 ||
        p.allocations.some(
          (a: CheckoutQuoteDto['facts']['discounts'][number]['allocations'][number]) =>
            !a || !uuid(a.lineId) || !amount(a.amount),
        ),
    )
  )
    invalid();
  if (
    new Set(f.lines.map((l) => l.id)).size !== f.lines.length ||
    new Set(f.lines.map((l) => l.variantId)).size !== f.lines.length
  )
    invalid();
  // Reject broken equations rather than repairing them from browser values.
  const units = (v: string) => BigInt(v.replace('.', ''));
  let gross = 0n,
    discount = 0n;
  for (const l of f.lines) {
    if (
      units(l.unitPrice) * BigInt(l.quantity) !== units(l.gross) ||
      units(l.discount) > units(l.gross) ||
      units(l.net) !== units(l.gross) - units(l.discount)
    )
      invalid();
    gross += units(l.gross);
    discount += units(l.discount);
  }
  if (
    gross !== units(f.merchandiseSubtotal) ||
    discount !== units(f.discountTotal) ||
    units(f.evaluatedTotal) !== gross - discount + units(f.shipping)
  )
    invalid();
  const allocations = new Map<string, bigint>();
  let total = 0n;
  for (const p of f.discounts) {
    let sum = 0n;
    if (
      new Set(
        p.allocations.map(
          (a: CheckoutQuoteDto['facts']['discounts'][number]['allocations'][number]) => a.lineId,
        ),
      ).size !== p.allocations.length
    )
      invalid();
    for (const a of p.allocations) {
      if (!f.lines.some((l) => l.id === a.lineId)) invalid();
      const n = units(a.amount);
      sum += n;
      allocations.set(a.lineId, (allocations.get(a.lineId) ?? 0n) + n);
    }
    if (sum !== units(p.discount)) invalid();
    total += sum;
  }
  if (
    total !== discount ||
    f.lines.some((l) => (allocations.get(l.id) ?? 0n) !== units(l.discount))
  )
    invalid();
  return value;
}
const base = (id: string) => `/api/storefront/v1/checkouts/${encodeURIComponent(id)}/quotes`;
export const quoteApi = {
  async current(id: string, owner: ReviewOwner, signal: AbortSignal) {
    const value = await requestWithDeadline<CheckoutQuoteDto | null>(`${base(id)}/current`, {
      signal,
      cache: 'no-store',
      headers: ownerHeaders(owner),
    });
    return value === null ? null : quoteResult(value, id);
  },
  async detail(id: string, quoteId: string, owner: ReviewOwner, signal: AbortSignal) {
    return quoteResult(
      await requestWithDeadline<CheckoutQuoteDto>(`${base(id)}/${encodeURIComponent(quoteId)}`, {
        signal,
        cache: 'no-store',
        headers: ownerHeaders(owner),
      }),
      id,
      quoteId,
    );
  },
  async mutate(intent: PrivateQuoteIntent, signal: AbortSignal) {
    return quoteResult(
      await requestWithDeadline<CheckoutQuoteDto>(intent.path, {
        method: intent.method,
        body: intent.body,
        signal,
        cache: 'no-store',
        headers: {
          ...ownerHeaders(intent.owner),
          'content-type': 'application/json',
          'idempotency-key': intent.key,
        },
      }),
      intent.draftId,
      intent.kind === 'acknowledge' ? intent.quoteId : undefined,
    );
  },
};
