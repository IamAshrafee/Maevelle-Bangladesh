'use client';

import * as React from 'react';
import { Ticket, AlertCircle, Plus, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiRequest, ApiRequestError } from '@/lib/api';
import type { PromotionItem } from './types';

interface AddCouponDialogProps {
  readonly promotion: PromotionItem | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function AddCouponDialog({
  promotion,
  open,
  onOpenChange,
  onSuccess,
}: AddCouponDialogProps) {
  const [code, setCode] = React.useState('');
  const [usageLimitTotal, setUsageLimitTotal] = React.useState('');
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCode('');
      setUsageLimitTotal('');
      setUsageLimitPerCustomer('');
      setError(null);
    }
  }, [open]);

  if (!promotion) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promotion) return;
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) {
      setError('Please enter a coupon code.');
      return;
    }

    setBusy(true);
    setError(null);

    const promoId = promotion.id;
    try {
      await apiRequest(`/admin/promotions/${promoId}/coupons`, {
        method: 'POST',
        body: JSON.stringify({
          code: cleanCode,
          usageLimitTotal: usageLimitTotal ? parseInt(usageLimitTotal, 10) : null,
          usageLimitPerCustomer: usageLimitPerCustomer ? parseInt(usageLimitPerCustomer, 10) : null,
        }),
      });

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to add coupon code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Ticket className="size-4" />
            </div>
            <div>
              <DialogTitle>Add Coupon Code</DialogTitle>
              <DialogDescription>
                Attach a new redemption code to <strong className="text-foreground">{promotion.name}</strong>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="coupon-code" className="text-xs font-semibold text-foreground">
              Coupon Code <span className="text-destructive">*</span>
            </label>
            <Input
              id="coupon-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. FLASH20, SUMMER15"
              autoFocus
              className="font-mono uppercase tracking-wider"
              required
            />
            <p className="text-[0.7rem] text-muted-foreground">
              Customers will enter this code at checkout to claim the benefit.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="limit-total" className="text-xs font-medium text-foreground">
                  Global Usage Cap
                </label>
                <TooltipProvider delay={150}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="text-[0.7rem] text-muted-foreground cursor-help underline decoration-dotted">
                          Optional
                        </span>
                      }
                    />
                    <TooltipContent>Maximum total orders that can redeem this code across all customers.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="limit-total"
                type="number"
                min="1"
                placeholder="Unlimited"
                value={usageLimitTotal}
                onChange={(e) => setUsageLimitTotal(e.target.value)}
                className="tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="limit-customer" className="text-xs font-medium text-foreground">
                  Per-Customer Limit
                </label>
                <TooltipProvider delay={150}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="text-[0.7rem] text-muted-foreground cursor-help underline decoration-dotted">
                          Optional
                        </span>
                      }
                    />
                    <TooltipContent>Maximum times each unique customer account can use this code.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="limit-customer"
                type="number"
                min="1"
                placeholder="1 (default)"
                value={usageLimitPerCustomer}
                onChange={(e) => setUsageLimitPerCustomer(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !code.trim()} className="gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save Code
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
