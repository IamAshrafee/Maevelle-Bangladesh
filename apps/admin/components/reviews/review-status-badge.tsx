import React from 'react';
import { Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReviewModerationBadge({
  status,
  className,
}: {
  readonly status: string;
  readonly className?: string;
}) {
  const norm = (status || '').toUpperCase();
  const isApproved = norm === 'APPROVED';
  const isRejected = norm === 'REJECTED';
  const isPending = norm === 'PENDING';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight whitespace-nowrap select-none transition-colors',
        isApproved && 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
        isRejected && 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
        isPending && 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
        !isApproved && !isRejected && !isPending && 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
        className,
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full shrink-0',
          isApproved && 'bg-emerald-500',
          isRejected && 'bg-rose-500',
          isPending && 'bg-amber-500',
          !isApproved && !isRejected && !isPending && 'bg-slate-400',
        )}
        aria-hidden="true"
      />
      {norm ? norm.replaceAll('_', ' ').toLowerCase() : 'Unknown'}
    </span>
  );
}

export function ReviewVisibilityBadge({
  status,
  className,
}: {
  readonly status: string;
  readonly className?: string;
}) {
  const isVisible = (status || '').toUpperCase() === 'VISIBLE';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap select-none',
        isVisible
          ? 'bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:text-primary dark:border-primary/30'
          : 'bg-muted text-muted-foreground border-border',
        className,
      )}
    >
      {isVisible ? (
        <Eye className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <EyeOff className="size-3 shrink-0" aria-hidden="true" />
      )}
      {isVisible ? 'Storefront Visible' : 'Hidden'}
    </span>
  );
}

export function ReviewVerifiedBadge({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200/80 px-2 py-0.5 text-[11px] font-medium dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60 select-none',
        className,
      )}
      title="Verified purchase linked to authentic delivered order line"
    >
      <Check className="size-3 stroke-[2.5]" aria-hidden="true" />
      Verified
    </span>
  );
}
