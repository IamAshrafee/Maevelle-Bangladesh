'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CheckoutOrderControlDto, PauseCheckoutOrdersDto } from '@maevelle/contracts';
import { useAdminContext } from '@/components/admin-capabilities';
import { SettingsCard } from '@/components/settings/settings-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

const path = '/admin/settings/checkout';

export function CheckoutControlPanel() {
  const { actorId, organizationId, isOwner } = useAdminContext();
  if (!isOwner || !organizationId) return null;
  return <CheckoutControl key={`${actorId}:${organizationId}`} organizationId={organizationId} />;
}

function CheckoutControl({ organizationId }: { organizationId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [control, setControl] = useState<CheckoutOrderControlDto>();
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchApiData<CheckoutOrderControlDto>(path, {
      headers: { 'x-organization-id': organizationId },
      signal: controller.signal,
    })
      .then((status) => {
        if (!status) throw new Error('Checkout status was unavailable.');
        if (!controller.signal.aborted) setControl(status);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError('Could not check Checkout status.');
      });
    return () => controller.abort();
  }, [organizationId, attempt]);

  async function pauseOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!control || control.paused || saving || !reason.trim()) return;

    setSaving(true);
    setSaveError('');
    try {
      const body: PauseCheckoutOrdersDto = { reason: reason.trim() };
      const status = await fetchApiData<CheckoutOrderControlDto>(`${path}/pause`, {
        method: 'POST',
        headers: { 'x-organization-id': organizationId },
        body: JSON.stringify(body),
      });
      if (!status?.paused) throw new Error('Pause was not confirmed.');
      setControl(status);
      setReason('');
    } catch {
      setSaveError(
        'The pause request could not be confirmed. Check the current status before retrying.',
      );
      setControl(undefined);
      setAttempt((previous) => previous + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="New storefront orders"
      badge={control && <StatusBadge status={control.releaseStatus} />}
    >
      <div className="space-y-4">
        {loadError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => {
                setLoadError('');
                setAttempt((previous) => previous + 1);
              }}
            >
              Check again
            </Button>
          </div>
        ) : !control ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking Checkout status…
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              New orders are blocked pending end-to-end Checkout verification and release approval.
              Payment collection is managed separately.
            </p>
            {control.paused ? (
              <p role="status" className="text-sm font-medium">
                An operational pause is in place.
              </p>
            ) : (
              <form className="space-y-3" onSubmit={pauseOrders}>
                <p className="text-sm text-muted-foreground">
                  You can record a pause now. It keeps new orders paused even after release
                  approval.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="checkout-pause-reason">Reason for pausing</Label>
                  <Textarea
                    id="checkout-pause-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={240}
                    required
                    disabled={saving}
                    className="max-w-lg"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  variant="outline"
                  disabled={saving || !reason.trim()}
                >
                  {saving ? 'Pausing…' : 'Pause new orders'}
                </Button>
              </form>
            )}
          </>
        )}
        {saveError && !control?.paused && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
      </div>
    </SettingsCard>
  );
}
