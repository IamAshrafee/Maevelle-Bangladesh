import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

export function SupplyField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Label className="grid gap-1.5">
      <span>
        {label}{' '}
        {hint ? (
          <span className="font-normal text-muted-foreground" title={hint}>
            ⓘ
          </span>
        ) : null}
      </span>
      {children}
    </Label>
  );
}
