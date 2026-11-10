import type { CheckoutFinalTermsDto } from '@maevelle/contracts';
import { Money } from '@/components/commerce/price';
import { paymentMethodLabel } from '../placement-labels';

export function FinalTermsSummary({
  terms,
  committed = false,
}: {
  terms: CheckoutFinalTermsDto;
  committed?: boolean;
}) {
  const components = [
    ['Merchandise subtotal', terms.merchandiseSubtotal],
    [
      'Discounts',
      terms.discountTotal === '0.0000' ? terms.discountTotal : `-${terms.discountTotal}`,
    ],
    ['Delivery', terms.shipping],
    ['Tax', terms.tax],
    ['Payment charges', terms.paymentFees],
    ['Rounding adjustment', terms.roundingAdjustment],
  ] as const;
  return (
    <div className="min-w-0 space-y-4">
      <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt>Payment method</dt>
        <dd className="break-words text-right font-medium">{paymentMethodLabel[terms.method]}</dd>
        {components.map(([label, amount]) => (
          <div className="contents" key={label}>
            <dt>{label}</dt>
            <dd className="min-w-0 break-all text-right">
              {label === 'Rounding adjustment' && amount !== '0.0000' && !amount.startsWith('-')
                ? '+'
                : ''}
              <Money
                amount={amount}
                currency={terms.currency}
                mode={label === 'Rounding adjustment' && amount !== '0.0000' ? 'EXACT' : 'RETAIL'}
              />
            </dd>
          </div>
        ))}
        <dt>Tax treatment</dt>
        <dd className="break-words text-right">{terms.taxTreatment}</dd>
      </dl>
      <div className="space-y-1 rounded-xl bg-surface-container-low p-4">
        <p className="text-sm font-medium">
          {committed ? 'Original order total' : 'Final payable'}
        </p>
        <Money
          className="block break-all text-xl font-semibold"
          amount={terms.payable}
          currency={terms.currency}
          mode={terms.payableUnit === 'BDT_1' ? 'WHOLE_BDT' : 'RETAIL'}
        />
      </div>
    </div>
  );
}
