'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, Layers, Search, X } from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { fetchApiData } from '@/lib/api';
import type { CoverageItem, PlacementCode, ProductPickerItem } from './recommendations-types';


interface BulkMerchandisingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  selectedProducts: CoverageItem[];
  onRemoveSelected: (id: string) => void;
  onClearSelected: () => void;
  onSuccess: (message: string) => void;
}

export function BulkMerchandisingSheet({
  open,
  onOpenChange,
  selectedIds,
  selectedProducts,
  onRemoveSelected,
  onClearSelected,
  onSuccess,
}: BulkMerchandisingSheetProps) {
  const [placement, setPlacement] = React.useState<PlacementCode>('pdp_similar');
  const [enablement, setEnablement] = React.useState<'KEEP' | 'ENABLE' | 'DISABLE'>('KEEP');
  const [action, setAction] = React.useState<'NONE' | 'PIN' | 'BOOST' | 'EXCLUDE' | 'REMOVE'>('NONE');
  const [targetQuery, setTargetQuery] = React.useState('');
  const [targetProduct, setTargetProduct] = React.useState<ProductPickerItem | null>(null);
  const [targetCandidates, setTargetCandidates] = React.useState<ProductPickerItem[]>([]);
  const [boost, setBoost] = React.useState(10);

  const [searchingTargets, setSearchingTargets] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [outcomes, setOutcomes] = React.useState<
    { productId: string; status: string; reason?: string }[] | null
  >(null);

  // Search candidate target products
  React.useEffect(() => {
    if (action === 'NONE' || !open) return;
    let live = true;
    setSearchingTargets(true);
    const debounce = setTimeout(() => {
      const params = new URLSearchParams({ q: targetQuery, pageSize: '20' });
      fetchApiData<{ items: ProductPickerItem[] }>(`/admin/recommendations/product-picker?${params}`)
        .then((result) => {
          if (live) setTargetCandidates(result.items);
        })
        .catch(() => {
          if (live) setTargetCandidates([]);
        })
        .finally(() => {
          if (live) setSearchingTargets(false);
        });
    }, 250);

    return () => {
      live = false;
      clearTimeout(debounce);
    };
  }, [targetQuery, action, open]);

  // Reset state when closing
  React.useEffect(() => {
    if (!open) {
      setOutcomes(null);
      setError('');
    }
  }, [open]);

  async function executeBulk(dryRun: boolean) {
    if (selectedIds.length === 0) return;
    if (enablement === 'KEEP' && action === 'NONE') {
      setError('Please choose either an enablement status or a target merchandising action.');
      return;
    }
    if (action !== 'NONE' && !targetProduct) {
      setError('Please select a target product for the merchandising action.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await fetchApiData<{
        outcomes: { productId: string; status: string; reason?: string }[];
      }>('/admin/recommendations/bulk', {
        method: 'POST',
        body: JSON.stringify({
          productIds: selectedIds,
          placement,
          dryRun,
          ...(enablement === 'KEEP' ? {} : { enabled: enablement === 'ENABLE' }),
          ...(action === 'NONE'
            ? {}
            : {
                action,
                targetProductId: targetProduct!.id,
                ...(action === 'BOOST' ? { boost } : {}),
              }),
        }),
      });

      setOutcomes(result.outcomes);
      const failures = result.outcomes.filter((item) => item.status === 'FAILED');

      if (!dryRun) {
        onSuccess(
          `Successfully updated ${result.outcomes.length - failures.length} of ${selectedIds.length} products.`,
        );
        onClearSelected();
        onOpenChange(false);
      } else if (failures.length) {
        setError(
          `${failures.length} products cannot be updated with this rule: ${failures.map((f) => f.reason).filter(Boolean).join('; ')}`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply bulk operation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-4 sm:p-6 border-b border-border/80">
          <SheetTitle className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            Bulk Merchandising
          </SheetTitle>
          <SheetDescription>
            Apply carousel settings or curation rules across{' '}
            <strong className="text-foreground">{selectedIds.length}</strong> selected products.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="size-4" />
                <span>Notice</span>
              </div>
              <p>{error}</p>
            </div>
          )}

          {/* Selected Products Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Selected Products ({selectedIds.length})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={onClearSelected}
              >
                Clear all
              </Button>
            </div>
            <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 p-2 rounded-lg border border-border/70 bg-muted/20">
              {selectedProducts.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground shadow-2xs"
                >
                  <span className="truncate max-w-[140px]">{item.title}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveSelected(item.id)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Placement Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Target Discovery Placement
            </label>
            <NativeSelect
              value={placement}
              onChange={(e) => setPlacement(e.target.value as PlacementCode)}
              className="w-full"
            >
              <option value="pdp_similar">You May Also Like (Similar)</option>
              <option value="pdp_complementary">Complete Your Look (Complementary)</option>
            </NativeSelect>
          </div>

          {/* Enablement Option */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Carousel Visibility</label>
            <NativeSelect
              value={enablement}
              onChange={(e) => setEnablement(e.target.value as typeof enablement)}
              className="w-full"
            >
              <option value="KEEP">Keep current product status</option>
              <option value="ENABLE">Enable carousel on all selected</option>
              <option value="DISABLE">Disable carousel on all selected</option>
            </NativeSelect>
          </div>

          {/* Target Action */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Merchandising Rule Action
              </label>
              <NativeSelect
                value={action}
                onChange={(e) => {
                  setAction(e.target.value as typeof action);
                  if (e.target.value === 'NONE') setTargetProduct(null);
                }}
                className="w-full"
              >
                <option value="NONE">No target rule change</option>
                <option value="PIN">Pin a companion product to position #1</option>
                <option value="BOOST">Boost a product&apos;s recommendation score</option>
                <option value="EXCLUDE">Exclude a product from recommendation</option>
                <option value="REMOVE">Remove existing override rule</option>
              </NativeSelect>
            </div>

            {action !== 'NONE' && (
              <div className="space-y-3 pt-2 border-t border-border/60">
                {/* Target Product Search */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    Target Companion Product
                  </span>
                  {targetProduct ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {targetProduct.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          /{targetProduct.handle}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setTargetProduct(null)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search product by title or handle…"
                          value={targetQuery}
                          onChange={(e) => setTargetQuery(e.target.value)}
                          className="pl-8 text-xs"
                        />
                      </div>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-border/80 divide-y divide-border/60 bg-muted/10">
                        {searchingTargets ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            Searching catalog…
                          </div>
                        ) : targetCandidates.length ? (
                          targetCandidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setTargetProduct(c)}
                              className="w-full text-left p-2 hover:bg-muted/40 transition-colors flex items-center justify-between text-xs"
                            >
                              <span className="font-medium truncate max-w-[240px]">{c.title}</span>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {c.publication_status}
                              </Badge>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            {targetQuery ? 'No matching products found.' : 'Type to search products'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Boost Slider if action is BOOST */}
                {action === 'BOOST' && (
                  <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>Relevance Boost Weight</span>
                      <span className="font-mono text-primary font-bold">+{boost} pts</span>
                    </div>
                    <Slider
                      min={1}
                      max={30}
                      step={1}
                      value={[boost]}
                      onValueChange={(val) => {
                        const next = Array.isArray(val) ? val[0] : val;
                        if (typeof next === 'number') setBoost(next);
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>+1 (Minor)</span>
                      <span>+15 (Medium)</span>
                      <span>+30 (Strong)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dry Run Outcome Inspection */}
          {outcomes && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-primary" />
                Dry Run Verification Outcomes
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                {outcomes.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between p-1.5 rounded bg-card border border-border/60 text-[11px]"
                  >
                    <span className="font-mono truncate max-w-[180px]">{item.productId}</span>
                    <span
                      className={`font-semibold ${
                        item.status === 'READY' || item.status === 'APPLIED'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : item.status === 'UNCHANGED'
                            ? 'text-muted-foreground'
                            : 'text-destructive'
                      }`}
                    >
                      {item.status}
                      {item.reason && ` (${item.reason})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="p-4 sm:p-6 border-t border-border/80 bg-muted/20 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void executeBulk(true)}
          >
            Review Dry Run
          </Button>
          <Button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void executeBulk(false)}
          >
            {busy ? 'Processing…' : `Apply to ${selectedIds.length} Products`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

