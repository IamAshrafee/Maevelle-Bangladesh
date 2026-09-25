'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Power } from 'lucide-react';
import type { FinanceAccountDetailDto } from '@maevelle/contracts';

import { ActionDialog } from '@/components/ui/action-dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api';

interface AccountStatusDialogProps {
  readonly open: boolean;
  readonly account: FinanceAccountDetailDto | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function AccountStatusDialog({
  open,
  account,
  onOpenChange,
  onSuccess,
}: AccountStatusDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!account) return null;

  const isAccountActive = account.status === 'ACTIVE';
  const targetStatus = isAccountActive ? 'INACTIVE' : 'ACTIVE';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 4) {
      setError('A meaningful reason of at least 4 characters is required.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiRequest(`/admin/finance/accounts/${encodeURIComponent(account.id)}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: targetStatus,
          expectedVersion: Number(account.version),
          reason: trimmedReason,
        }),
      });

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account status could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isAccountActive ? 'Deactivate Financial Account' : 'Activate Financial Account'}
      description={
        isAccountActive
          ? 'Deactivating this account will prevent it from being used for new customer payments, expenses, or transfers.'
          : 'Reactivating this account makes it available immediately across treasury operations, transfers, and settlements.'
      }
      icon={Power}
      size="md"
      onSubmit={handleSubmit}
      busy={busy}
      submitLabel={isAccountActive ? 'Confirm deactivation' : 'Confirm activation'}
      busyLabel={isAccountActive ? 'Deactivating...' : 'Activating...'}
      submitVariant={isAccountActive ? 'destructive' : 'default'}
      submitDisabled={busy || reason.trim().length < 4}
      error={error}
    >
      <div className="space-y-4 py-2">
        <Field>
          <FieldLabel htmlFor="account-status-reason">
            Reason for {isAccountActive ? 'deactivation' : 'activation'}
          </FieldLabel>
          <Textarea
            id="account-status-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isAccountActive
                ? 'e.g. Account closed at bank, seasonal freeze, or account under review...'
                : 'e.g. Verification complete, bank KYC renewed, or resumed usage...'
            }
            minLength={4}
            maxLength={1000}
            required
            disabled={busy}
            className="min-h-[90px]"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>Minimum 4 characters required for audit trail compliance.</span>
            <span>{reason.length}/1000</span>
          </div>
        </Field>

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <strong>Immutable Audit Log:</strong> This status change is permanently signed and tracked in the platform audit event log.
        </div>
      </div>
    </ActionDialog>
  );
}
