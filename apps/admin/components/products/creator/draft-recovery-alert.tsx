'use client';

import { RotateCcw, Trash2, Clock, Sparkles } from 'lucide-react';
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
    <Alert className="border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 shadow-xs">
      <Clock className="size-4 text-amber-600 dark:text-amber-400" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
        <div>
          <AlertTitle className="text-xs font-semibold text-amber-950 dark:text-amber-100">
            Unsaved Draft Available
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
            A previously unsaved product draft was saved on {formattedDate} at {formattedTime}.
          </AlertDescription>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-7 gap-1 text-xs bg-amber-800 hover:bg-amber-900 text-white dark:bg-amber-700"
            onClick={onRestore}
          >
            <RotateCcw className="size-3" />
            <span>Restore Draft</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
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
