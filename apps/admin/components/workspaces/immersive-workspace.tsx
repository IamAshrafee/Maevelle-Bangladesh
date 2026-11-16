import * as React from 'react';
import { AdminPage } from '@/components/ui/page-shell';
import { cn } from '@/lib/utils';

/**
 * Optional Layer 4 archetype for viewport-locked interactive applications (e.g. Live Inbox).
 * Expects `<AdminShell viewportLocked />` to hold the bounded viewport flex column.
 */
export function ImmersiveWorkspace({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <AdminPage variant="immersive" className={cn('bg-background', className)}>
      {children}
    </AdminPage>
  );
}
