'use client';

import * as React from 'react';
import {
  AlertCircle,
  Archive,
  BadgePercent,
  Calendar,
  Check,
  Clock,
  Coins,
  Copy,
  Edit3,
  ExternalLink,
  Layers,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  Tag,
  Ticket,
  User,
  X,
} from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest, ApiRequestError } from '@/lib/api';
import type { PromotionDetail, PromotionItem, PromotionStatus } from './types';

interface PromotionDetailDrawerProps {
  readonly promotionId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: (promotion: PromotionItem) => void;
  readonly onStatusChange: (promotion: PromotionItem, targetStatus: PromotionStatus) => void;
  readonly onAddCoupon: (promotion: PromotionItem) => void;
  readonly onRefreshList: () => void;
}

export function PromotionDetailDrawer({
  promotionId,
  open,
  onOpenChange,
  onEdit,
  onStatusChange,
  onAddCoupon,
  onRefreshList,
}: PromotionDetailDrawerProps) {
  const [detail, setDetail] = React.useState<PromotionDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
  const [togglingCouponId, setTogglingCouponId] = React.useState<string | null>(null);

  const fetchDetail = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ data: PromotionDetail }>(`/admin/promotions/${id}`);
      setDetail(res.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load promotion details.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && promotionId) {
      void fetchDetail(promotionId);
    } else {
      setDetail(null);
    }
  }, [open, promotionId, fetchDetail]);

  function copyToClipboard(code: string) {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((current) => (current === code ? null : current));
    }, 2000);
  }

  async function handleToggleCoupon(couponId: string, currentStatus: string) {
    if (!promotionId) return;
    setTogglingCouponId(couponId);
    const targetStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiRequest(`/admin/promotions/${promotionId}/coupons/${couponId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      });
      await fetchDetail(promotionId);
      onRefreshList();
    } catch (err) {
      alert(err instanceof ApiRequestError ? err.message : 'Could not change coupon status.');
    } finally {
      setTogglingCouponId(null);
    }
  }

  const isPercentage = detail?.benefitType === 'PERCENTAGE_DISCOUNT';
  const benefitLabel = detail
    ? isPercentage
      ? `${parseFloat(detail.benefitValue)}% OFF`
      : `৳ ${parseFloat(detail.benefitValue).toFixed(2)} OFF`
    : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col justify-between"
      >
        <div className="flex-1">
          {/* Header */}
          <SheetHeader className="border-b border-border/70 p-5 bg-card sticky top-0 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-primary">
                    Campaign Details
                  </p>
                  {detail ? <StatusBadge status={detail.status} /> : null}
                  {detail?.combinability === 'EXCLUSIVE' ? (
                    <span className="text-[0.65rem] font-medium bg-muted px-2 py-0.5 rounded text-muted-foreground">
                      Exclusive
                    </span>
                  ) : (
                    <span className="text-[0.65rem] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded">
                      Stackable
                    </span>
                  )}
                </div>
                <SheetTitle className="text-xl font-bold truncate">
                  {detail?.name ?? 'Loading campaign…'}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span>ID: <code className="font-mono">{promotionId}</code></span>
                </SheetDescription>
              </div>

              {detail ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => detail && onEdit(detail)}
                  >
                    <Edit3 className="size-3.5" /> Edit
                  </Button>
                  {detail.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700"
                      onClick={() => onStatusChange(detail, 'INACTIVE')}
                    >
                      <PauseCircle className="size-3.5" /> Pause
                    </Button>
                  ) : detail.status === 'INACTIVE' || detail.status === 'DRAFT' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                      onClick={() => onStatusChange(detail, 'ACTIVE')}
                    >
                      <PlayCircle className="size-3.5" /> Activate
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SheetHeader>

          {/* Body Content */}
          <div className="p-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-sm">Fetching campaign telemetry…</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : detail ? (
              <div className="space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <span className="text-[0.65rem] font-semibold uppercase text-muted-foreground block">
                      Benefit
                    </span>
                    <strong className="text-base sm:text-lg font-bold font-mono text-primary block mt-0.5">
                      {benefitLabel}
                    </strong>
                    <span className="text-[0.68rem] text-muted-foreground block truncate">
                      {detail.benefitType === 'PERCENTAGE_DISCOUNT' ? 'Order line discount' : 'Fixed deduction'}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <span className="text-[0.65rem] font-semibold uppercase text-muted-foreground block">
                      Redemptions
                    </span>
                    <strong className="text-base sm:text-lg font-bold font-mono text-foreground block mt-0.5">
                      {detail.committedUsageCount}
                    </strong>
                    <span className="text-[0.68rem] text-muted-foreground block truncate">
                      Orders placed
                    </span>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <span className="text-[0.65rem] font-semibold uppercase text-muted-foreground block">
                      Discount Value
                    </span>
                    <strong className="text-base sm:text-lg font-bold font-mono text-foreground block mt-0.5">
                      ৳ {parseFloat(detail.committedDiscount || '0').toFixed(0)}
                    </strong>
                    <span className="text-[0.68rem] text-muted-foreground block truncate">
                      Total BDT granted
                    </span>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
                    <span className="text-[0.65rem] font-semibold uppercase text-muted-foreground block">
                      Coupons
                    </span>
                    <strong className="text-base sm:text-lg font-bold font-mono text-foreground block mt-0.5">
                      {detail.coupons.length}
                    </strong>
                    <span className="text-[0.68rem] text-muted-foreground block truncate">
                      Active codes
                    </span>
                  </div>
                </div>

                {/* Tabs for Drawer Sections */}
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="w-full justify-start border-b border-border/60 rounded-none bg-transparent p-0 mb-4 h-9">
                    <TabsTrigger
                      value="overview"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2 pt-1 font-semibold text-xs"
                    >
                      Overview & Rules
                    </TabsTrigger>
                    <TabsTrigger
                      value="coupons"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2 pt-1 font-semibold text-xs flex items-center gap-1.5"
                    >
                      <span>Coupons ({detail.coupons.length})</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="history"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2 pt-1 font-semibold text-xs flex items-center gap-1.5"
                    >
                      <span>Redemptions ({detail.recentUsages.length})</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab: Overview */}
                  <TabsContent value="overview" className="space-y-4 pt-1">
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Eligibility & Application Rules
                      </h4>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Trigger Mode</dt>
                          <dd className="font-medium text-foreground mt-0.5">
                            {detail.promotionType === 'COUPON'
                              ? 'Coupon Code Required at Checkout'
                              : 'Automatic Storewide Evaluation'}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">Minimum Merchandise Subtotal</dt>
                          <dd className="font-medium font-mono text-foreground mt-0.5">
                            {detail.minimumMerchandiseSubtotal
                              ? `৳ ${parseFloat(detail.minimumMerchandiseSubtotal).toFixed(2)}`
                              : 'No minimum spend required'}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">Combinability</dt>
                          <dd className="font-medium text-foreground mt-0.5">
                            {detail.combinability === 'EXCLUSIVE'
                              ? 'Exclusive (Does not combine with other discounts)'
                              : 'Stackable (Can combine with other stackable discounts)'}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">Evaluation Priority</dt>
                          <dd className="font-medium font-mono text-foreground mt-0.5">
                            {detail.priority}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">Schedule Window</dt>
                          <dd className="font-medium text-foreground mt-0.5">
                            {detail.startsAt ? new Date(detail.startsAt).toLocaleString() : 'Immediate'} →{' '}
                            {detail.endsAt ? new Date(detail.endsAt).toLocaleString() : 'Ongoing (No expiry)'}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">Active Revision</dt>
                          <dd className="font-medium font-mono text-foreground mt-0.5">
                            Revision #{detail.revisionNumber}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Catalog Scope Section */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Catalog Target Scope
                        </h4>
                        <span className="text-xs font-medium text-primary">
                          {detail.targetCategories.length === 0 && detail.targetProducts.length === 0
                            ? 'Storewide'
                            : 'Targeted Catalog'}
                        </span>
                      </div>

                      {detail.targetCategories.length === 0 && detail.targetProducts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          This promotion applies storewide to all eligible catalog merchandise.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {detail.targetCategories.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[0.7rem] font-semibold text-muted-foreground uppercase">
                                Eligible Categories ({detail.targetCategories.length})
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {detail.targetCategories.map((c) => (
                                  <span
                                    key={c.id}
                                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                                  >
                                    <Tag className="size-3 text-muted-foreground" />
                                    {c.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {detail.targetProducts.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[0.7rem] font-semibold text-muted-foreground uppercase">
                                Eligible Products ({detail.targetProducts.length})
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {detail.targetProducts.map((p) => (
                                  <span
                                    key={p.id}
                                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                                  >
                                    {p.title}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Tab: Coupons */}
                  <TabsContent value="coupons" className="space-y-4 pt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Coupons associated with this promotion campaign.
                      </p>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => onAddCoupon(detail)}
                      >
                        <Plus className="size-3.5" /> Add Code
                      </Button>
                    </div>

                    {detail.coupons.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                        No coupon codes reserved for this campaign yet.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <Table density="compact">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Code</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Usage Limits</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detail.coupons.map((coupon) => {
                              const isCopied = copiedCode === coupon.code;
                              const isToggling = togglingCouponId === coupon.id;
                              return (
                                <TableRow key={coupon.id}>
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-1.5">
                                      <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-foreground">
                                        {coupon.code}
                                      </code>
                                      <TooltipProvider delay={100}>
                                        <Tooltip>
                                          <TooltipTrigger
                                            render={
                                              <button
                                                type="button"
                                                onClick={() => copyToClipboard(coupon.code)}
                                                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
                                              />
                                            }
                                          >
                                            {isCopied ? (
                                              <Check className="size-3 text-emerald-600" />
                                            ) : (
                                              <Copy className="size-3" />
                                            )}
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {isCopied ? 'Copied!' : 'Copy to clipboard'}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </TableCell>

                                  <TableCell>
                                    <StatusBadge status={coupon.status} />
                                  </TableCell>

                                  <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                                    <div>
                                      {coupon.usageCount ?? 0}
                                      {coupon.usageLimitTotal ? ` / ${coupon.usageLimitTotal}` : ' uses'}
                                    </div>
                                    <div className="text-[0.65rem]">
                                      Max {coupon.usageLimitPerCustomer ?? 1} per customer
                                    </div>
                                  </TableCell>

                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={isToggling}
                                      className="h-7 text-xs"
                                      onClick={() => handleToggleCoupon(coupon.id, coupon.status)}
                                    >
                                      {isToggling ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : coupon.status === 'ACTIVE' ? (
                                        'Pause'
                                      ) : (
                                        'Activate'
                                      )}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab: Redemption History */}
                  <TabsContent value="history" className="space-y-4 pt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Recent orders that redeemed this promotion (committed in database transactions).
                      </p>
                    </div>

                    {detail.recentUsages.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                        No committed redemptions recorded for this promotion yet.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <Table density="compact">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Order #</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Code</TableHead>
                              <TableHead className="text-right">Discount</TableHead>
                              <TableHead className="text-right">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detail.recentUsages.map((usage) => (
                              <TableRow key={usage.id}>
                                <TableCell className="font-mono text-xs font-semibold">
                                  {usage.orderNumber ? (
                                    <span className="text-primary">{usage.orderNumber}</span>
                                  ) : (
                                    <span className="text-muted-foreground">Order {usage.orderId?.slice(0, 8)}</span>
                                  )}
                                </TableCell>

                                <TableCell className="text-xs">
                                  <div className="font-medium text-foreground">
                                    {usage.customerName ?? 'Guest / Online'}
                                  </div>
                                  {usage.customerNumber ? (
                                    <div className="text-[0.65rem] text-muted-foreground font-mono">
                                      {usage.customerNumber}
                                    </div>
                                  ) : null}
                                </TableCell>

                                <TableCell className="font-mono text-xs">
                                  {usage.couponCode ? (
                                    <code className="bg-muted px-1.5 py-0.5 rounded text-[0.7rem]">
                                      {usage.couponCode}
                                    </code>
                                  ) : (
                                    <span className="text-muted-foreground italic">Automatic</span>
                                  )}
                                </TableCell>

                                <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  ৳ {parseFloat(usage.discountAmount).toFixed(2)}
                                </TableCell>

                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {new Date(usage.createdAt).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
