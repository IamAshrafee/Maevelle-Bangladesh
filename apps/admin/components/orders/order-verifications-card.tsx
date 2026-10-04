'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';

import type { OrderVerificationDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecordVerificationDialog } from './record-verification-dialog';

interface OrderVerificationsCardProps {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerPhone?: string | null | undefined;
  readonly verifications?: readonly OrderVerificationDto[] | undefined;
  readonly canRecordVerification?: boolean | undefined;
  readonly onUpdated: () => void;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const outcomeBadges: Record<
  string,
  { label: string; className: string }
> = {
  CONFIRMED: {
    label: 'Confirmed',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  UNREACHABLE: {
    label: 'Unreachable',
    className: 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  },
  WRONG_NUMBER: {
    label: 'Wrong Number',
    className: 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  },
  CANCEL_REQUESTED: {
    label: 'Cancel Requested',
    className: 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  },
  ADDRESS_CORRECTION_REQUESTED: {
    label: 'Address Correction',
    className: 'border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  },
  FLAGGED_SUSPICIOUS: {
    label: 'Suspicious',
    className: 'border-purple-300 bg-purple-50 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  },
  APPROVED_OVERRIDE: {
    label: 'Approved Override',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
};

export function OrderVerificationsCard({
  orderId,
  orderNumber,
  customerPhone,
  verifications = [],
  canRecordVerification = true,
  onUpdated,
}: OrderVerificationsCardProps) {
  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Verifications">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <PhoneCall className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Customer Verifications</h2>
        </div>
        {canRecordVerification && (
          <RecordVerificationDialog
            orderId={orderId}
            orderNumber={orderNumber}
            customerPhone={customerPhone}
            onCompleted={onUpdated}
          />
        )}
      </div>

      <div className="p-6">
        {verifications.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground italic">
            No customer contact or verification recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {verifications.map((v) => {
              const outcomeConfig = outcomeBadges[v.outcome] ?? {
                label: v.outcome.replaceAll('_', ' '),
                className: 'border-slate-200 bg-slate-50 text-slate-800',
              };

              return (
                <div
                  key={v.id}
                  className="rounded-lg border bg-background p-3 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {v.verificationType.replaceAll('_', ' ')}
                      </span>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${outcomeConfig.className}`}
                      >
                        {outcomeConfig.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(v.createdAt)}
                    </span>
                  </div>

                  {v.notes && (
                    <p className="whitespace-pre-wrap text-muted-foreground">{v.notes}</p>
                  )}

                  <div className="text-[10px] text-muted-foreground">
                    Recorded by: {v.actorName ?? v.actorId}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
