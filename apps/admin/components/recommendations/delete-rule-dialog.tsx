'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { RuleItem } from './recommendations-types';

interface DeleteRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RuleItem | null;
  onConfirm: (ruleId: string) => Promise<void>;
}

export function DeleteRuleDialog({
  open,
  onOpenChange,
  rule,
  onConfirm,
}: DeleteRuleDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setError('');
  }, [open]);

  if (!rule) return null;

  async function handleDelete() {
    if (!rule) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(rule.id);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete rule.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Delete Compatibility Rule
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to remove the styling rule mapping{' '}
            <strong className="text-foreground">{rule.sourceName}</strong> to{' '}
            <strong className="text-foreground">{rule.targetName}</strong>?
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p>
            • Products of type <strong className="text-foreground">{rule.sourceName}</strong> will no
            longer automatically receive affinity boosts for{' '}
            <strong className="text-foreground">{rule.targetName}</strong> items.
          </p>
          <p>• Category and attribute overlaps will still continue to operate normally.</p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void handleDelete()}
          >
            {busy ? 'Deleting…' : 'Delete rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

