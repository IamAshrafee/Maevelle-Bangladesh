import * as React from 'react';
import { AdminPage } from '@/components/ui/page-shell';
import type { PageWidthVariant } from '@/lib/navigation/route-registry';
import { cn } from '@/lib/utils';

export function DetailKpiStrip({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}

/**
 * Optional Layer 4 archetype for record detail pages (8-column main workspace + 4-column context rail).
 */
export function DetailWorkspace({
  widthVariant = 'wide',
  header,
  kpiStrip,
  primary,
  rail,
  footer,
  className,
}: {
  readonly widthVariant?: Exclude<PageWidthVariant, 'immersive'>;
  readonly header?: React.ReactNode;
  readonly kpiStrip?: React.ReactNode;
  readonly primary: React.ReactNode;
  readonly rail?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <AdminPage variant={widthVariant} className={className}>
      {header}
      {kpiStrip}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className={cn('min-w-0 space-y-6', rail ? 'lg:col-span-8' : 'lg:col-span-12')}>
          {primary}
        </div>
        {rail ? <aside className="min-w-0 space-y-6 lg:col-span-4">{rail}</aside> : null}
      </div>
      {footer}
    </AdminPage>
  );
}
