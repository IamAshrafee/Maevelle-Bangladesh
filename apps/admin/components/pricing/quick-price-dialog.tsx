'use client';

import * as React from 'react';
import { Check, Loader2, Sparkles, Tag } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MoneyField } from '@/components/ui/money-field';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { formatMoney } from '@/lib/format/numbers';
import { calculateDiscountPercent, type VariantPriceItem } from './types';

interface QuickPriceDialogProps {
  readonly item: VariantPriceItem | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: (updatedItem: VariantPriceItem, message: string) => void;
}

export function QuickPriceDialog({ item, open, onOpenChange, onSuccess }: QuickPriceDialogProps) {
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

  const isDirty = Boolean(
    item &&
      (amount !== item.amount || compareAtAmount !== (item.compareAtAmount ?? '')),
  );

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    isDirty,
    isSubmitting: submitting,
    onClose: () => onOpenChange(false),
    confirmTitle: 'Discard price changes?',
    confirmDescription:
      'You have entered price updates for this variant. Closing now will discard them.',
  });

  if (!item) return null;

  const numAmount = Number(amount);
  const numCompare = compareAtAmount ? Number(compareAtAmount) : null;
  const isInvalidCompare =
    numCompare !== null &&
    Number.isFinite(numCompare) &&
    Number.isFinite(numAmount) &&
    numCompare < numAmount;
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
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="shrink-0 border-b border-border/70 px-5 py-4 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Tag className="size-4" />
              </div>
              <div>
                <SheetTitle>Set Current Retail Price</SheetTitle>
                <SheetDescription>
                  Atomically replace the live storefront price for this variant.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Selected Variant Summary Card */}
              <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MoneyField
                  id="quick-amount"
                  label={`Selling Price (${item.currency})`}
                  currencySymbol={item.currency === 'BDT' ? '৳' : item.currency}
                  placeholder="1450"
                  value={amount}
                  onChange={setAmount}
                  disabled={submitting}
                  required
                />

                <MoneyField
                  id="quick-compare-at"
                  label="Compare-At / MSRP"
                  currencySymbol={item.currency === 'BDT' ? '৳' : item.currency}
                  placeholder="1650"
                  value={compareAtAmount}
                  onChange={setCompareAtAmount}
                  disabled={submitting}
                  description="Optional strike-through MSRP"
                />
              </div>

              {/* Real-time Discount Feedback Banner */}
              {discountPercent !== null && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{discountPercent}% promotional markdown:</strong> Customers save{' '}
                    {formatMoney(Number(compareAtAmount) - Number(amount), item.currency)} off
                    original MSRP.
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
            </div>

            <SheetFooter className="shrink-0 border-t border-border/70 bg-card/50 px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-3 flex-row justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
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
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
  );
}
