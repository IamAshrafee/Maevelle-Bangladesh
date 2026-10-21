import { AlertCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isInventoryConflictError } from '@/lib/inventory/api';

export function UnitCommandError({
  error,
  onReload,
}: {
  readonly error: Error;
  readonly onReload: () => void;
}) {
  const isConflict = isInventoryConflictError(error);

  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-0.5">
          <p>{error.message}</p>
          {isConflict ? (
            <p className="text-foreground">
              This unit changed after the form opened. Reload its current state before deciding the
              next action.
            </p>
          ) : null}
        </div>
      </div>
      {isConflict ? (
        <Button type="button" variant="outline" size="xs" onClick={onReload}>
          <RefreshCw aria-hidden="true" /> Close and reload current state
        </Button>
      ) : null}
    </div>
  );
}
