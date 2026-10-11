import type { ComponentProps } from 'react';

import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Long Supply workflows use the full mobile viewport so fields, keyboards, and
 * recovery actions never compete with a small centered modal.
 */
export function SupplyTaskDialogContent({
  className,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        'max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overscroll-contain max-sm:rounded-none',
        className,
      )}
      {...props}
    />
  );
}
