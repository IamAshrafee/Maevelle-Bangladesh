'use client';

import * as React from 'react';
import {
  AlertCircle,
  BadgePercent,
  Calendar,
  Check,
  Coins,
  Copy,
  Info,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  Ticket,
  X,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiRequest, ApiRequestError } from '@/lib/api';
import type { BenefitType, CatalogCategoryChoice, Combinability, PromotionType } from './types';

interface CreatePromotionSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function CreatePromotionSheet({
  open,
  onOpenChange,
  onSuccess,
}: CreatePromotionSheetProps) {
  // Form State
  const [name, setName] = React.useState('');
  const [promotionType, setPromotionType] = React.useState<PromotionType>('COUPON');
  const [benefitType, setBenefitType] = React.useState<BenefitType>('PERCENTAGE_DISCOUNT');
  const [benefitValue, setBenefitValue] = React.useState('10');
  const [combinability, setCombinability] = React.useState<Combinability>('EXCLUSIVE');
  const [priority, setPriority] = React.useState('0');
  const [minimumSubtotal, setMinimumSubtotal] = React.useState('');
  const [couponCode, setCouponCode] = React.useState('SAVE10');
  const [usageLimitTotal, setUsageLimitTotal] = React.useState('');
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = React.useState('1');
  const [startsAt, setStartsAt] = React.useState('');
  const [endsAt, setEndsAt] = React.useState('');
  const [initialStatus, setInitialStatus] = React.useState<'ACTIVE' | 'DRAFT'>('ACTIVE');

  // Targeting Scope
  const [targetScope, setTargetScope] = React.useState<'STOREWIDE' | 'CATEGORIES'>('STOREWIDE');
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<string[]>([]);
  const [categories, setCategories] = React.useState<readonly CatalogCategoryChoice[]>([]);
  const [loadingCategories, setLoadingCategories] = React.useState(false);

  // Status
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load categories when targeting opens
  React.useEffect(() => {
    if (open && targetScope === 'CATEGORIES' && categories.length === 0) {
      setLoadingCategories(true);
      apiRequest<{ data: readonly CatalogCategoryChoice[] }>('/admin/catalog/categories')
        .then((res) => {
          if (res?.data) setCategories(res.data);
        })
        .catch(() => {
          // ignore or fallback
        })
        .finally(() => setLoadingCategories(false));
    }
  }, [open, targetScope, categories.length]);

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setName('');
      setPromotionType('COUPON');
      setBenefitType('PERCENTAGE_DISCOUNT');
      setBenefitValue('10');
      setCombinability('EXCLUSIVE');
      setPriority('0');
      setMinimumSubtotal('');
      setCouponCode('SAVE10');
      setUsageLimitTotal('');
      setUsageLimitPerCustomer('1');
      setStartsAt('');
      setEndsAt('');
      setInitialStatus('ACTIVE');
      setTargetScope('STOREWIDE');
      setSelectedCategoryIds([]);
      setError(null);
    }
  }, [open]);

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a campaign name.');
      return;
    }

    const numericVal = parseFloat(benefitValue);
    if (isNaN(numericVal) || numericVal <= 0) {
      setError('Benefit value must be a positive number.');
      return;
    }
    if (benefitType === 'PERCENTAGE_DISCOUNT' && numericVal > 100) {
      setError('Percentage discount cannot exceed 100%.');
      return;
    }

    if (promotionType === 'COUPON' && !couponCode.trim()) {
      setError('Please provide a coupon code for coupon-triggered promotions.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // 1. Create Promotion Master & Revision
      const promoRes = await apiRequest<{ data: { id: string } }>('/admin/promotions', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          promotionType,
          status: initialStatus,
          benefitType,
          benefitValue: numericVal.toFixed(4),
          combinability,
          priority: parseInt(priority, 10) || 0,
          minimumMerchandiseSubtotal: minimumSubtotal.trim() ? minimumSubtotal.trim() : undefined,
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          categoryIds: targetScope === 'CATEGORIES' && selectedCategoryIds.length ? selectedCategoryIds : undefined,
        }),
      });

      const promoId = promoRes.data.id;

      // 2. If Coupon Type, attach the coupon code with limits
      if (promotionType === 'COUPON' && couponCode.trim()) {
        const cleanCode = couponCode.trim().toUpperCase().replace(/\s+/g, '');
        await apiRequest(`/admin/promotions/${promoId}/coupons`, {
          method: 'POST',
          body: JSON.stringify({
            code: cleanCode,
            usageLimitTotal: usageLimitTotal ? parseInt(usageLimitTotal, 10) : null,
            usageLimitPerCustomer: usageLimitPerCustomer ? parseInt(usageLimitPerCustomer, 10) : null,
          }),
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create promotion campaign.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col justify-between"
      >
        <div>
          <SheetHeader className="border-b border-border/70 p-5 bg-card sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BadgePercent className="size-5" />
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-primary">
                  Commerce / Promotions
                </p>
                <SheetTitle className="text-lg">Create Promotion Campaign</SheetTitle>
              </div>
            </div>
            <SheetDescription className="text-xs mt-1">
              Configure server-evaluated discount benefits, triggers, and redemption limits.
            </SheetDescription>
          </SheetHeader>

          <form id="create-promotion-form" onSubmit={handleSubmit} className="p-5 space-y-6">
            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Campaign Core Identity */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Campaign Identity
              </h3>

              <div className="space-y-1.5">
                <label htmlFor="create-name" className="text-xs font-semibold text-foreground">
                  Campaign Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="create-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Eid Mega Sale 15%, First Order Welcome"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="create-trigger" className="text-xs font-medium text-foreground">
                    Trigger Mode
                  </label>
                  <NativeSelect
                    id="create-trigger"
                    value={promotionType}
                    onChange={(e) => setPromotionType(e.target.value as PromotionType)}
                  >
                    <option value="COUPON">Coupon Code (Customer enters at checkout)</option>
                    <option value="AUTOMATIC">Automatic (Applied automatically when eligible)</option>
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="create-initial-status" className="text-xs font-medium text-foreground">
                    Initial Status
                  </label>
                  <NativeSelect
                    id="create-initial-status"
                    value={initialStatus}
                    onChange={(e) => setInitialStatus(e.target.value as 'ACTIVE' | 'DRAFT')}
                  >
                    <option value="ACTIVE">Active (Live immediately)</option>
                    <option value="DRAFT">Draft (Save & publish later)</option>
                  </NativeSelect>
                </div>
              </div>
            </div>

            {/* Benefit & Value */}
            <div className="space-y-4 border-t border-border/60 pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Discount Benefit
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="create-benefit-type" className="text-xs font-medium text-foreground">
                    Discount Type
                  </label>
                  <NativeSelect
                    id="create-benefit-type"
                    value={benefitType}
                    onChange={(e) => setBenefitType(e.target.value as BenefitType)}
                  >
                    <option value="PERCENTAGE_DISCOUNT">Percentage Discount (%)</option>
                    <option value="FIXED_AMOUNT_DISCOUNT">Fixed Amount (BDT)</option>
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="create-benefit-value" className="text-xs font-semibold text-foreground">
                    Discount Value <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id="create-benefit-value"
                      type="number"
                      step={benefitType === 'PERCENTAGE_DISCOUNT' ? '1' : '0.01'}
                      min="0.01"
                      max={benefitType === 'PERCENTAGE_DISCOUNT' ? '100' : undefined}
                      value={benefitValue}
                      onChange={(e) => setBenefitValue(e.target.value)}
                      placeholder={benefitType === 'PERCENTAGE_DISCOUNT' ? '15' : '250'}
                      className="font-mono tabular-nums pr-8"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-muted-foreground select-none">
                      {benefitType === 'PERCENTAGE_DISCOUNT' ? '%' : '৳'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="create-min-spend" className="text-xs font-medium text-foreground">
                    Minimum Order Subtotal
                  </label>
                  <span className="text-[0.7rem] text-muted-foreground">Optional threshold</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground select-none">
                    ৳
                  </span>
                  <Input
                    id="create-min-spend"
                    type="number"
                    min="0"
                    value={minimumSubtotal}
                    onChange={(e) => setMinimumSubtotal(e.target.value)}
                    placeholder="e.g. 1500 (Leave blank for no minimum spend)"
                    className="pl-7 font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Coupon Code Details (if trigger is COUPON) */}
            {promotionType === 'COUPON' && (
              <div className="space-y-4 border-t border-border/60 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Ticket className="size-3.5 text-primary" />
                    3. Coupon Code & Limits
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary"
                    onClick={() => {
                      const prefix = name ? name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() : 'DEAL';
                      setCouponCode(`${prefix}${benefitValue}`);
                    }}
                  >
                    <Sparkles className="size-3 mr-1" /> Auto-suggest
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="create-coupon-code" className="text-xs font-semibold text-foreground">
                    Promo Code <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="create-coupon-code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SAVE15, EID2026"
                    className="font-mono uppercase tracking-wider font-semibold"
                    required={promotionType === 'COUPON'}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="create-limit-total" className="text-xs font-medium text-foreground">
                        Global Usage Cap
                      </label>
                      <TooltipProvider delay={150}>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="text-[0.7rem] text-muted-foreground cursor-help underline decoration-dotted">
                                Total uses
                              </span>
                            }
                          />
                          <TooltipContent>Total times this code can be redeemed before expiring.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="create-limit-total"
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
                      <label htmlFor="create-limit-customer" className="text-xs font-medium text-foreground">
                        Per-Customer Cap
                      </label>
                      <TooltipProvider delay={150}>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="text-[0.7rem] text-muted-foreground cursor-help underline decoration-dotted">
                                Per user
                              </span>
                            }
                          />
                          <TooltipContent>Maximum times each customer can redeem this promo code.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="create-limit-customer"
                      type="number"
                      min="1"
                      placeholder="1 (default)"
                      value={usageLimitPerCustomer}
                      onChange={(e) => setUsageLimitPerCustomer(e.target.value)}
                      className="tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Catalog Targeting */}
            <div className="space-y-4 border-t border-border/60 pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  4. Catalog Scope
                </h3>
                <span className="text-xs font-medium text-primary">
                  {targetScope === 'STOREWIDE' ? 'Storewide' : `${selectedCategoryIds.length} categories`}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={targetScope === 'STOREWIDE' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetScope('STOREWIDE')}
                  className="flex-1"
                >
                  Storewide (All Items)
                </Button>
                <Button
                  type="button"
                  variant={targetScope === 'CATEGORIES' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetScope('CATEGORIES')}
                  className="flex-1"
                >
                  Specific Categories
                </Button>
              </div>

              {targetScope === 'CATEGORIES' && (
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Select categories eligible for this discount:
                  </p>
                  {loadingCategories ? (
                    <div className="flex items-center justify-center p-4 text-xs text-muted-foreground gap-2">
                      <Loader2 className="size-3.5 animate-spin" /> Loading categories…
                    </div>
                  ) : categories.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic p-2">
                      No categories found or could not load.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {categories.map((cat) => {
                        const checked = selectedCategoryIds.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleCategory(cat.id)}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors duration-150 ${
                              checked
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted text-foreground'
                            }`}
                          >
                            <span>{cat.name}</span>
                            {checked ? <Check className="size-3.5 text-primary" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Schedule & Rules */}
            <div className="space-y-4 border-t border-border/60 pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                5. Schedule & Stacking Rules
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="create-starts" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    Starts At
                  </label>
                  <Input
                    id="create-starts"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-[0.68rem] text-muted-foreground">Immediate if left empty</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="create-ends" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    Ends At
                  </label>
                  <Input
                    id="create-ends"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-[0.68rem] text-muted-foreground">Ongoing if left empty</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="create-combinability" className="text-xs font-medium text-foreground">
                      Combinability
                    </label>
                    <TooltipProvider delay={150}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="text-[0.7rem] text-muted-foreground cursor-help underline decoration-dotted">
                              Stacking
                            </span>
                          }
                        />
                        <TooltipContent>Exclusive cannot combine with other discounts. Stackable can.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <NativeSelect
                    id="create-combinability"
                    value={combinability}
                    onChange={(e) => setCombinability(e.target.value as Combinability)}
                  >
                    <option value="EXCLUSIVE">Exclusive (Single promotion)</option>
                    <option value="STACKABLE">Stackable (Combine with others)</option>
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="create-priority" className="text-xs font-medium text-foreground">
                    Priority Order
                  </label>
                  <Input
                    id="create-priority"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <SheetFooter className="border-t border-border/70 p-4 bg-card sticky bottom-0 z-10 flex-row justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-promotion-form"
            disabled={busy || !name.trim()}
            className="gap-1.5"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create Campaign
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
