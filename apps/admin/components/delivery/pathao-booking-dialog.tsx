'use client';

import {
  AlertCircle,
  Building2,
  Calculator,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Package,
  Phone,
  Truck,
  User,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

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
import { fetchApiData } from '@/lib/api';
import type { CourierAccountDto, CourierQuoteDto } from '@maevelle/contracts';

import { CourierQuoteCard } from './courier-quote-card';

interface PathaoBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  version: number;
  deliveryNumber: string;
  recipient: {
    name: string;
    phone: string;
    address: string;
  };
  cod: {
    required: boolean;
    expectedAmount: string;
    currency: string;
  };
  courierAccounts: readonly CourierAccountDto[];
  customerShippingCharge?: string | null;
  onSuccess: () => Promise<void> | void;
}

export function PathaoBookingDialog({
  open,
  onOpenChange,
  deliveryId,
  version,
  deliveryNumber,
  recipient,
  cod,
  courierAccounts,
  customerShippingCharge,
  onSuccess,
}: PathaoBookingDialogProps) {
  const pathaoAccounts = courierAccounts.filter((a) => a.providerCode === 'PATHAO');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    pathaoAccounts[0]?.id ?? courierAccounts[0]?.id ?? '',
  );
  const [weightKg, setWeightKg] = useState('0.5');
  const [quote, setQuote] = useState<CourierQuoteDto | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setQuote(null);
      if (pathaoAccounts[0]) setSelectedAccountId(pathaoAccounts[0].id);
    }
  }, [open, pathaoAccounts]);

  const handleGetQuote = async () => {
    if (!selectedAccountId || !weightKg) return;
    setQuoteLoading(true);
    setError('');
    try {
      const res = await fetchApiData<CourierQuoteDto>(`/admin/deliveries/${deliveryId}/quotes`, {
        method: 'POST',
        body: JSON.stringify({
          integrationAccountId: selectedAccountId,
          packageWeightKg: weightKg,
        }),
      });
      setQuote(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to calculate live Pathao quote.');
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || bookingLoading) return;
    setBookingLoading(true);
    setError('');
    try {
      await fetchApiData(`/admin/deliveries/${deliveryId}/courier-bookings`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version,
          integrationAccountId: selectedAccountId,
          packageWeightKg: weightKg,
        }),
      });
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pathao booking request failed.');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Truck className="size-5 text-primary" /> Book with Pathao Courier
          </DialogTitle>
          <DialogDescription>
            Dispatch <strong className="text-foreground">{deliveryNumber}</strong> via Pathao Courier with authenticated tracking & COD collection.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleConfirmBooking} className="space-y-4 text-xs">
          {/* Account Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="accountSelect" className="text-xs font-medium">Pathao Integration Account</Label>
            {pathaoAccounts.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded border border-amber-200">
                No active Pathao account configured. Please configure Pathao under Delivery → Couriers first.
              </p>
            ) : (
              <select
                id="accountSelect"
                className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary"
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setQuote(null);
                }}
              >
                {pathaoAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.providerCode})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Recipient Snapshot */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <p className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
              <User className="size-3.5 text-primary" /> Recipient Details
            </p>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t text-[11px]">
              <div>
                <span>Customer:</span> <strong className="text-foreground">{recipient.name}</strong>
              </div>
              <div>
                <span>Phone:</span> <strong className="text-foreground">{recipient.phone}</strong>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Address: <strong className="text-foreground">{recipient.address}</strong>
            </p>
          </div>

          {/* Weight & Parcel Config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="weightInput" className="text-xs font-medium flex items-center justify-between">
                <span>Parcel Weight (kg)</span>
                <span className="text-[10px] text-muted-foreground">Accurate for quotes</span>
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id="weightInput"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="50"
                  value={weightKg}
                  onChange={(e) => {
                    setWeightKg(e.target.value);
                    setQuote(null);
                  }}
                  className="text-xs h-8"
                  required
                />
              </div>
              <div className="flex gap-1 pt-0.5">
                {['0.5', '1.0', '2.0'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setWeightKg(preset);
                      setQuote(null);
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted text-muted-foreground"
                  >
                    {preset} kg
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">COD Collection Amount</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground h-8 flex items-center justify-between">
                <span>{cod.required ? `${cod.expectedAmount} ${cod.currency}` : 'None (Prepaid)'}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {cod.required ? 'Cash on Delivery' : 'Already Paid'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Authoritative balance from order payment ledger.</p>
            </div>
          </div>

          {/* Live Quote Section */}
          <div className="space-y-2 pt-1 border-t">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                <Calculator className="size-3.5" /> Provider Live Quote
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGetQuote}
                disabled={quoteLoading || !selectedAccountId || !weightKg}
                className="h-7 text-xs"
              >
                {quoteLoading ? (
                  <>
                    <Loader2 className="size-3 animate-spin mr-1" /> Calculating…
                  </>
                ) : (
                  'Calculate quote'
                )}
              </Button>
            </div>

            {quote ? (
              <CourierQuoteCard
                quote={quote}
                customerShippingCharge={customerShippingCharge}
                providerName="Pathao"
              />
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                Optional: Calculate estimated delivery cost and COD fee before confirming.
              </p>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={bookingLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={bookingLoading || pathaoAccounts.length === 0}
              className="gap-1.5"
            >
              {bookingLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Submitting booking…
                </>
              ) : (
                <>
                  <Truck className="size-3.5" /> Confirm Pathao Booking
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
