import type { ReactNode } from 'react';

import { Progress, ProgressLabel } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatSupplyNumber } from '@/lib/supply/api';
import { percentage } from '@/lib/supply/status';

export function DetailMetric({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-lg border bg-card p-3', className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function QuantityProgress({
  label,
  complete,
  total,
  detail,
}: {
  label: string;
  complete: number;
  total: number;
  detail?: string;
}) {
  const value = percentage(complete, total);
  return (
    <Progress value={value} className="gap-1.5">
      <ProgressLabel>{label}</ProgressLabel>
      <span className="ml-auto text-sm text-muted-foreground tabular-nums">
        {formatSupplyNumber(String(complete))} / {formatSupplyNumber(String(total))}
      </span>
      {detail ? <p className="basis-full text-xs text-muted-foreground">{detail}</p> : null}
    </Progress>
  );
}

export function DetailSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailSkeleton() {
  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8" aria-busy="true">
      <div className="h-5 w-52 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-24 animate-pulse rounded-xl bg-muted" key={index} />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </main>
  );
}
