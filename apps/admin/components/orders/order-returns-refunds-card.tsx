'use client';

import { ExternalLink, Receipt, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import type { OrderDetailDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

interface OrderReturnsRefundsCardProps {
  readonly order: OrderDetailDto;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatMoney(amount: number | string | undefined | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
    maximumFractionDigits: 0,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrderReturnsRefundsCard({ order }: OrderReturnsRefundsCardProps) {
  const { returnCases = [], refunds = [] } = order;

  if (returnCases.length === 0 && refunds.length === 0) {
    return null; // Keep screen clean when no returns or refunds exist
  }

  return (
    <div className="space-y-6">
      {/* Customer Returns */}
      {returnCases.length > 0 && (
        <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Returns">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="size-5 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-base font-semibold text-foreground">Customer Returns</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {returnCases.length} case{returnCases.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {returnCases.map((rc) => (
                <div
                  key={rc.id}
                  className="rounded-lg border bg-background p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{rc.caseNumber}</span>
                      <StatusBadge status={rc.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Type: {rc.returnType.replaceAll('_', ' ')} · Filed {formatDate(rc.createdAt)}
                    </p>
                  </div>
                  <div className="pt-2 border-t flex justify-end">
                    <Link
                      href={`/returns?selected=${encodeURIComponent(rc.id)}`}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      View return case
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Refunds History */}
      {refunds.length > 0 && (
        <section className="rounded-xl border bg-card shadow-sm" aria-label="Payment Refunds">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-2">
              <Receipt className="size-5 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-base font-semibold text-foreground">Refunds Issued</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {refunds.length} transaction{refunds.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {refunds.map((ref) => (
                <div
                  key={ref.id}
                  className="rounded-lg border bg-background p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {formatMoney(ref.amount, order.currency)}
                      </span>
                      <StatusBadge status={ref.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Processed: {formatDate(ref.createdAt)}
                    </p>
                  </div>
                  <div className="pt-2 border-t flex justify-end">
                    <Link
                      href={`/payments?tab=refunds&q=${encodeURIComponent(order.orderNumber)}`}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Review in Payments
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
