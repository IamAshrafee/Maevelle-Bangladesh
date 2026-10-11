'use client';

import { RotateCcw, Trash2, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface DraftRecoveryAlertProps {
  readonly timestamp: number;
  readonly onRestore: () => void;
  readonly onDiscard: () => void;
}

export function DraftRecoveryAlert({
  timestamp,
  onRestore,
  onDiscard,
}: DraftRecoveryAlertProps) {
  const formattedTime = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const formattedDate = new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Alert className="border-warning/30 bg-warning/10 text-warning shadow-xs">
      <Clock className="size-4 text-warning" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
        <div>
          <AlertTitle className="text-xs font-semibold text-foreground">
            Unsaved Draft Available
          </AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            A previously unsaved product draft was saved on {formattedDate} at {formattedTime}.
          </AlertDescription>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-7 gap-1 text-xs bg-warning hover:bg-warning/90 text-warning-foreground"
            onClick={onRestore}
          >
            <RotateCcw className="size-3" />
            <span>Restore Draft</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onDiscard}
          >
            <Trash2 className="size-3" />
            <span>Discard</span>
          </Button>
        </div>
      </div>
    </Alert>
  );
}
