'use client';

import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import type { DeliveryAttemptOutcomeDto, DeliveryClaimDto } from '@maevelle/contracts';

/* -------------------------------------------------------------------------
 * Record Delivery Attempt Dialog
 * ------------------------------------------------------------------------- */

interface RecordDeliveryAttemptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  version: number;
  deliveryNumber: string;
  onSuccess: () => Promise<void> | void;
}

export function RecordDeliveryAttemptDialog({
  open,
  onOpenChange,
  deliveryId,
  version,
  deliveryNumber,
  onSuccess,
}: RecordDeliveryAttemptDialogProps) {
  const [outcome, setOutcome] = useState<DeliveryAttemptOutcomeDto>('CUSTOMER_UNAVAILABLE');
  const [reasonCode, setReasonCode] = useState('CUSTOMER_NOT_HOME');
  const [note, setNote] = useState('');
  const [nextAttemptAt, setNextAttemptAt] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetchApiData(`/admin/deliveries/${deliveryId}/attempts`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version,
          outcome,
          reasonCode: reasonCode.trim() || undefined,
          note: note.trim() || undefined,
          nextAttemptAt: nextAttemptAt ? new Date(nextAttemptAt).toISOString() : undefined,
          isFinal,
        }),
      });
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record delivery attempt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-amber-600" /> Record Delivery Attempt
          </DialogTitle>
          <DialogDescription>
            Log an attempt outcome for <strong className="text-foreground">{deliveryNumber}</strong> without immediately failing the order if a retry is planned.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="outcomeSelect" className="text-xs font-medium">Attempt Result</Label>
            <select
              id="outcomeSelect"
              className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as DeliveryAttemptOutcomeDto)}
            >
              <option value="CUSTOMER_UNAVAILABLE">Customer Unavailable (Not home / unanswered)</option>
              <option value="CUSTOMER_REFUSED">Customer Refused (Buyer refused delivery)</option>
              <option value="ADDRESS_NOT_FOUND">Address Not Found (Incorrect or unlocatable address)</option>
              <option value="RESCHEDULE_REQUESTED">Reschedule Requested (Customer requested later time)</option>
              <option value="PHONE_UNREACHABLE">Phone Unreachable (Switched off / out of network)</option>
              <option value="PROVIDER_FAILURE">Provider Failure (Rider accident, delay, vehicle issue)</option>
              <option value="OTHER_FAILED">Other Delivery Issue</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reasonInput" className="text-xs font-medium">Operational Reason Code</Label>
            <Input
              id="reasonInput"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              placeholder="e.g. DOOR_LOCKED, PHONE_SWITCHED_OFF"
              className="text-xs h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nextAttemptInput" className="text-xs font-medium flex items-center justify-between">
              <span>Next Scheduled Attempt (Optional)</span>
              <span className="text-[10px] text-muted-foreground">Sets buyer expectations</span>
            </Label>
            <Input
              id="nextAttemptInput"
              type="datetime-local"
              value={nextAttemptAt}
              onChange={(e) => setNextAttemptAt(e.target.value)}
              className="text-xs h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="noteInput" className="text-xs font-medium">Attempt Note (Optional)</Label>
            <Textarea
              id="noteInput"
              placeholder="Rider contacted customer at 3:15 PM, customer requested retry tomorrow morning."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-xs min-h-16"
              maxLength={500}
            />
          </div>

          <div className="flex items-center gap-2 pt-1 border-t">
            <input
              id="isFinalCheckbox"
              type="checkbox"
              checked={isFinal}
              onChange={(e) => setIsFinal(e.target.checked)}
              className="rounded border text-primary size-4"
            />
            <Label htmlFor="isFinalCheckbox" className="text-xs font-normal text-muted-foreground cursor-pointer">
              This is the final attempt. Mark delivery ready for failure / RTO if this fails.
            </Label>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Saving…
                </>
              ) : (
                'Save Attempt'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
 * Reconcile Unknown Courier Booking Dialog
 * ------------------------------------------------------------------------- */

interface ReconcileUnknownBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  version: number;
  deliveryNumber: string;
  activeBookingId: string;
  onSuccess: () => Promise<void> | void;
}

export function ReconcileUnknownBookingDialog({
  open,
  onOpenChange,
  deliveryId,
  version,
  deliveryNumber,
  activeBookingId,
  onSuccess,
}: ReconcileUnknownBookingDialogProps) {
  const [outcome, setOutcome] = useState<'BOOKED' | 'NOT_CREATED'>('BOOKED');
  const [providerBookingId, setProviderBookingId] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [reasonCode, setReasonCode] = useState('PROVIDER_CONFIRMED_NOT_CREATED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload =
        outcome === 'BOOKED'
          ? {
              version,
              outcome: 'BOOKED' as const,
              providerBookingId: providerBookingId.trim(),
              trackingReference: trackingReference.trim() || undefined,
            }
          : {
              version,
              outcome: 'NOT_CREATED' as const,
              reasonCode: reasonCode.trim(),
            };

      await fetchApiData(
        `/admin/deliveries/${deliveryId}/courier-bookings/${activeBookingId}/reconcile`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconcile unknown booking.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <HelpCircle className="size-5" /> Reconcile Unknown Courier Outcome
          </DialogTitle>
          <DialogDescription>
            The booking request for <strong className="text-foreground">{deliveryNumber}</strong> had an ambiguous outcome (network timeout or provider uncertainty).
            Check the courier dashboard before confirming to prevent duplicate consignments.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reconciled Verification Result</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutcome('BOOKED')}
                className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  outcome === 'BOOKED'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="size-3.5" /> Consignment Exists
                </span>
                <span className="text-[10px] font-normal opacity-80">
                  Parcel was created on the provider side.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOutcome('NOT_CREATED')}
                className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  outcome === 'NOT_CREATED'
                    ? 'border-destructive bg-destructive/10 text-destructive font-semibold'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <XCircle className="size-3.5" /> Not Created
                </span>
                <span className="text-[10px] font-normal opacity-80">
                  No parcel created; safe to rebook.
                </span>
              </button>
            </div>
          </div>

          {outcome === 'BOOKED' ? (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="space-y-1">
                <Label htmlFor="consignmentInput" className="text-xs font-medium">
                  Provider Consignment ID (Required)
                </Label>
                <Input
                  id="consignmentInput"
                  placeholder="e.g. 2603248384"
                  value={providerBookingId}
                  onChange={(e) => setProviderBookingId(e.target.value)}
                  required
                  className="text-xs h-8 font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="trackingInput" className="text-xs font-medium">
                  Tracking Reference / Number (Optional)
                </Label>
                <Input
                  id="trackingInput"
                  placeholder="e.g. PTH-982348"
                  value={trackingReference}
                  onChange={(e) => setTrackingReference(e.target.value)}
                  className="text-xs h-8 font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
              <Label htmlFor="reasonCodeInput" className="text-xs font-medium">
                Reason Code / Evidence
              </Label>
              <Input
                id="reasonCodeInput"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                placeholder="PROVIDER_CONFIRMED_NOT_CREATED"
                required
                className="text-xs h-8"
              />
              <p className="text-[11px] text-muted-foreground">
                Confirming as Not Created resets this Delivery so another courier booking can be attempted safely.
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (outcome === 'BOOKED' && !providerBookingId.trim())}
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Reconciling…
                </>
              ) : (
                'Save Reconciliation'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
 * Resolve Delivery Exception Dialog
 * ------------------------------------------------------------------------- */

interface ResolveExceptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  version: number;
  exceptionId: string;
  exceptionSummary: string;
  onSuccess: () => Promise<void> | void;
}

export function ResolveExceptionDialog({
  open,
  onOpenChange,
  deliveryId,
  version,
  exceptionId,
  exceptionSummary,
  onSuccess,
}: ResolveExceptionDialogProps) {
  const [resolution, setResolution] = useState<'RESOLVED' | 'IGNORED_WITH_REASON'>('RESOLVED');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setLoading(true);
    setError('');
    try {
      await fetchApiData(`/admin/deliveries/${deliveryId}/exceptions/${exceptionId}/resolve`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version,
          resolution,
          note: note.trim(),
        }),
      });
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve delivery exception.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" /> Resolve Exception
          </DialogTitle>
          <DialogDescription>
            {exceptionSummary}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="resolutionSelect" className="text-xs font-medium">Resolution Outcome</Label>
            <select
              id="resolutionSelect"
              className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as 'RESOLVED' | 'IGNORED_WITH_REASON')}
            >
              <option value="RESOLVED">Resolved (Issue investigated and cleared)</option>
              <option value="IGNORED_WITH_REASON">Ignored with Reason (Stale or non-critical exception)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="noteArea" className="text-xs font-medium">Resolution Notes (Required)</Label>
            <Textarea
              id="noteArea"
              placeholder="e.g. Contacted Pathao hub; parcel was verified intact and back on vehicle for re-attempt."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              className="text-xs min-h-20"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !note.trim()}>
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Resolving…
                </>
              ) : (
                'Resolve Exception'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
 * Open Courier Claim Dialog
 * ------------------------------------------------------------------------- */

interface OpenClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  version: number;
  deliveryNumber: string;
  defaultCurrency?: string;
  onSuccess: () => Promise<void> | void;
}

export function OpenClaimDialog({
  open,
  onOpenChange,
  deliveryId,
  version,
  deliveryNumber,
  defaultCurrency = 'BDT',
  onSuccess,
}: OpenClaimDialogProps) {
  const [reason, setReason] = useState<'LOST' | 'DAMAGED' | 'COD_MISMATCH' | 'OVERCHARGE' | 'OTHER'>('LOST');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetchApiData(`/admin/deliveries/${deliveryId}/claims`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version,
          reason,
          claimedAmount: claimedAmount.trim() || undefined,
          currency: defaultCurrency,
          notes: notes.trim() || undefined,
        }),
      });
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open courier claim.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-rose-600" /> Open Courier Claim
          </DialogTitle>
          <DialogDescription>
            Open a traceable insurance or dispute claim against the carrier for <strong className="text-foreground">{deliveryNumber}</strong>.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="claimReason" className="text-xs font-medium">Claim Reason</Label>
            <select
              id="claimReason"
              className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary"
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
            >
              <option value="LOST">Lost in Transit (Courier confirmed parcel missing)</option>
              <option value="DAMAGED">Damaged in Transit (Goods damaged while in courier custody)</option>
              <option value="COD_MISMATCH">COD Amount Mismatch (Courier collected different amount)</option>
              <option value="OVERCHARGE">Courier Overcharge (Incorrect delivery or weight fee)</option>
              <option value="OTHER">Other Operational Dispute</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claimedAmountInput" className="text-xs font-medium">Claimed Amount ({defaultCurrency})</Label>
            <Input
              id="claimedAmountInput"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 2400.00"
              value={claimedAmount}
              onChange={(e) => setClaimedAmount(e.target.value)}
              className="text-xs h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claimNotes" className="text-xs font-medium">Claim Details & Provider Reference (Optional)</Label>
            <Textarea
              id="claimNotes"
              placeholder="Dispute ticket #9482 filed with Pathao partner support on 2026-09-30."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-20"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Opening…
                </>
              ) : (
                'Open Claim'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------
 * Transition Delivery Claim Dialog
 * ------------------------------------------------------------------------- */

interface TransitionClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  claim: DeliveryClaimDto;
  onSuccess: () => Promise<void> | void;
}

export function TransitionClaimDialog({
  open,
  onOpenChange,
  deliveryId,
  claim,
  onSuccess,
}: TransitionClaimDialogProps) {
  const [nextStatus, setNextStatus] = useState<'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CLOSED'>('SUBMITTED');
  const [approvedAmount, setApprovedAmount] = useState(claim.approvedAmount ?? claim.claimedAmount ?? '');
  const [providerReference, setProviderReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetchApiData(`/admin/deliveries/${deliveryId}/claims/${claim.id}/transition`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version: claim.version,
          nextStatus,
          approvedAmount: approvedAmount.trim() || undefined,
          providerReference: providerReference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update courier claim status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Update Courier Claim: {claim.claimNumber}
          </DialogTitle>
          <DialogDescription>
            Current status: <strong className="text-foreground">{claim.status}</strong> · Reason: {claim.reason}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="nextStatusSelect" className="text-xs font-medium">Next Claim Status</Label>
            <select
              id="nextStatusSelect"
              className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as any)}
            >
              <option value="SUBMITTED">SUBMITTED (Claim sent to courier)</option>
              <option value="APPROVED">APPROVED (Courier accepted liability)</option>
              <option value="REJECTED">REJECTED (Courier denied compensation)</option>
              <option value="PAID">PAID (Compensation disbursed / settled)</option>
              <option value="CLOSED">CLOSED (Resolved and completed)</option>
            </select>
          </div>

          {(nextStatus === 'APPROVED' || nextStatus === 'PAID') && (
            <div className="space-y-1.5">
              <Label htmlFor="approvedAmtInput" className="text-xs font-medium">Approved Amount ({claim.currency})</Label>
              <Input
                id="approvedAmtInput"
                type="number"
                step="0.01"
                min="0"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                className="text-xs h-8"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="providerRefInput" className="text-xs font-medium">Provider Reference / Ticket #</Label>
            <Input
              id="providerRefInput"
              placeholder="e.g. CR-908234"
              value={providerReference}
              onChange={(e) => setProviderReference(e.target.value)}
              className="text-xs h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claimNotesArea" className="text-xs font-medium">Update Note</Label>
            <Textarea
              id="claimNotesArea"
              placeholder="Courier credit memo issued on monthly statement."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-16"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Updating…
                </>
              ) : (
                'Update Claim Status'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
