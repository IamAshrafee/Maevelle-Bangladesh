'use client';

import { CircleDollarSign, ExternalLink, HelpCircle, Receipt } from 'lucide-react';
import Link from 'next/link';

import type { OrderDetailDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

interface OrderPaymentCardProps {
  readonly order: OrderDetailDto;
}

function formatMoney(amount: number | string | undefined | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
    maximumFractionDigits: 0,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrderPaymentCard({ order }: OrderPaymentCardProps) {
  const { payment } = order;
  const isCod = order.paymentMethod === 'COD';

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Payment Summary">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Payment Summary</h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={payment.status} />
          <Button
            render={<Link href={`/payments?q=${encodeURIComponent(order.orderNumber)}`} />}
            nativeButton={false}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            Payments Console
            <ExternalLink className="ml-1 size-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Payment Method</p>
          <p className="mt-1 font-semibold text-foreground">
            {order.paymentMethod === 'COD'
              ? 'Cash on Delivery (COD)'
              : order.paymentMethod.replaceAll('_', ' ')}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Expected Total</p>
          <p className="mt-1 font-semibold text-foreground">
            {formatMoney(payment.expected, order.currency)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Collected / Paid</p>
          <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(payment.collected, order.currency)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            {isCod ? 'COD Collectible' : 'Outstanding Balance'}
          </p>
          <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400">
            {formatMoney(payment.outstanding, order.currency)}
          </p>
        </div>
      </div>

      {Number(payment.refunded) > 0 && (
        <div className="border-t bg-muted/20 px-6 py-2.5 text-xs text-muted-foreground flex justify-between">
          <span>Total Refunded to Customer</span>
          <span className="font-medium text-rose-600 dark:text-rose-400">
            {formatMoney(payment.refunded, order.currency)}
          </span>
        </div>
      )}

      {/* Cancellation Refund Obligations Alert */}
      {order.cancellation?.refundSettlement &&
      order.cancellation.refundSettlement !== 'NOT_REQUIRED' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-amber-50/70 px-6 py-4 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
          <div>
            <p className="font-semibold">
              Cancellation Refund:{' '}
              {order.cancellation.refundSettlement.replaceAll('_', ' ')}
            </p>
            <p className="mt-0.5 opacity-90">
              {order.cancellation.refundObligations.length} linked refund request(s) must be settled
              through Payment operations.
            </p>
          </div>
          <Button
            render={<Link href={`/payments?tab=refunds&q=${encodeURIComponent(order.orderNumber)}`} />}
            nativeButton={false}
            size="sm"
            variant="outline"
            className="text-xs bg-background/80"
          >
            Review Refunds
            <ExternalLink className="ml-1 size-3" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
