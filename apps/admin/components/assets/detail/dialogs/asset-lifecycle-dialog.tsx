'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, Wrench } from 'lucide-react';
import type { AssetConditionDto, AssetDetailDto, AssetStatusDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { humanizeAssetCode } from '@/lib/assets/format';
import type { AssetLifecyclePreset } from '../../types';

const mutableStatuses: readonly AssetStatusDto[] = [
  'ACTIVE',
  'IN_STORAGE',
  'UNDER_REPAIR',
  'DAMAGED',
  'LOST',
];

const conditions: readonly AssetConditionDto[] = ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'];

interface AssetLifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  preset?: AssetLifecyclePreset | undefined;
  onSuccess: () => void;
}

export function AssetLifecycleDialog({
  open,
  onOpenChange,
  asset,
  preset,
  onSuccess,
}: AssetLifecycleDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AssetStatusDto>(preset?.targetStatus ?? asset.status);
  const [condition, setCondition] = useState<AssetConditionDto>(
    preset?.suggestedCondition ?? asset.condition,
  );
  const [reason, setReason] = useState(preset?.defaultReason ?? '');

  useEffect(() => {
    if (preset) {
      setStatus(preset.targetStatus);
      if (preset.suggestedCondition) setCondition(preset.suggestedCondition);
      if (preset.defaultReason) setReason(preset.defaultReason);
    } else {
      setStatus(asset.status);
      setCondition(asset.condition);
      setReason('');
    }
  }, [preset, asset]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await fetchApiData(`/admin/assets/${asset.id}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          condition,
          reason: reason.trim(),
          expectedVersion: asset.version,
        }),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lifecycle change could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  const title = preset?.title ?? 'Change Operational Lifecycle';
  const description =
    preset?.description ??
    'Update the physical operating state or condition. Every lifecycle change appends a verifiable entry to the asset history.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {preset?.targetStatus === 'ACTIVE' && (
              <CheckCircle className="size-5 text-emerald-600" />
            )}
            {preset?.targetStatus === 'UNDER_REPAIR' && (
              <Wrench className="size-5 text-amber-600" />
            )}
            {preset?.targetStatus === 'LOST' && (
              <AlertTriangle className="size-5 text-destructive" />
            )}
            {!preset && <RefreshCw className="size-5 text-primary" />}
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        {status === 'LOST' ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
            <strong className="font-semibold block">Marking Asset as Lost</strong>
            <p>
              The asset will be flagged as lost and removed from active service lists. If found
              later, you can execute a recovery command to restore it to service.
            </p>
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              New Status
              <NativeSelect
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatusDto)}
              >
                {mutableStatuses.map((s) => (
                  <option key={s} value={s}>
                    {humanizeAssetCode(s)}
                  </option>
                ))}
              </NativeSelect>
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              New Physical Condition
              <NativeSelect
                name="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as AssetConditionDto)}
              >
                {conditions.map((c) => (
                  <option key={c} value={c}>
                    {humanizeAssetCode(c)}
                  </option>
                ))}
              </NativeSelect>
            </Label>
          </div>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Reason / Summary of Change
            <Textarea
              name="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this status or condition change occurred (minimum 4 characters)…"
              required
              minLength={4}
            />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || reason.trim().length < 4}
              variant={status === 'LOST' ? 'destructive' : 'default'}
            >
              {busy ? 'Updating…' : preset ? 'Confirm' : 'Update Lifecycle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
