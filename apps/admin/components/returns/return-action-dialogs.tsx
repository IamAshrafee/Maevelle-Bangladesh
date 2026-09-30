'use client';

import {
  AlertCircle,
  Archive,
  ArrowRight,
  Ban,
  CheckCircle2,
  DollarSign,
  Info,
  Loader2,
  PackageCheck,
  ShieldAlert,
  Truck,
  Warehouse,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest, fetchApiData } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReturnCaseLineSummary {
  id: string;
  sku: string;
  product_title: string;
  requested_quantity: string;
  authorized_quantity: string;
  received_quantity: string;
}

export interface ReturnCaseHeaderSummary {
  id: string;
  return_number: string;
  version: string;
  order_id?: string | undefined;
  transport_status?: string | undefined;
  lines: readonly ReturnCaseLineSummary[];
}

export interface ReturnReceiptLineSummary {
  id: string;
  receipt_number: string;
  version: string;
  sku: string;
  quantity: string;
  inspected_quantity: string;
  condition_code?: string | undefined;
}

/* -------------------------------------------------------------------------- */
/* 1. Authorize Return Dialog                                                 */
/* -------------------------------------------------------------------------- */

interface AuthorizeReturnDialogProps {
  returnCase: ReturnCaseHeaderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function AuthorizeReturnDialog({
  returnCase,
  open,
  onOpenChange,
  onSuccess,
}: AuthorizeReturnDialogProps) {
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (returnCase && open) {
      setDecision('APPROVE');
      setReason('');
      setError('');
      const initial: Record<string, number> = {};
      for (const line of returnCase.lines) {
        initial[line.id] = Math.max(0, Number(line.requested_quantity) || 1);
      }
      setQuantities(initial);
    }
  }, [returnCase, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCase) return;

    setBusy(true);
    setError('');

    try {
      const linePayload =
        decision === 'APPROVE'
          ? returnCase.lines.map((l) => ({
              returnLineId: l.id,
              quantity: String(quantities[l.id] ?? Number(l.requested_quantity)),
            }))
          : undefined;

      await apiRequest(`/admin/returns/${returnCase.id}/authorization`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(returnCase.version),
          decision,
          lines: linePayload,
          reason: reason || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authorize return');
    } finally {
      setBusy(false);
    }
  };

  if (!returnCase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Authorize Return Case #{returnCase.return_number}
          </DialogTitle>
          <DialogDescription>
            Approve or reject the buyer&apos;s return request. Authorizing allows warehouse staff
            to post physical receipts.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Decision</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDecision('APPROVE')}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                  decision === 'APPROVE'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 ring-2 ring-emerald-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Approve Return
              </button>
              <button
                type="button"
                onClick={() => setDecision('REJECT')}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                  decision === 'REJECT'
                    ? 'border-red-600 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-300 ring-2 ring-red-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <XCircle className="h-4 w-4 text-red-600" />
                Reject Return
              </button>
            </div>
          </div>

          {decision === 'APPROVE' && (
            <div className="space-y-2">
              <Label>Authorize Line Quantities</Label>
              <div className="border rounded-md overflow-hidden divide-y divide-border">
                {returnCase.lines.map((line) => (
                  <div
                    key={line.id}
                    className="p-3 flex items-center justify-between gap-4 bg-card text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{line.product_title}</p>
                      <p className="text-muted-foreground font-mono text-[11px]">{line.sku}</p>
                      <p className="text-muted-foreground text-[11px]">
                        Requested: {line.requested_quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label htmlFor={`qty-${line.id}`} className="text-xs">
                        Authorize:
                      </Label>
                      <Input
                        id={`qty-${line.id}`}
                        type="number"
                        min="0"
                        max={Number(line.requested_quantity)}
                        step="1"
                        value={quantities[line.id] ?? Number(line.requested_quantity)}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [line.id]: Math.min(
                              Number(line.requested_quantity),
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          }))
                        }
                        className="w-20 h-8 text-right font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-reason">
              {decision === 'APPROVE' ? 'Approval Notes (Optional)' : 'Rejection Reason (Required)'}
            </Label>
            <Textarea
              id="auth-reason"
              placeholder={
                decision === 'APPROVE'
                  ? 'e.g. Approved per customer support exception.'
                  : 'e.g. Return requested after policy expiry (30 days).'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={decision === 'REJECT'}
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (decision === 'REJECT' && !reason.trim())}
              variant={decision === 'APPROVE' ? 'default' : 'destructive'}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing…
                </>
              ) : decision === 'APPROVE' ? (
                'Confirm Authorization'
              ) : (
                'Reject Return Request'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Reverse Shipment Dialog                                                 */
/* -------------------------------------------------------------------------- */

interface ReverseShipmentDialogProps {
  returnCase: ReturnCaseHeaderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function ReverseShipmentDialog({
  returnCase,
  open,
  onOpenChange,
  onSuccess,
}: ReverseShipmentDialogProps) {
  const [providerCode, setProviderCode] = useState('PATHAO');
  const [trackingReference, setTrackingReference] = useState('');
  const [externalConsignmentId, setExternalConsignmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setProviderCode('PATHAO');
      setTrackingReference('');
      setExternalConsignmentId('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCase) return;

    setBusy(true);
    setError('');

    try {
      await apiRequest(`/admin/returns/${returnCase.id}/reverse-shipments`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(returnCase.version),
          providerCode,
          trackingReference: trackingReference.trim() || undefined,
          externalConsignmentId: externalConsignmentId.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register reverse shipment');
    } finally {
      setBusy(false);
    }
  };

  if (!returnCase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Book Reverse Shipment #{returnCase.return_number}
          </DialogTitle>
          <DialogDescription>
            Register the return courier or reverse pickup consignment tracking reference.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>Courier Provider</Label>
            <Select value={providerCode} onValueChange={(val) => val && setProviderCode(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PATHAO">Pathao Reverse Pickup</SelectItem>
                <SelectItem value="STEADFAST">Steadfast Courier</SelectItem>
                <SelectItem value="REDX">RedX Reverse</SelectItem>
                <SelectItem value="PAPERFLY">Paperfly Go</SelectItem>
                <SelectItem value="SUNDARBAN">Sundarban Courier</SelectItem>
                <SelectItem value="CUSTOMER_DROP_OFF">Customer In-Store Drop-off</SelectItem>
                <SelectItem value="MERCHANT_FLEET">Merchant Fleet / Driver</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rev-track">Tracking / Consignment Reference</Label>
            <Input
              id="rev-track"
              placeholder="e.g. CN-REV-987123"
              value={trackingReference}
              onChange={(e) => setTrackingReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rev-cons">External Provider Consignment ID (Optional)</Label>
            <Input
              id="rev-cons"
              placeholder="e.g. PTH-RET-12345"
              value={externalConsignmentId}
              onChange={(e) => setExternalConsignmentId(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Reverse Shipment'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Transition Transport Dialog                                             */
/* -------------------------------------------------------------------------- */

interface TransitionTransportDialogProps {
  returnCase: ReturnCaseHeaderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function TransitionTransportDialog({
  returnCase,
  open,
  onOpenChange,
  onSuccess,
}: TransitionTransportDialogProps) {
  const [nextStatus, setNextStatus] = useState<'IN_TRANSIT' | 'ARRIVED' | 'LOST'>('IN_TRANSIT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (returnCase && open) {
      setError('');
      if (returnCase.transport_status === 'IN_TRANSIT') {
        setNextStatus('ARRIVED');
      } else {
        setNextStatus('IN_TRANSIT');
      }
    }
  }, [returnCase, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCase) return;

    setBusy(true);
    setError('');

    try {
      await apiRequest(`/admin/returns/${returnCase.id}/transport`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(returnCase.version),
          nextStatus,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transport status');
    } finally {
      setBusy(false);
    }
  };

  if (!returnCase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Update Transport Status #{returnCase.return_number}
          </DialogTitle>
          <DialogDescription>
            Update reverse courier transit progress independently of warehouse receipt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Next Transport State</Label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setNextStatus('IN_TRANSIT')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-sm transition-all ${
                  nextStatus === 'IN_TRANSIT'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-300 ring-2 ring-blue-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <Truck className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">In Transit (Returning)</p>
                  <p className="text-xs text-muted-foreground">
                    Courier has collected the package and it is in reverse transit back to the
                    warehouse.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setNextStatus('ARRIVED')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-sm transition-all ${
                  nextStatus === 'ARRIVED'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 ring-2 ring-emerald-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <PackageCheck className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Arrived at Facility</p>
                  <p className="text-xs text-muted-foreground">
                    Courier has delivered the parcel to the facility. Awaiting physical unboxing and
                    receipt.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setNextStatus('LOST')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-sm transition-all ${
                  nextStatus === 'LOST'
                    ? 'border-red-600 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-300 ring-2 ring-red-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <ShieldAlert className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Lost in Reverse Transit</p>
                  <p className="text-xs text-muted-foreground">
                    Courier confirmed package is lost or untraceable. Enables claim filing.
                  </p>
                </div>
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating…
                </>
              ) : (
                'Confirm Status Update'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Post Return Receipt Dialog                                              */
/* -------------------------------------------------------------------------- */

interface WarehouseLocation {
  id: string;
  name: string;
  capabilities: readonly string[];
}

interface PostReturnReceiptDialogProps {
  returnCase: ReturnCaseHeaderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function PostReturnReceiptDialog({
  returnCase,
  open,
  onOpenChange,
  onSuccess,
}: PostReturnReceiptDialogProps) {
  const [locations, setLocations] = useState<readonly WarehouseLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setLocationsLoading(true);
      fetchApiData<readonly WarehouseLocation[]>('/admin/warehouse/locations')
        .then((res) => {
          const valid = (res ?? []).filter((l) => l.capabilities.includes('STOCK_HOLDING'));
          setLocations(valid);
          if (valid[0]) {
            setSelectedLocationId(valid[0].id);
          }
        })
        .catch(() => setLocations([]))
        .finally(() => setLocationsLoading(false));

      if (returnCase) {
        const initial: Record<string, number> = {};
        for (const line of returnCase.lines) {
          const authQty = Number(line.authorized_quantity) || Number(line.requested_quantity) || 0;
          const recQty = Number(line.received_quantity) || 0;
          const remaining = Math.max(0, authQty - recQty);
          initial[line.id] = remaining;
        }
        setReceivedQuantities(initial);
      }
    }
  }, [open, returnCase]);

  const handleReceiveAll = () => {
    if (!returnCase) return;
    const updated: Record<string, number> = {};
    for (const line of returnCase.lines) {
      const authQty = Number(line.authorized_quantity) || Number(line.requested_quantity) || 0;
      const recQty = Number(line.received_quantity) || 0;
      updated[line.id] = Math.max(0, authQty - recQty);
    }
    setReceivedQuantities(updated);
  };

  const handleClearAll = () => {
    if (!returnCase) return;
    const updated: Record<string, number> = {};
    for (const line of returnCase.lines) {
      updated[line.id] = 0;
    }
    setReceivedQuantities(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCase || !selectedLocationId) return;

    // Filter lines where quantity > 0
    const linesToPost = returnCase.lines
      .filter((l) => (receivedQuantities[l.id] ?? 0) > 0)
      .map((l) => ({
        returnLineId: l.id,
        quantity: String(receivedQuantities[l.id]),
      }));

    if (linesToPost.length === 0) {
      setError('Please specify at least one line with quantity greater than 0 to receive.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      await apiRequest(`/admin/returns/${returnCase.id}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          locationId: selectedLocationId,
          lines: linesToPost,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post physical return receipt');
    } finally {
      setBusy(false);
    }
  };

  if (!returnCase) return null;

  const totalReceivingNow = Object.values(receivedQuantities).reduce((acc, v) => acc + (v || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            Post Physical Return Receipt #{returnCase.return_number}
          </DialogTitle>
          <DialogDescription>
            Record physically unboxed items arriving into warehouse receiving. Items will enter
            Inspection before inventory disposition.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>Receiving Warehouse / Location</Label>
            {locationsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading warehouse locations…
              </div>
            ) : (
              <Select value={selectedLocationId} onValueChange={(val) => val && setSelectedLocationId(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse facility" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items to Receive</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleReceiveAll}
                >
                  Receive All Remaining
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={handleClearAll}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-12 gap-2 bg-muted/60 p-2.5 text-xs font-semibold text-muted-foreground border-b">
                <div className="col-span-5">Product / SKU</div>
                <div className="col-span-2 text-right">Authorized</div>
                <div className="col-span-2 text-right">Received</div>
                <div className="col-span-3 text-right">Receive Now</div>
              </div>

              <div className="divide-y divide-border">
                {returnCase.lines.map((line) => {
                  const authQty =
                    Number(line.authorized_quantity) || Number(line.requested_quantity) || 0;
                  const recQty = Number(line.received_quantity) || 0;
                  const remaining = Math.max(0, authQty - recQty);

                  return (
                    <div
                      key={line.id}
                      className="grid grid-cols-12 gap-2 p-3 items-center text-xs bg-card"
                    >
                      <div className="col-span-5 min-w-0">
                        <p className="font-medium text-foreground truncate">{line.product_title}</p>
                        <p className="text-muted-foreground font-mono text-[11px]">{line.sku}</p>
                      </div>
                      <div className="col-span-2 text-right font-mono text-muted-foreground">
                        {authQty}
                      </div>
                      <div className="col-span-2 text-right font-mono text-muted-foreground">
                        {recQty}
                      </div>
                      <div className="col-span-3 flex justify-end">
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          step="1"
                          disabled={remaining === 0}
                          value={receivedQuantities[line.id] ?? remaining}
                          onChange={(e) =>
                            setReceivedQuantities((prev) => ({
                              ...prev,
                              [line.id]: Math.min(
                                remaining,
                                Math.max(0, Number(e.target.value) || 0),
                              ),
                            }))
                          }
                          className="w-20 h-8 text-right font-mono text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <Alert className="bg-amber-500/10 text-amber-900 dark:text-amber-300 border-amber-500/20 py-2">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Posting physical receipt creates a return receipt and moves stock into the warehouse
              quarantine/inspection hold. It does <strong>not</strong> immediately restock items into
              sellable inventory until condition inspection is completed.
            </AlertDescription>
          </Alert>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || totalReceivingNow <= 0}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Posting Receipt…
                </>
              ) : (
                `Post Receipt (${totalReceivingNow} items)`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Inspect Receipt Line Dialog                                             */
/* -------------------------------------------------------------------------- */

interface InspectReceiptLineDialogProps {
  receiptLine: ReturnReceiptLineSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function InspectReceiptLineDialog({
  receiptLine,
  open,
  onOpenChange,
  onSuccess,
}: InspectReceiptLineDialogProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [outcome, setOutcome] = useState<'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'REJECTED_RETURN'>(
    'SELLABLE',
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (receiptLine && open) {
      setError('');
      setNote('');
      const total = Number(receiptLine.quantity) || 0;
      const inspected = Number(receiptLine.inspected_quantity) || 0;
      const remaining = Math.max(1, total - inspected);
      setQuantity(remaining);
      setOutcome('SELLABLE');
    }
  }, [receiptLine, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptLine) return;

    setBusy(true);
    setError('');

    try {
      await apiRequest(`/admin/return-receipt-lines/${receiptLine.id}/inspect`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(receiptLine.version),
          quantity: String(quantity),
          outcome,
          note: note.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post inspection disposition');
    } finally {
      setBusy(false);
    }
  };

  if (!receiptLine) return null;

  const total = Number(receiptLine.quantity) || 0;
  const inspected = Number(receiptLine.inspected_quantity) || 0;
  const maxInspectable = Math.max(1, total - inspected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Inspect Item Condition &amp; Stock Disposition
          </DialogTitle>
          <DialogDescription>
            Record physical condition inspection and route items into sellable inventory or damage
            loss.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-muted/40 p-3 rounded-lg border space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receipt Number:</span>
              <span className="font-mono font-medium">{receiptLine.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SKU:</span>
              <span className="font-mono font-medium">{receiptLine.sku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Received / Inspected:</span>
              <span>
                {inspected} of {total} inspected (
                <strong className="text-foreground">{maxInspectable} remaining</strong>)
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspect-qty">Quantity to Inspect</Label>
            <Input
              id="inspect-qty"
              type="number"
              min="1"
              max={maxInspectable}
              step="1"
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.min(maxInspectable, Math.max(1, Number(e.target.value) || 1)))
              }
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Disposition Decision</Label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setOutcome('SELLABLE')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-xs transition-all ${
                  outcome === 'SELLABLE'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200 ring-2 ring-emerald-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Restock as Sellable</p>
                  <p className="text-[11px] text-muted-foreground">
                    Item is in pristine/original condition with intact tags. Quantity will return to
                    sellable inventory.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('DAMAGED')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-xs transition-all ${
                  outcome === 'DAMAGED'
                    ? 'border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200 ring-2 ring-amber-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Damaged / Write-off</p>
                  <p className="text-[11px] text-muted-foreground">
                    Item is physically torn, stained, or broken. Allocated to damaged stock ledger;
                    not sellable.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('QUARANTINE')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-xs transition-all ${
                  outcome === 'QUARANTINE'
                    ? 'border-purple-600 bg-purple-50 text-purple-950 dark:bg-purple-950/40 dark:text-purple-200 ring-2 ring-purple-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <Archive className="h-4 w-4 mt-0.5 text-purple-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Hold in Quarantine</p>
                  <p className="text-[11px] text-muted-foreground">
                    Suspicious or unconfirmed authenticity/defects. Retained for supervisor review.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('REJECTED_RETURN')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left text-xs transition-all ${
                  outcome === 'REJECTED_RETURN'
                    ? 'border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-200 ring-2 ring-red-600'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                <Ban className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Reject Return</p>
                  <p className="text-[11px] text-muted-foreground">
                    Wrong product returned by customer or fraud detected. No refund/credit granted.
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspect-note">Inspector Observation / Notes</Label>
            <Textarea
              id="inspect-note"
              placeholder="e.g. Tags verified, original packaging intact, restocked to Bin A-12."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving Disposition…
                </>
              ) : (
                'Post Disposition'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Link Refund Dialog                                                      */
/* -------------------------------------------------------------------------- */

interface ExistingRefund {
  id: string;
  refundNumber: string;
  amount: string;
  status: string;
  reasonCode?: string | undefined;
}

interface LinkRefundDialogProps {
  returnCase: ReturnCaseHeaderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function LinkRefundDialog({
  returnCase,
  open,
  onOpenChange,
  onSuccess,
}: LinkRefundDialogProps) {
  const [refunds, setRefunds] = useState<readonly ExistingRefund[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [selectedRefundId, setSelectedRefundId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setRefundsLoading(true);
      fetchApiData<{ items: readonly ExistingRefund[] }>('/admin/refunds?pageSize=50')
        .then((res) => {
          const list = res?.items ?? [];
          setRefunds(list);
          if (list[0]) setSelectedRefundId(list[0].id);
        })
        .catch(() => setRefunds([]))
        .finally(() => setRefundsLoading(false));
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCase || !selectedRefundId) return;

    setBusy(true);
    setError('');

    try {
      await apiRequest(`/admin/returns/${returnCase.id}/refunds`, {
        method: 'POST',
        body: JSON.stringify({ refundId: selectedRefundId }),
      });

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link refund');
    } finally {
      setBusy(false);
    }
  };

  if (!returnCase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Link Payment Refund #{returnCase.return_number}
          </DialogTitle>
          <DialogDescription>
            Associate an authoritative Finance refund ledger record to this return case.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>Select Existing Refund</Label>
            {refundsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading finance refunds…
              </div>
            ) : refunds.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3 border rounded-md">
                No existing refunds found. Issue the refund via Payments/Finance first, then link it
                here.
              </p>
            ) : (
              <Select value={selectedRefundId} onValueChange={(val) => val && setSelectedRefundId(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a refund" />
                </SelectTrigger>
                <SelectContent>
                  {refunds.map((ref) => (
                    <SelectItem key={ref.id} value={ref.id}>
                      {ref.refundNumber} · ৳{ref.amount} ({ref.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Alert className="bg-muted text-muted-foreground py-2">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Return approval does not automatically deduct gateway funds or credit customer wallets.
              Linking ensures full auditability between warehouse physical returns and cash
              reconciliation.
            </AlertDescription>
          </Alert>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !selectedRefundId}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking…
                </>
              ) : (
                'Link Refund'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. Cancel Return Case Dialog                                               */
/* -------------------------------------------------------------------------- */

interface CancelReturnDialogProps {
  returnCase: ReturnCaseHeaderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function CancelReturnDialog({
  returnCase,
  open,
  onOpenChange,
  onSuccess,
}: CancelReturnDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCase) return;

    setBusy(true);
    setError('');

    try {
      await apiRequest(`/admin/returns/${returnCase.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(returnCase.version),
          reason: reason.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel return case');
    } finally {
      setBusy(false);
    }
  };

  if (!returnCase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" />
            Cancel Return Case #{returnCase.return_number}
          </DialogTitle>
          <DialogDescription>
            Cancelling terminates the return lifecycle. No physical receipts can be posted against
            a cancelled case.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Cancellation Reason (Required)</Label>
            <Textarea
              id="cancel-reason"
              placeholder="e.g. Customer decided to keep the product after resolving issue with support."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || !reason.trim()}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling…
                </>
              ) : (
                'Confirm Cancellation'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
