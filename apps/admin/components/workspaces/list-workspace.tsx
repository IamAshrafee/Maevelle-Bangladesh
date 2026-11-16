import * as React from 'react';
import { AdminPage, PagePanel } from '@/components/ui/page-shell';
import type { PageWidthVariant } from '@/lib/navigation/route-registry';
import { cn } from '@/lib/utils';

export function ListFilterBar({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <PagePanel
      className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center', className)}
    >
      {children}
    </PagePanel>
  );
}

export function ListResultsSummary({
  total,
  label = 'records',
  trailing,
  className,
}: {
  readonly total: number;
  readonly label?: string;
  readonly trailing?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <span>
        Showing <strong className="font-mono tabular-nums text-foreground">{total}</strong> {label}
      </span>
      {trailing}
    </div>
  );
}

/**
 * Optional Layer 4 archetype for paginated operational lists and queues.
 */
export function ListWorkspace({
  widthVariant = 'wide',
  header,
  banner,
  kpiStrip,
  tabs,
  filters,
  bulkActions,
  children,
  pagination,
  className,
}: {
  readonly widthVariant?: Exclude<PageWidthVariant, 'immersive'>;
  readonly header?: React.ReactNode;
  readonly banner?: React.ReactNode;
  readonly kpiStrip?: React.ReactNode;
  readonly tabs?: React.ReactNode;
  readonly filters?: React.ReactNode;
  readonly bulkActions?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly pagination?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <AdminPage variant={widthVariant} className={className}>
      {header}
      {banner}
      {kpiStrip}
      {tabs}
      {filters}
      {bulkActions}
      <div className="min-w-0 space-y-4">{children}</div>
      {pagination}
    </AdminPage>
  );
}
