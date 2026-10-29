'use client';

import * as React from 'react';
import { Check, Loader2, Sparkles, Tag } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { formatMoney } from '@/lib/format/numbers';
import { calculateDiscountPercent, type VariantPriceItem } from './types';

interface QuickPriceDialogProps {
  readonly item: VariantPriceItem | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: (updatedItem: VariantPriceItem, message: string) => void;
}

export function QuickPriceDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: QuickPriceDialogProps) {
  const [amount, setAmount] = React.useState('');
  const [compareAtAmount, setCompareAtAmount] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sync inputs when item changes
  React.useEffect(() => {
    if (item && open) {
      setAmount(item.amount);
      setCompareAtAmount(item.compareAtAmount ?? '');
      setError(null);
    }
  }, [item, open]);

  if (!item) return null;

  const numAmount = Number(amount);
  const numCompare = compareAtAmount ? Number(compareAtAmount) : null;
  const isInvalidCompare =
    numCompare !== null && Number.isFinite(numCompare) && Number.isFinite(numAmount) && numCompare < numAmount;
  const discountPercent = calculateDiscountPercent(amount, compareAtAmount);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return;

    if (!amount.trim() || Number.isNaN(numAmount) || numAmount < 0) {
      setError('Please provide a valid non-negative selling price.');
      return;
    }

    if (isInvalidCompare) {
      setError('Compare-at (MSRP) price must be greater than or equal to the selling price.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/admin/pricing/variants/${item.variantId}/current`, {
        method: 'PUT',
        body: JSON.stringify({
          currency: item.currency,
          amount: amount.trim(),
          compareAtAmount: compareAtAmount.trim() ? compareAtAmount.trim() : null,
        }),
      });

      onOpenChange(false);
      onSuccess(
        {
          ...item,
          amount: amount.trim(),
          compareAtAmount: compareAtAmount.trim() ? compareAtAmount.trim() : null,
          status: 'ACTIVE',
        },
        `Updated live selling price for ${item.sku} to ${formatMoney(amount, item.currency)}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Failed to update price. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Tag className="size-4" />
            </div>
            <div>
              <DialogTitle>Set Current Retail Price</DialogTitle>
              <DialogDescription>
                Atomically replace the live storefront price for this variant.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Selected Variant Summary Card */}
        <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground truncate">{item.productTitle}</span>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {item.currency}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground font-mono">
            {item.variantTitle ? <span>{item.variantTitle}</span> : null}
            {item.variantTitle ? <span>•</span> : null}
            <span>SKU: {item.sku}</span>
          </div>
          <div className="pt-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Prior Active Price:</span>
            <span className="font-mono font-medium text-foreground">
              {formatMoney(item.amount, item.currency)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* New Selling Price */}
            <div className="space-y-1.5">
              <label htmlFor="quick-amount" className="text-xs font-medium text-foreground">
                Selling Price ({item.currency}) <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                  {item.currency === 'BDT' ? '৳' : item.currency === 'USD' ? '$' : '¥'}
                </span>
                <Input
                  id="quick-amount"
                  required
                  inputMode="decimal"
                  pattern="\d+(\.\d{1,4})?"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1450"
                  className="pl-7 font-mono tabular-nums"
                  disabled={submitting}
                  autoFocus
                />
              </div>
            </div>

            {/* Compare-At / Strike-Through Price */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="quick-compare-at" className="text-xs font-medium text-foreground">
                  Compare-At / MSRP
                </label>
                <span className="text-[10px] text-muted-foreground">Optional</span>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                  {item.currency === 'BDT' ? '৳' : item.currency === 'USD' ? '$' : '¥'}
                </span>
                <Input
                  id="quick-compare-at"
                  inputMode="decimal"
                  pattern="\d+(\.\d{1,4})?"
                  value={compareAtAmount}
                  onChange={(e) => setCompareAtAmount(e.target.value)}
                  placeholder="1650"
                  className="pl-7 font-mono tabular-nums"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          {/* Real-time Discount Feedback Banner */}
          {discountPercent !== null && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <Sparkles className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{discountPercent}% promotional markdown:</strong> Customers save{' '}
                {formatMoney(Number(compareAtAmount) - Number(amount), item.currency)} off original MSRP.
              </span>
            </div>
          )}

          {isInvalidCompare && (
            <p className="text-xs text-destructive">
              Compare-at price cannot be lower than the selling price.
            </p>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || isInvalidCompare || !amount.trim()}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Apply Live Price
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

