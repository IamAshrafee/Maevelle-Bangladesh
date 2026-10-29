'use client';

import * as React from 'react';
import {
  CalendarClock,
  HelpCircle,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  Zap,
} from 'lucide-react';

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
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { formatMoney } from '@/lib/format/numbers';
import {
  calculateDiscountPercent,
  type CatalogProductDetail,
  type CatalogProductSummary,
  type CatalogVariantOption,
  type VariantPriceItem,
} from './types';

interface CreatePriceSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly products: readonly CatalogProductSummary[];
  readonly existingPrices: readonly VariantPriceItem[];
  readonly onSuccess: (message: string) => void;
}

export function CreatePriceSheet({
  open,
  onOpenChange,
  products,
  existingPrices,
  onSuccess,
}: CreatePriceSheetProps) {
  // Mode toggle: 'live' (set current price right now) vs 'scheduled' (time-window / campaign)
  const [mode, setMode] = React.useState<'live' | 'scheduled'>('live');

  // Product & Variant selection
  const [selectedProductId, setSelectedProductId] = React.useState<string>('');
  const [productDetail, setProductDetail] = React.useState<CatalogProductDetail | null>(null);
  const [selectedVariantId, setSelectedVariantId] = React.useState<string>('');
  const [loadingProduct, setLoadingProduct] = React.useState(false);

  // Form Fields
  const [currency, setCurrency] = React.useState<string>('BDT');
  const [amount, setAmount] = React.useState<string>('');
  const [compareAtAmount, setCompareAtAmount] = React.useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = React.useState<string>('');
  const [effectiveTo, setEffectiveTo] = React.useState<string>('');
  const [status, setStatus] = React.useState<'ACTIVE' | 'DRAFT'>('ACTIVE');

  // States
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset when opened
  React.useEffect(() => {
    if (open) {
      setError(null);
      if (!selectedProductId && products.length > 0) {
        // Leave unselected so user chooses explicitly
      }
    }
  }, [open, products]);

  // Load product detail when product selection changes
  async function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    setSelectedVariantId('');
    setProductDetail(null);
    if (!productId) return;

    setLoadingProduct(true);
    setError(null);
    try {
      const res = await apiRequest<{ data: CatalogProductDetail }>(
        `/admin/catalog/products/${productId}`,
      );
      setProductDetail(res.data);
      const firstVariant = res.data?.variants?.[0];
      if (firstVariant && res.data.variants.length === 1) {
        setSelectedVariantId(firstVariant.id);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load product details.');
    } finally {
      setLoadingProduct(false);
    }
  }

  // Selected Variant Reference Data
  const selectedVariant: CatalogVariantOption | undefined = React.useMemo(() => {
    return productDetail?.variants.find((v) => v.id === selectedVariantId);
  }, [productDetail, selectedVariantId]);

  // Find existing active price for reference
  const currentActivePrice = React.useMemo(() => {
    if (!selectedVariantId) return null;
    return existingPrices.find(
      (p) => p.variantId === selectedVariantId && p.status === 'ACTIVE' && p.currency === currency,
    );
  }, [existingPrices, selectedVariantId, currency]);

  // Calculations
  const numAmount = Number(amount);
  const numCompare = compareAtAmount.trim() ? Number(compareAtAmount) : null;
  const isInvalidCompare =
    numCompare !== null && Number.isFinite(numCompare) && Number.isFinite(numAmount) && numCompare < numAmount;
  const discountPercent = calculateDiscountPercent(amount, compareAtAmount);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!selectedVariantId) {
      setError('Please select a variant SKU to price.');
      return;
    }

    if (!amount.trim() || Number.isNaN(numAmount) || numAmount < 0) {
      setError('Please provide a valid non-negative selling price.');
      return;
    }

    if (isInvalidCompare) {
      setError('Compare-at (MSRP) price must be greater than or equal to the selling price.');
      return;
    }

    if (mode === 'scheduled') {
      if (effectiveTo && effectiveFrom && new Date(effectiveTo) <= new Date(effectiveFrom)) {
        setError('Effective end date must be strictly after the effective start date.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'live') {
        // Direct atomic update of current price
        await apiRequest(`/admin/pricing/variants/${selectedVariantId}/current`, {
          method: 'PUT',
          body: JSON.stringify({
            currency,
            amount: amount.trim(),
            compareAtAmount: compareAtAmount.trim() ? compareAtAmount.trim() : null,
          }),
        });

        onOpenChange(false);
        resetForm();
        onSuccess(`Live selling price updated for ${selectedVariant?.sku ?? 'SKU'}.`);
      } else {
        // Scheduled / Campaign price creation
        const payload: Record<string, unknown> = {
          variantId: selectedVariantId,
          currency,
          amount: amount.trim(),
          compareAtAmount: compareAtAmount.trim() ? compareAtAmount.trim() : null,
          status,
        };

        if (effectiveFrom) {
          payload.effectiveFrom = new Date(effectiveFrom).toISOString();
        }
        if (effectiveTo) {
          payload.effectiveTo = new Date(effectiveTo).toISOString();
        }

        await apiRequest('/admin/pricing/prices', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        onOpenChange(false);
        resetForm();
        onSuccess(
          status === 'DRAFT'
            ? `Draft price schedule created for ${selectedVariant?.sku ?? 'SKU'}.`
            : `Authoritative price schedule created for ${selectedVariant?.sku ?? 'SKU'}.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Failed to save price definition. Please check for schedule overlaps.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSelectedProductId('');
    setSelectedVariantId('');
    setProductDetail(null);
    setAmount('');
    setCompareAtAmount('');
    setEffectiveFrom('');
    setEffectiveTo('');
    setError(null);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Tag className="size-4" />
            </div>
            <div>
              <SheetTitle>Set Variant Price</SheetTitle>
              <SheetDescription>
                Authoritative money definitions for storefront, cart, and promotions.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Mode Selector Segmented Tabs */}
        <div className="grid grid-cols-2 rounded-lg bg-muted/60 p-1 text-xs font-medium border border-border/60">
          <button
            type="button"
            onClick={() => setMode('live')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 transition-colors cursor-pointer ${
              mode === 'live'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap className="size-3.5 text-primary" />
            <span>Update Live Price Now</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('scheduled')}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 transition-colors cursor-pointer ${
              mode === 'scheduled'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarClock className="size-3.5 text-amber-500" />
            <span>Schedule Campaign</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Step 1: Product Selection */}
          <div className="space-y-1.5">
            <label htmlFor="create-product" className="text-xs font-medium text-foreground">
              Select Product <span className="text-destructive">*</span>
            </label>
            <NativeSelect
              id="create-product"
              required
              value={selectedProductId}
              onChange={(e) => void handleProductChange(e.target.value)}
              disabled={submitting}
              className="w-full"
            >
              <option value="" disabled>
                Choose Product…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Step 2: Variant Selection */}
          {selectedProductId && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="create-variant" className="text-xs font-medium text-foreground">
                  Select Variant SKU <span className="text-destructive">*</span>
                </label>
                {loadingProduct && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin text-primary" /> Loading variants…
                  </span>
                )}
              </div>
              <NativeSelect
                id="create-variant"
                required
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                disabled={submitting || loadingProduct || !productDetail}
                className="w-full"
              >
                <option value="" disabled>
                  Choose Variant / SKU…
                </option>
                {productDetail?.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.title ? `${variant.title} — ` : ''}SKU: {variant.sku}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          {/* Reference Card: Current Active Price & Landed Cost */}
          {selectedVariant && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-medium text-foreground">
                <span>SKU Reference: {selectedVariant.sku}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {currency}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div>
                  <span className="text-muted-foreground block">Current Live Price:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {currentActivePrice
                      ? formatMoney(currentActivePrice.amount, currentActivePrice.currency)
                      : 'None set yet'}
                  </span>
                </div>

                {selectedVariant.latestAcquisitionCost?.amount ? (
                  <div>
                    <span className="text-muted-foreground block">Landed Unit Cost:</span>
                    <span className="font-mono text-muted-foreground">
                      {formatMoney(
                        selectedVariant.latestAcquisitionCost.amount,
                        selectedVariant.latestAcquisitionCost.currency,
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Step 3: Currency & Pricing Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Currency */}
            <div className="space-y-1.5">
              <label htmlFor="create-currency" className="text-xs font-medium text-foreground">
                Currency
              </label>
              <NativeSelect
                id="create-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={submitting}
                className="w-full font-mono text-xs"
              >
                <option value="BDT">BDT (৳)</option>
                <option value="USD">USD ($)</option>
                <option value="CNY">CNY (¥)</option>
              </NativeSelect>
            </div>

            {/* Selling Price */}
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="create-amount" className="text-xs font-medium text-foreground">
                Selling Price ({currency}) <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                  {currency === 'BDT' ? '৳' : currency === 'USD' ? '$' : '¥'}
                </span>
                <Input
                  id="create-amount"
                  required
                  inputMode="decimal"
                  pattern="\d+(\.\d{1,4})?"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1450.00"
                  className="pl-7 font-mono tabular-nums"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          {/* Compare-At / Strike-through Price */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label htmlFor="create-compare-at" className="text-xs font-medium text-foreground">
                  Compare-At Price (MSRP)
                </label>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span tabIndex={0} className="inline-flex cursor-help">
                        <HelpCircle className="size-3 text-muted-foreground" aria-hidden="true" />
                      </span>
                    }
                  />
                  <TooltipContent>
                    Shown as a strikethrough original price on storefront with a discount badge.
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-[10px] text-muted-foreground">Optional</span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                {currency === 'BDT' ? '৳' : currency === 'USD' ? '$' : '¥'}
              </span>
              <Input
                id="create-compare-at"
                inputMode="decimal"
                pattern="\d+(\.\d{1,4})?"
                value={compareAtAmount}
                onChange={(e) => setCompareAtAmount(e.target.value)}
                placeholder="1690.00"
                className="pl-7 font-mono tabular-nums"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Discount feedback */}
          {discountPercent !== null && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <Sparkles className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{discountPercent}% discount markdown:</strong> Customers save{' '}
                {formatMoney(Number(compareAtAmount) - Number(amount), currency)} off MSRP.
              </span>
            </div>
          )}

          {isInvalidCompare && (
            <p className="text-xs text-destructive">
              Compare-at price must be greater than or equal to selling price.
            </p>
          )}

          {/* Step 4: Schedule Settings (Only in Scheduled Mode) */}
          {mode === 'scheduled' && (
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                <span>Campaign Schedule Settings</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Effective From */}
                <div className="space-y-1.5">
                  <label htmlFor="create-effective-from" className="text-xs font-medium text-foreground">
                    Effective From
                  </label>
                  <Input
                    id="create-effective-from"
                    type="datetime-local"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="font-mono text-xs"
                    disabled={submitting}
                  />
                  <p className="text-[10px] text-muted-foreground">Leave empty to activate immediately.</p>
                </div>

                {/* Effective To */}
                <div className="space-y-1.5">
                  <label htmlFor="create-effective-to" className="text-xs font-medium text-foreground">
                    Effective To (End)
                  </label>
                  <Input
                    id="create-effective-to"
                    type="datetime-local"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    className="font-mono text-xs"
                    disabled={submitting}
                  />
                  <p className="text-[10px] text-muted-foreground">Optional. Leave empty for open-ended.</p>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5 pt-1">
                <label htmlFor="create-status" className="text-xs font-medium text-foreground">
                  Initial Definition Status
                </label>
                <NativeSelect
                  id="create-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'DRAFT')}
                  disabled={submitting}
                  className="w-full text-xs"
                >
                  <option value="ACTIVE">Active (Eligible for resolution)</option>
                  <option value="DRAFT">Draft (Prepared, not yet resolved)</option>
                </NativeSelect>
              </div>

              <div className="rounded-md bg-muted/60 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
                <Info className="size-3.5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                <span>
                  The database guarantees transactional non-overlap: active schedules for one SKU cannot collide.
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <SheetFooter className="pt-2">
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
              disabled={submitting || !selectedVariantId || !amount.trim() || isInvalidCompare}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : mode === 'live' ? (
                <>
                  <Zap className="size-4" />
                  Set Live Price
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Create Price Schedule
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
