import React from 'react';
import { cn } from '../lib/utils';

const success = new Set([
  'ACTIVE',
  'PUBLISHED',
  'APPROVED',
  'VISIBLE',
  'PAID',
  'VERIFIED',
  'DELIVERED',
  'COMPLETED',
  'RECEIVED',
  'HEALTHY',
  'SUCCEEDED',
  'READY',
  'MATCHED',
  'SENT',
  'FULFILLED',
  'CONFIRMED',
]);

const warning = new Set([
  'PENDING',
  'PARTIALLY_PAID',
  'PARTIALLY_RECEIVED',
  'PARTIALLY_SHIPPED',
  'PARTIALLY_FULFILLED',
  'PARTIALLY_DELIVERED',
  'ORDERED',
  'SHIPPED',
  'OUTSTANDING',
  'IN_TRANSIT',
  'INSPECTION',
  'QUARANTINE',
  'ON_HOLD',
  'RETRY_WAIT',
  'UNKNOWN_OUTCOME',
  'ATTENTION',
  'NOT_POSTED',
  'UNRECONCILED',
  'OPEN',
  'EXCEPTION',
  'QUEUED',
  'PROCESSING',
  'PENDING_MANUAL',
  'DELIVERY_DELAYED',
  'NEEDS_REVIEW',
]);

const danger = new Set([
  'FAILED',
  'CANCELLED',
  'REJECTED',
  'RTO',
  'DEAD_LETTER',
  'CRITICAL',
  'DISABLED',
  'BLOCKED',
  'BOUNCED',
  'COMPLAINED',
  'SUPPRESSED',
  'EXPIRED',
]);

const info = new Set([
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'RETURNED',
  'RESTOCKED',
  'IMPORT',
  'UNFULFILLED',
  'NOT_STARTED',
]);

const toneStyles: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
  warning: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
  danger: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
  info: 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60',
  neutral: 'bg-slate-100/90 text-slate-700 border-slate-200/90 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700/60',
};

export function StatusBadge({
  status,
  tone: overrideTone,
  className,
}: {
  readonly status: string;
  readonly tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  readonly className?: string;
}) {
  const key = (status ?? '').toUpperCase();
  const tone = overrideTone ?? (
    success.has(key)
      ? 'success'
      : warning.has(key)
        ? 'warning'
        : danger.has(key)
          ? 'danger'
          : info.has(key)
            ? 'info'
            : 'neutral'
  );

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium tracking-tight whitespace-nowrap select-none capitalize transition-colors',
        toneStyles[tone] ?? toneStyles.neutral,
        className,
      )}
    >
      <span className={cn(
        'size-1.5 rounded-full shrink-0',
        tone === 'success' && 'bg-emerald-500',
        tone === 'warning' && 'bg-amber-500',
        tone === 'danger' && 'bg-rose-500',
        tone === 'info' && 'bg-sky-500',
        tone === 'neutral' && 'bg-slate-400',
      )} aria-hidden="true" />
      {status ? status.replaceAll('_', ' ').toLowerCase() : 'Unknown'}
    </span>
  );
}
