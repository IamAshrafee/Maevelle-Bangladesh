'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PhoneCall } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchApiData } from '@/lib/api';
import type { OrderSmsEligibilityDto } from '@maevelle/contracts';

interface ConfirmOrderDialogProps {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly currentVersion: number;
  readonly overallRiskLevel?: string | null | undefined;
  readonly recommendation?: string | null | undefined;
  readonly onConfirmed: (feedback?: { orderMessage: string; smsEffect: string; tone: 'success' | 'warning' | 'info' }) => void;
  readonly onOpenVerification?: (() => void) | undefined;
}

export function ConfirmOrderDialog({
  orderId,
  orderNumber,
  currentVersion,
  overallRiskLevel,
  recommendation,
  onConfirmed,
  onOpenVerification,
}: ConfirmOrderDialogProps) {
  const [openWarning, setOpenWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isRisky =
    overallRiskLevel === 'ELEVATED' ||
    recommendation === 'VERIFY_CUSTOMER' ||
    recommendation === 'REQUIRE_PREPAYMENT' ||
    recommendation === 'REJECT_SUSPICIOUS';

  async function executeConfirm() {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      await fetchApiData(`/admin/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ version: currentVersion, status: 'CONFIRMED' }),
      });

      let smsEffect = 'SMS effect checked';
      let tone: 'success' | 'warning' | 'info' = 'success';
      try {
        const smsEligibility = await fetchApiData<OrderSmsEligibilityDto>(
          `/admin/sms/orders/${orderId}/eligibility`,
        );
        const confirmedEvent = smsEligibility.events.find(
          (e) => e.notificationType === 'ORDER_CONFIRMED',
        );
        if (confirmedEvent?.latestNotification?.status === 'QUEUED') {
          smsEffect = 'SMS Queued';
          tone = 'success';
        } else if (!smsEligibility.providerConfigured) {
          smsEffect = 'SMS Not sent — production provider not configured';
          tone = 'info';
        } else if (!smsEligibility.globalSmsEnabled) {
          smsEffect = 'SMS Automatic sending disabled';
          tone = 'warning';
        } else if (smsEligibility.phoneValidation === 'MISSING') {
          smsEffect = 'SMS Customer phone missing';
          tone = 'warning';
        } else if (smsEligibility.phoneValidation === 'INVALID') {
          smsEffect = 'SMS Customer phone number is invalid';
          tone = 'warning';
        } else if (smsEligibility.isSuppressed) {
          smsEffect = 'SMS Recipient is suppressed';
          tone = 'warning';
        } else if (!confirmedEvent?.policy.automaticEnabled) {
          smsEffect = 'SMS Automatic sending disabled for Order Confirmed policy';
          tone = 'info';
        } else {
          smsEffect = `SMS ${confirmedEvent?.eligibilityCode.replaceAll('_', ' ').toLowerCase() ?? 'checked'}`;
        }
      } catch {
        smsEffect = 'SMS state can be inspected in Customer Communications below';
      }

      setOpenWarning(false);
      onConfirmed({
        orderMessage: `Order ${orderNumber} confirmed successfully.`,
        smsEffect,
        tone,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm order');
    } finally {
      setBusy(false);
    }
  }

  function handleTriggerClick() {
    if (isRisky) {
      setOpenWarning(true);
    } else {
      void executeConfirm();
    }
  }

  return (
    <>
      <Button onClick={handleTriggerClick} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-2 size-4" />
        )}
        Confirm Order
      </Button>

      {/* Advisory Modal for Risky Orders */}
      <Dialog open={openWarning} onOpenChange={setOpenWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <AlertTriangle className="size-6" />
            </div>
            <DialogTitle className="text-center">Delivery Risk Advisory</DialogTitle>
            <DialogDescription className="text-center">
              Customer delivery history suggests manual verification for Order{' '}
              <strong className="text-foreground">{orderNumber}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">
              Risk Level: {overallRiskLevel?.replaceAll('_', ' ') ?? 'Elevated'}
            </p>
            <p className="mt-1">
              Recommendation:{' '}
              <span className="font-medium underline">
                {recommendation?.replaceAll('_', ' ') ?? 'Manual verification recommended'}
              </span>
            </p>
            <p className="mt-1.5 text-muted-foreground">
              Reviewing the Steadfast courier return history or contacting the customer via phone/WhatsApp is strongly advised before dispatching.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            {onOpenVerification && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenWarning(false);
                  onOpenVerification();
                }}
                disabled={busy}
              >
                <PhoneCall className="mr-1.5 size-3.5" />
                Verify Customer First
              </Button>
            )}
            <Button
              type="button"
              variant={isRisky ? 'destructive' : 'default'}
              onClick={executeConfirm}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Confirming…
                </>
              ) : (
                'Confirm Anyway'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
