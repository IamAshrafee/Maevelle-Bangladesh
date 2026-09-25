'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import type { FinanceReconciliationDto } from '@maevelle/contracts';

import { ActionDialog } from '@/components/ui/action-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api';

interface ResolveReconciliationDialogProps {
  readonly open: boolean;
  readonly check: FinanceReconciliationDto | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function ResolveReconciliationDialog({
  open,
  check,
  onOpenChange,
  onSuccess,
}: ResolveReconciliationDialogProps) {
  const [resolutionCode, setResolutionCode] = useState<
    'EXPLAINED_DIFFERENCE' | 'EXTERNAL_BALANCE_CORRECTED'
  >('EXPLAINED_DIFFERENCE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setResolutionCode('EXPLAINED_DIFFERENCE');
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
      setError('A resolution note of at least 4 characters is required.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiRequest(`/admin/finance/reconciliations/${encodeURIComponent(check.id)}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolutionCode,
          note: trimmedNote,
        }),
      });

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve reconciliation difference.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resolve Reconciliation Difference"
      description="Record an operational resolution for the variance observed between the external statement and Maevelle's immutable ledger."
      icon={Scale}
      size="md"
      onSubmit={handleSubmit}
      busy={busy}
      submitLabel="Confirm resolution"
      busyLabel="Resolving..."
      submitDisabled={busy || note.trim().length < 4}
      error={error}
    >
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
          <div>
            <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
              Ledger
            </span>
            <strong className="text-foreground">{check.ledger_balance}</strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
              Observed
            </span>
            <strong className="text-foreground">{check.observed_balance}</strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
              Variance
            </span>
            <strong className="text-amber-600 dark:text-amber-400">
              {check.difference_amount}
            </strong>
          </div>
        </div>

        <Field>
          <FieldLabel htmlFor="resolution-code">Resolution Classification</FieldLabel>
          <NativeSelect
            id="resolution-code"
            value={resolutionCode}
            onChange={(e) =>
              setResolutionCode(
                e.target.value as 'EXPLAINED_DIFFERENCE' | 'EXTERNAL_BALANCE_CORRECTED',
              )
            }
            disabled={busy}
          >
            <option value="EXPLAINED_DIFFERENCE">
              Explained difference (bank fee, transit float, or timing lag)
            </option>
            <option value="EXTERNAL_BALANCE_CORRECTED">
              External balance corrected (bank statement error corrected)
            </option>
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel htmlFor="resolution-note">Audit Explanation Note</FieldLabel>
          <Textarea
            id="resolution-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain why this difference occurred and how it was accounted for..."
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
