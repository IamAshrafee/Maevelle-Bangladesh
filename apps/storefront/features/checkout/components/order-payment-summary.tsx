'use client';

import type { CheckoutOrderPaymentDto } from '@maevelle/contracts';
import { Money } from '@/components/commerce/price';
import { Notice } from '@/components/ui/notice';
import { paymentMethodLabel, paymentStatusLabel } from '../placement-labels';

export function OrderPaymentSummary({ payment }: { payment: CheckoutOrderPaymentDto }) {
  const isSettled =
    payment.obligationStatus === 'SATISFIED' ||
    payment.paymentStatus === 'PAID' ||
    payment.outstanding === '0.0000';

  const isPartial =
    payment.allocated !== '0.0000' && payment.outstanding !== '0.0000' && !isSettled;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-container-low p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Payment method
          </span>
          <p className="font-semibold text-on-surface">{paymentMethodLabel[payment.method]}</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Payment status
          </span>
          <p className="font-semibold text-on-surface">
            {paymentStatusLabel(payment.paymentStatus)}
          </p>
        </div>
      </div>

      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-on-surface-variant">Original payable</dt>
        <dd className="min-w-0 break-all text-right font-medium">
          <Money amount={payment.originalPayable} currency={payment.currency} precision="exact" />
        </dd>

        <dt className="text-on-surface-variant">Confirmed payment</dt>
        <dd className="min-w-0 break-all text-right font-medium text-success">
          <Money amount={payment.allocated} currency={payment.currency} precision="exact" />
        </dd>

        {payment.refundedFromAllocation !== '0.0000' && (
          <>
            <dt className="text-on-surface-variant">Refunded from allocation</dt>
            <dd className="min-w-0 break-all text-right font-medium text-warning">
              <Money
                amount={payment.refundedFromAllocation}
                currency={payment.currency}
                precision="exact"
              />
            </dd>
          </>
        )}

        {payment.unallocatedAtVerification !== '0.0000' && (
          <>
            <dt className="text-on-surface-variant">Unallocated at verification</dt>
            <dd className="min-w-0 break-all text-right font-medium text-on-surface-variant">
              <Money
                amount={payment.unallocatedAtVerification}
                currency={payment.currency}
                precision="exact"
              />
            </dd>
          </>
        )}

        <dt className="border-t border-border-subtle pt-2 font-semibold text-on-surface">
          {isSettled ? 'Balance settled' : 'Outstanding balance due'}
        </dt>
        <dd
          className={`min-w-0 break-all border-t border-border-subtle pt-2 text-right font-bold ${
            isSettled ? 'text-success' : 'text-primary'
          }`}
        >
          <Money amount={payment.outstanding} currency={payment.currency} precision="exact" />
        </dd>
      </dl>

      {isPartial && (
        <Notice variant="info">
          A partial payment of{' '}
          <Money amount={payment.allocated} currency={payment.currency} precision="exact" /> has
          been verified. An outstanding balance of{' '}
          <Money amount={payment.outstanding} currency={payment.currency} precision="exact" />{' '}
          remains due.
        </Notice>
      )}

      {payment.hasLateReceipt && (
        <Notice variant="warning">
          <strong>Late receipt recorded:</strong> A payment transfer was received after the deadline
          or order cancellation. Our management team is reviewing this receipt for resolution.
        </Notice>
      )}

      {payment.hasReceiptReversal && (
        <Notice variant="warning">
          <strong>Receipt reversal recorded:</strong> A previously recorded payment receipt was
          reversed. Please check your current outstanding balance.
        </Notice>
      )}

      {payment.refundStates.length > 0 && (
        <Notice variant="neutral">
          <strong>Refund status:</strong> Active refund lifecycle states:{' '}
          <span className="font-mono">{payment.refundStates.join(', ')}</span>.
        </Notice>
      )}
    </div>
  );
}
