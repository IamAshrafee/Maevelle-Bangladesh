import type { CheckoutFinalTermsDto, CheckoutPlacementMethod } from '@maevelle/contracts';
import type { Transaction } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { fingerprint, money, parseMoney } from '../cart/value.js';
import {
  checkoutPaymentConfiguration,
  type CheckoutPaymentSelection,
} from '../payments/checkout-obligation.js';
import type { evaluateCheckoutInTransaction } from './quote-evaluation.js';
import type { StoredQuote } from './quote-store.js';
import { CheckoutError } from './types.js';

export type Evaluation = Awaited<ReturnType<typeof evaluateCheckoutInTransaction>>;

/** A trusted server decision for the exact current delivery context and method. */
export type PlacementPolicy = (
  tx: Transaction<DatabaseSchema>,
  input: { organizationId: string; method: CheckoutPlacementMethod; evaluation: Evaluation },
) => Promise<{
  revision: string;
  taxTreatment: string;
  tax: string;
  paymentFees: string;
  rounding: 'EXACT_BDT_2' | 'BDT_2_HALF_UP';
  payment: CheckoutPaymentSelection;
}>;

export async function finalCheckoutTerms(
  tx: Transaction<DatabaseSchema>,
  organizationId: string,
  quote: StoredQuote,
  evaluation: Evaluation,
  method: CheckoutPlacementMethod,
  resolvePolicy: PlacementPolicy,
) {
  const policy = await resolvePolicy(tx, { organizationId, evaluation, method });
  const blocked = () =>
    new CheckoutError(
      'POLICY_BLOCKED',
      'Final payable is unsupported by the current Order lifecycle.',
    );
  if (quote.currency_code !== 'BDT' || policy.payment.method !== method) throw blocked();

  const payment = await checkoutPaymentConfiguration(tx, organizationId, policy.payment);
  const tax = parseMoney(policy.tax),
    fees = parseMoney(policy.paymentFees);
  const amount = parseMoney(evaluation.facts.evaluatedTotal) + tax + fees;
  const payable = policy.rounding === 'BDT_2_HALF_UP' ? ((amount + 50n) / 100n) * 100n : amount;
  // Existing Order cancellation and amendment equations support only zero tax/fees/rounding.
  // Unsupported approved policies need a compatible lifecycle migration, never a fallback.
  if (tax !== 0n || fees !== 0n || amount !== payable || payable % 100n !== 0n) throw blocked();
  const fields = {
    quoteId: quote.id,
    quoteFingerprint: quote.fingerprint,
    revision: quote.draft_revision,
    expiresAt: quote.expires_at.toISOString(),
    currency: 'BDT',
    method,
    merchandiseSubtotal: evaluation.facts.merchandiseSubtotal,
    discountTotal: evaluation.facts.discountTotal,
    shipping: evaluation.facts.shipping,
    tax: money(tax),
    taxTreatment: policy.taxTreatment,
    paymentFees: money(fees),
    merchantWalletSurcharge: '0.0000',
    roundingAdjustment: money(payable - amount),
    payable: money(payable),
  } as const;
  const evidence = {
    policyRevision: policy.revision,
    rounding: policy.rounding,
    methodId: payment.method.id,
    methodRevision: payment.method.revision,
    destinationId: payment.destination?.id ?? null,
    destinationRevision: payment.destination?.revision ?? null,
    operatingPolicyId: payment.operatingPolicy?.id ?? null,
  };
  const terms: CheckoutFinalTermsDto = {
    ...fields,
    fingerprint: fingerprint({ fields, evidence }),
  };
  return { terms, payment, evidence };
}
