'use client';

import type { CheckoutOrderPaymentDto } from '@maevelle/contracts';
import { Money } from '@/components/commerce/price';
import { Notice } from '@/components/ui/notice';
import { paymentStatusLabel } from '../placement-labels';

export function CodPaymentSummary({ payment }: { payment: CheckoutOrderPaymentDto }) {
  const isSettled =
    payment.paymentStatus === 'PAID' ||
    payment.obligationStatus === 'SATISFIED' ||
    payment.outstanding === '0.0000';

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-container-low p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-on-surface">Cash on Delivery</h3>
          <p className="text-xs text-on-surface-variant">Payment collected upon delivery</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">
          {paymentStatusLabel(payment.paymentStatus)}
        </span>
      </div>

      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-on-surface-variant">Order total</dt>
        <dd className="min-w-0 break-all text-right font-medium">
          <Money amount={payment.originalPayable} currency={payment.currency} precision="exact" />
        </dd>

        <dt className="border-t border-border-subtle pt-2 font-semibold text-on-surface">
          {isSettled ? 'Amount settled' : 'Amount due on delivery'}
        </dt>
        <dd
          className={`min-w-0 break-all border-t border-border-subtle pt-2 text-right font-bold ${
            isSettled ? 'text-success' : 'text-primary'
          }`}
        >
          <Money amount={payment.outstanding} currency={payment.currency} precision="exact" />
        </dd>
      </dl>

      {isSettled ? (
        <Notice variant="success">
          Payment for this Cash on Delivery order has been collected and settled in full.
        </Notice>
      ) : (
        <Notice variant="info">
          Please have the exact cash amount of{' '}
          <Money amount={payment.outstanding} currency={payment.currency} precision="exact" /> ready
          when the courier delivers your package.
        </Notice>
      )}

      <p className="text-xs leading-relaxed text-on-surface-variant">
        No online transfer is required for Cash on Delivery. Do not send wallet transfers or submit
        transaction IDs for this order.
      </p>
    </div>
  );
}
