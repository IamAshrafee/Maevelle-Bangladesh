'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { FinanceAccountDetailDto } from '@maevelle/contracts';

import { ActionDialog } from '@/components/ui/action-dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api';

interface EditAccountDialogProps {
  readonly open: boolean;
  readonly account: FinanceAccountDetailDto | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function EditAccountDialog({
  open,
  account,
  onOpenChange,
  onSuccess,
}: EditAccountDialogProps) {
  const [name, setName] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && account) {
      setName(account.name);
      setReferenceLabel(account.reference_label || '');
      setError(null);
      setBusy(false);
    }
  }, [open, account]);

  if (!account) return null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Account name is required.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiRequest(`/admin/finance/accounts/${encodeURIComponent(account.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          referenceLabel: referenceLabel.trim() || null,
          expectedVersion: Number(account.version),
        }),
      });

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account details.');
    } finally {
      setBusy(false);
    }
  };

  const isChanged =
    name.trim() !== account.name || (referenceLabel.trim() || null) !== account.reference_label;

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Account Details"
      description="Update the display name and operational banking reference notes for this account."
      icon={Pencil}
      size="md"
      onSubmit={handleSubmit}
      busy={busy}
      submitLabel="Save changes"
      busyLabel="Saving changes..."
      submitDisabled={busy || !name.trim() || !isChanged}
      error={error}
    >
      <div className="space-y-4 py-2">
        <Field>
          <FieldLabel htmlFor="edit-account-name">Account Name</FieldLabel>
          <Input
            id="edit-account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BRAC Corporate Checking"
            maxLength={100}
            required
            disabled={busy}
          />
          <FieldDescription>
            The official internal title used across treasury, invoicing, and expenses.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="edit-account-ref">Reference & Banking Details</FieldLabel>
          <Textarea
            id="edit-account-ref"
            value={referenceLabel}
            onChange={(e) => setReferenceLabel(e.target.value)}
            placeholder="e.g. Branch: Gulshan, Routing: 060260..., Wallet: 017..., Swift: BRA..."
            maxLength={200}
            disabled={busy}
            className="min-h-[80px]"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
            <span>Optional metadata for banking details, routing, or agent contacts.</span>
            <span>{referenceLabel.length}/200</span>
          </div>
        </Field>

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <strong>Optimistic concurrency:</strong> Changes are checked against version v{account.version} to prevent conflicting overwrites.
        </div>
      </div>
    </ActionDialog>
  );
}
