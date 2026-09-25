'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { FinanceReconciliationDto } from '@maevelle/contracts';

import { ActionDialog } from '@/components/ui/action-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api';

interface ReopenReconciliationDialogProps {
  readonly open: boolean;
  readonly check: FinanceReconciliationDto | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function ReopenReconciliationDialog({
  open,
  check,
  onOpenChange,
  onSuccess,
}: ReopenReconciliationDialogProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!check) return null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedNote = note.trim();
    if (trimmedNote.length < 4) {
      setError('A reason of at least 4 characters is required to reopen this discrepancy.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiRequest(`/admin/finance/reconciliations/${encodeURIComponent(check.id)}/reopen`, {
        method: 'POST',
        body: JSON.stringify({
          note: trimmedNote,
        }),
      });

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen reconciliation discrepancy.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reopen Balance Discrepancy"
      description="Reopen this variance audit. Prior resolution notes remain in the permanent audit trail, and this reopening reason will be recorded as a new audit event."
      icon={RotateCcw}
      size="md"
      onSubmit={handleSubmit}
      busy={busy}
      submitLabel="Confirm reopen"
      busyLabel="Reopening..."
      submitVariant="outline"
      submitDisabled={busy || note.trim().length < 4}
      error={error}
    >
      <div className="space-y-4 py-2">
        <Field>
          <FieldLabel htmlFor="reopen-note">Reason for Reopening Discrepancy</FieldLabel>
          <Textarea
            id="reopen-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain why this reconciliation difference is being reopened for investigation..."
            minLength={4}
            maxLength={1000}
            required
            disabled={busy}
            className="min-h-[85px]"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>Minimum 4 characters. Saved into permanent audit provenance.</span>
            <span>{note.length}/1000</span>
          </div>
        </Field>
      </div>
    </ActionDialog>
  );
}
