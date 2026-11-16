import type { ReactNode } from 'react';

import type { PageWidthVariant } from '@/lib/navigation/route-registry';
import { PageSkeleton } from '@/components/ui/page-shell';
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

export function DetailSkeleton({
  widthVariant = 'wide',
}: {
  widthVariant?: PageWidthVariant;
} = {}) {
  return <PageSkeleton variant="detail" widthVariant={widthVariant} />;
}
