import type { CartMergePreviewDto } from '@maevelle/contracts';
import { formatMoney } from '@/lib/format/money';
import { Notice } from '@/components/ui/notice';

const blockerCopy = {
  EMPTY_GUEST: 'This guest bag has no items to merge. Guest coupon selections stay separate.',
  QUANTITY_LIMIT:
    'One or more selections exceed 99 units when combined. Adjust quantities in either bag before reviewing again.',
  LINE_LIMIT:
    'The combined bag has more than 100 selections. Remove selections from either bag before reviewing again.',
};

export function CartMergePlan({ review }: { review: CartMergePreviewDto }) {
  const changes = new Map(review.lines.map((line) => [line.survivingLineId, line]));
  const projected = review.projected;
  const issues = new Map(
    projected?.commerceReview?.issues.flatMap((issue) =>
      'lineId' in issue ? [[issue.lineId, issue] as const] : [],
    ),
  );
  const lines = projected?.lines ?? review.guest.lines;

  return (
    <div className="space-y-5">
      {review.blockers.length > 0 && (
        <Notice variant="warning" title="This bag cannot be merged yet">
          <ul className="list-disc space-y-1 ps-5">
            {review.blockers.map((code) => (
              <li key={code}>{blockerCopy[code]}</li>
            ))}
          </ul>
        </Notice>
      )}
      <section
        aria-labelledby="merge-lines"
        className="rounded-2xl border border-border-subtle px-4 sm:px-6"
      >
        <h2 id="merge-lines" className="pt-4 font-serif text-xl font-semibold">
          {projected ? 'Your combined bag' : 'Guest selections'}
        </h2>
        <ul className="divide-y divide-border-subtle">
          {lines.map((line) => {
            const change = projected
              ? changes.get(line.id)
              : review.lines.find((item) => item.guestLineId === line.id);
            const issue = issues.get(line.id);
            return (
              <li key={line.id} className="flex flex-wrap justify-between gap-x-5 gap-y-2 py-4">
                <div className="min-w-0 break-words">
                  <h3 className="font-semibold">{line.productTitle}</h3>
                  {line.options.length > 0 && (
                    <p className="text-sm text-on-surface-variant">
                      {line.options.map(({ name, value }) => `${name} ${value}`).join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-on-surface-variant tabular-nums">
                    {change?.accountQuantity
                      ? `${change.accountQuantity} in account bag + ${change.guestQuantity} in guest bag = ${change.requestedQuantity}`
                      : change
                        ? `${change.guestQuantity} from guest bag`
                        : `${Number(line.quantity)} kept in account bag`}
                  </p>
                  {line.availability !== 'AVAILABLE' && (
                    <p className="mt-1 text-sm font-medium">
                      {issue?.code === 'INVALID_CONFIGURATION'
                        ? 'Selection changed. Choose another option after merging.'
                        : issue?.action === 'REDUCE_OR_REPLACE_OR_REMOVE'
                          ? 'Quantity exceeds current availability. Review it after merging.'
                          : 'Currently unavailable. You can review or remove this item later.'}
                    </p>
                  )}
                </div>
                <div className="text-sm tabular-nums">
                  {line.unitPrice === null
                    ? 'Price unavailable'
                    : `${formatMoney(line.unitPrice, review.account.currency)} each`}
                  {projected && Number(line.discount) > 0 && (
                    <p>{formatMoney(line.net, review.account.currency)} after discount</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!lines.length && (
          <p className="py-4 text-sm text-on-surface-variant">
            There are no items in this guest bag.
          </p>
        )}
      </section>
      <section className="space-y-2 rounded-2xl border border-border-subtle p-4 sm:p-6">
        <h2 className="font-serif text-xl font-semibold">Current merchandise estimate</h2>
        {projected && (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
            <dt>Merchandise</dt>
            <dd>{formatMoney(projected.merchandiseGross, projected.currency)}</dd>
            <dt>Current discounts</dt>
            <dd>{formatMoney(projected.discountTotal, projected.currency)}</dd>
            <dt className="font-semibold">Estimated total</dt>
            <dd className="font-semibold">
              {formatMoney(projected.merchandiseNet, projected.currency)}
            </dd>
          </dl>
        )}
        <p className="break-words text-sm text-on-surface-variant">
          Account coupons stay selected
          {review.account.appliedCoupons.length
            ? ` · ${review.account.appliedCoupons.join(', ')}`
            : '.'}
        </p>
        {review.guest.appliedCoupons.length > 0 && (
          <p className="break-words text-sm text-on-surface-variant">
            Guest coupons stay separate · {review.guest.appliedCoupons.join(', ')}. You can enter a
            code in your account bag after merging.
          </p>
        )}
        <p className="text-sm text-on-surface-variant">
          Prices and availability can change. Items are saved in your bag without reserving stock.
        </p>
      </section>
    </div>
  );
}
