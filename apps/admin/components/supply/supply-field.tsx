import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const supplySelectClassName =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm truncate outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

export function SupplyField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Label className={cn('grid min-w-0 gap-1.5', className)}>
      <span className="flex items-center gap-1 min-w-0 text-sm font-medium">
        <span className="truncate">{label}</span>
        {hint ? (
          <span className="font-normal text-muted-foreground shrink-0 cursor-help" title={hint}>
            ⓘ
          </span>
        ) : null}
      </span>
      {children}
    </Label>
  );
}
