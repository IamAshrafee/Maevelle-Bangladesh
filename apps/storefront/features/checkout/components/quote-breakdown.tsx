import type { CheckoutQuoteFactsDto } from '@maevelle/contracts';
import { formatExactMoney } from '@/lib/format/exact-money';

export function QuoteBreakdown({ facts }: { facts: CheckoutQuoteFactsDto }) {
  const amount = (v: string) => formatExactMoney(v, facts.currency);
  return (
    <div className="space-y-4 border-t border-border-subtle pt-5">
      <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
        <dt>Merchandise subtotal</dt>
        <dd className="break-all text-right font-mono tabular-nums">
          {amount(facts.merchandiseSubtotal)}
        </dd>
        <dt>Applied discounts</dt>
        <dd className="break-all text-right font-mono tabular-nums">
          −{amount(facts.discountTotal)}
        </dd>
        <dt>Evaluated delivery charge</dt>
        <dd className="break-all text-right font-mono tabular-nums">{amount(facts.shipping)}</dd>
        <dt>Tax</dt>
        <dd className="text-right text-on-surface-variant">Not determined</dd>
        <dt>Payment-related fees</dt>
        <dd className="text-right text-on-surface-variant">Not determined</dd>
      </dl>
      <div className="space-y-1 rounded-xl bg-surface-container-low p-4">
        <p className="text-sm font-semibold">Evaluated components total</p>
        <p className="break-all font-mono text-xl font-semibold tabular-nums">
          {amount(facts.evaluatedTotal)}
        </p>
        <p className="text-sm text-on-surface-variant">Not final payable</p>
      </div>
      <p className="text-xs leading-relaxed text-on-surface-variant">
        These are the evaluated merchandise and delivery components. Tax, payment-related fees and
        the final payable amount are not determined yet. No payment is due.
      </p>
    </div>
  );
}
