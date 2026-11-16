import * as React from 'react';
import { AdminPage } from '@/components/ui/page-shell';
import type { PageWidthVariant } from '@/lib/navigation/route-registry';
import { cn } from '@/lib/utils';

/**
 * Sticky bottom save/action bar cleared above the floating mobile navigation bar.
 */
export function FormStickyFooter({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      data-shell-chrome="true"
      className={cn(
        'sticky bottom-20 md:bottom-4 z-30 rounded-xl border border-border bg-card/95 backdrop-blur-md p-3.5 shadow-md flex flex-wrap items-center justify-between gap-3 print:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Optional Layer 4 archetype for dedicated creation and editing workflows.
 */
export function FormWorkspace({
  widthVariant = 'narrow',
  header,
  sectionNav,
  children,
  footer,
  className,
}: {
  readonly widthVariant?: Exclude<PageWidthVariant, 'immersive'>;
  readonly header?: React.ReactNode;
  readonly sectionNav?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <AdminPage variant={widthVariant} className={cn('pb-24 md:pb-12', className)}>
      {header}
      {sectionNav}
      <div className="min-w-0 space-y-6">{children}</div>
      {footer}
    </AdminPage>
  );
}
