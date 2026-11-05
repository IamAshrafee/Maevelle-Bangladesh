import type { CheckoutQuoteDto } from '@maevelle/contracts';
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
export function sampleQuote(
  draftId = crypto.randomUUID(),
  revision = '3',
): Mutable<CheckoutQuoteDto> {
  return {
    id: crypto.randomUUID(),
    draftId,
    draftRevision: revision,
    source: { kind: 'BUY_NOW' },
    fingerprint: 'x'.repeat(43),
    evaluatedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    status: 'CURRENT',
    issues: [],
    acknowledged: false,
    reviewRequired: true,
    changes: [],
    previousQuoteId: null,
    blockers: [
      'TAX_POLICY_UNRESOLVED',
      'PAYMENT_POLICY_UNRESOLVED',
      'COURIER_COMPATIBILITY_UNVERIFIED',
    ],
    stockReserved: false,
    purchaseAvailable: false,
    facts: {
      currency: 'BDT',
      lines: [
        {
          id: crypto.randomUUID(),
          variantId: crypto.randomUUID(),
          productId: crypto.randomUUID(),
          title: 'Immutable clip',
          sku: 'CLIP-1',
          quantity: '1',
          priceDefinitionId: crypto.randomUUID(),
          unitPrice: '100.0000',
          gross: '100.0000',
          discount: '0.0000',
          net: '100.0000',
        },
      ],
      discounts: [],
      coupons: [],
      merchandiseSubtotal: '100.0000',
      discountTotal: '0.0000',
      shipping: '0.0000',
      evaluatedTotal: '100.0000',
      tax: null,
      paymentFees: null,
      payable: null,
      final: false,
    },
  };
}
