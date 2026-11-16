'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import type { CheckoutOrderControlDto, ChangeCheckoutOrderPauseDto } from '@maevelle/contracts';
import { useAdminContext } from '@/components/admin-capabilities';
import { SettingsCard } from '@/components/settings/settings-card';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

const path = '/admin/settings/checkout';

export function CheckoutControlPanel() {
  const { actorId, organizationId, isOwner } = useAdminContext();
  if (!organizationId) return null;

  if (!isOwner) {
    return (
      <SettingsCard
        title="Storefront Order Controls"
        description="Operational release controls for storefront orders."
      >
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-xs text-warning-foreground">
            <ShieldAlert className="size-4 shrink-0 text-warning mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Organization Owner Access Required</p>
              <p className="text-muted-foreground">
                Emergency pause and resume controls for storefront customer checkout are restricted
                to Organization Owners. Administrative operators can review serviceability, delivery
                pricing, and payment accounts below.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/orders/delivery-pricing"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
            >
              <ExternalLink className="size-3.5" />
              Delivery Pricing Rules
            </Link>
            <Link
              href="/payments?tab=settings&subtab=wallets"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
            >
              <ExternalLink className="size-3.5" />
              Receiving Wallets
            </Link>
          </div>
        </div>
      </SettingsCard>
    );
  }

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

  const canChange = control && (!control.paused || control.releaseStatus === 'READY');
  const action = control?.paused ? 'resume' : 'pause';

  async function changeOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canChange || saving || !reason.trim()) return;

    setSaving(true);
    setSaveError('');
    try {
      const body: ChangeCheckoutOrderPauseDto = { reason: reason.trim() };
      const status = await fetchApiData<CheckoutOrderControlDto>(`${path}/${action}`, {
        method: 'POST',
        headers: { 'x-organization-id': organizationId },
        body: JSON.stringify(body),
      });
      if (!status || status.paused !== (action === 'pause'))
        throw new Error('Change was not confirmed.');
      setControl(status);
      setReason('');
    } catch {
      setSaveError('The change could not be confirmed. Check the current status before retrying.');
      setControl(undefined);
      setAttempt((previous) => previous + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="New storefront orders"
      badge={control && <StatusBadge status={control.paused ? 'ON_HOLD' : control.releaseStatus} />}
    >
      <div className="space-y-4">
        {loadError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button
              type="button"
              size="default"
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
              {control.paused
                ? 'New orders are paused.'
                : control.releaseStatus === 'READY'
                  ? 'The storefront is accepting new orders.'
                  : 'New orders are unavailable. Check the delivery rates and payment methods.'}
            </p>
            {control.paused && control.releaseStatus === 'BLOCKED' && (
              <p className="text-sm text-muted-foreground">
                Checkout needs an eligible delivery rate and payment method before it can resume.
              </p>
            )}
            {canChange && (
              <form className="space-y-3" onSubmit={changeOrders}>
                <div className="space-y-2">
                  <Label htmlFor="checkout-pause-reason">Reason for change</Label>
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
                  size="default"
                  variant="outline"
                  disabled={saving || !reason.trim()}
                >
                  {saving
                    ? 'Saving…'
                    : action === 'pause'
                      ? 'Pause new orders'
                      : 'Resume new orders'}
                </Button>
              </form>
            )}
          </>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
      </div>
    </SettingsCard>
  );
}
