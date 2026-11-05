import type { CheckoutQuoteDto } from '@maevelle/contracts';
import { formatExactMoney } from '@/lib/format/exact-money';

const labels = {
  SOURCE: 'Your selection',
  DELIVERY: 'Delivery details',
  MERCHANDISE: 'Item details or prices',
  DISCOUNTS: 'Discounts',
  SHIPPING: 'Delivery charge',
  CONFIGURATION: 'Commercial conditions',
};
export function QuoteComparison({
  current,
  previous,
}: {
  current: CheckoutQuoteDto;
  previous: CheckoutQuoteDto;
}) {
  if (current.previousQuoteId !== previous.id || current.draftId !== previous.draftId) return null;
  const sameCurrency = current.facts.currency === previous.facts.currency;
  return (
    <div className="space-y-3 rounded-xl border border-border-subtle p-4">
      <h3 className="font-semibold">Compared with your previous evaluation</h3>
      <p className="text-xs text-on-surface-variant">
        Previous and latest evaluated components. Neither is a final payable amount.
      </p>
      {current.changes.length > 0 && (
        <p className="text-sm">Review: {current.changes.map((c) => labels[c]).join(' · ')}.</p>
      )}
      {sameCurrency && (
        <dl className="space-y-3 text-sm">
          {(['merchandiseSubtotal', 'discountTotal', 'shipping', 'evaluatedTotal'] as const)
            .filter((k) => previous.facts[k] !== current.facts[k])
            .map((key) => (
              <div className="space-y-1" key={key}>
                <dt className="text-on-surface-variant">
                  {
                    {
                      merchandiseSubtotal: 'Merchandise',
                      discountTotal: 'Discounts',
                      shipping: 'Delivery',
                      evaluatedTotal: 'Evaluated components total',
                    }[key]
                  }
                </dt>
                <dd className="flex flex-wrap gap-x-2 font-mono text-xs tabular-nums">
                  <span>
                    Previously {formatExactMoney(previous.facts[key], previous.facts.currency)}
                  </span>
                  <span>Now {formatExactMoney(current.facts[key], current.facts.currency)}</span>
                </dd>
              </div>
            ))}
        </dl>
      )}
      <ul className="space-y-2 text-xs">
        {current.facts.lines.map((line) => {
          const old = previous.facts.lines.find((p) => p.variantId === line.variantId);
          if (
            old &&
            old.quantity === line.quantity &&
            old.unitPrice === line.unitPrice &&
            old.net === line.net
          )
            return null;
          return (
            <li className="break-words" key={line.id}>
              <strong>{line.title}</strong>
              {old ? (
                <>
                  {old.quantity !== line.quantity && (
                    <p>
                      Quantity: previously {old.quantity}, now {line.quantity}.
                    </p>
                  )}
                  {old.unitPrice !== line.unitPrice && (
                    <p>
                      Unit price: previously{' '}
                      {formatExactMoney(old.unitPrice, previous.facts.currency)}, now{' '}
                      {formatExactMoney(line.unitPrice, current.facts.currency)}.
                    </p>
                  )}
                  {old.net !== line.net && (
                    <p>
                      After discount: previously{' '}
                      {formatExactMoney(old.net, previous.facts.currency)}, now{' '}
                      {formatExactMoney(line.net, current.facts.currency)}.
                    </p>
                  )}
                </>
              ) : (
                <p>Added to this evaluation.</p>
              )}
            </li>
          );
        })}
        {previous.facts.lines
          .filter((old) => !current.facts.lines.some((l) => l.variantId === old.variantId))
          .map((old) => (
            <li className="break-words" key={old.id}>
              {old.title} · No longer in this evaluation.
            </li>
          ))}
      </ul>
      {current.changes.length === 0 && (
        <p className="text-sm">
          No evaluated component changes were reported. This is still a separate evaluation to
          review.
        </p>
      )}
    </div>
  );
}
