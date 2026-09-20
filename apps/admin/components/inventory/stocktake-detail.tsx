'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Layers,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { CatalogVariantChoiceDto, StocktakeDetailDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryNumber, formatInventoryDate } from '@/lib/inventory/api';
import {
  InventoryStatCards,
  InventoryEmptyState,
  InventoryConditionBadge,
  InventoryFeedback,
} from './inventory-page-ui';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ─── Types & Constants ────────────────────────────────────────────────────────

type EnrichedStocktake = StocktakeDetailDto;
type Condition = 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
const conditions: readonly Condition[] = ['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION'];

type FilterTab = 'all' | 'discrepancies' | 'uncounted' | 'matched';

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StocktakeStatusBadge({ status }: { status: string }) {
  if (status === 'POSTED') {
    return (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
        <Check className="size-3" />
        Reconciled
      </Badge>
    );
  }
  if (status === 'REVIEW') {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50/50 gap-1">
        <Clock className="size-3" />
        Pending Review
      </Badge>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <Badge variant="secondary" className="text-muted-foreground gap-1">
        <X className="size-3" />
        Cancelled
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
      <RotateCcw className="size-3" />
      In Progress
    </Badge>
  );
}

// ─── Condition Breakdown Dialog ───────────────────────────────────────────────

interface ConditionBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: EnrichedStocktake['lines'][number] | null;
  currentCounted: string;
  conditionValues: Partial<Record<Condition, string>>;
  onSave: (
    inventoryItemId: string,
    countedTotal: string,
    conditions: Partial<Record<Condition, string>>,
  ) => Promise<void>;
  disabled?: boolean;
}

function ConditionBreakdownModal({
  open,
  onOpenChange,
  line,
  currentCounted,
  conditionValues,
  onSave,
  disabled,
}: ConditionBreakdownModalProps) {
  const [localValues, setLocalValues] = useState<Partial<Record<Condition, string>>>({});
  const [targetCounted, setTargetCounted] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (line && open) {
      setTargetCounted(currentCounted || '0');
      const initial = { ...conditionValues };
      // If no condition splits exist, default everything to SELLABLE
      if (!initial.SELLABLE && !initial.DAMAGED && !initial.QUARANTINE && !initial.INSPECTION) {
        initial.SELLABLE = currentCounted || '0';
      }
      setLocalValues(initial);
      setError(null);
    }
  }, [line, open, currentCounted, conditionValues]);

  if (!line) return null;

  const currentSum = conditions.reduce((acc, c) => acc + (Number(localValues[c]) || 0), 0);
  const targetNumber = Number(targetCounted) || 0;
  const isBalanced = Math.abs(currentSum - targetNumber) < 0.000001;
  const remaining = targetNumber - currentSum;

  const handleAssignRemainingToSellable = () => {
    const newSellable = Math.max(0, (Number(localValues.SELLABLE) || 0) + remaining);
    setLocalValues((prev) => ({
      ...prev,
      SELLABLE: newSellable.toString(),
    }));
  };

  const handleSetAllSellable = () => {
    setLocalValues({
      SELLABLE: targetCounted,
      DAMAGED: '0',
      QUARANTINE: '0',
      INSPECTION: '0',
    });
  };

  const handleConfirm = async () => {
    if (!isBalanced) {
      setError(
        `Condition breakdown sum (${formatInventoryNumber(currentSum)}) must match the total counted quantity (${formatInventoryNumber(targetNumber)}).`,
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(line.inventoryItemId, targetCounted, localValues);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save condition breakdown.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" />
            Split Condition Quantities
          </DialogTitle>
          <DialogDescription>
            Specify physical condition breakdown for{' '}
            <strong className="text-foreground">{line.productTitle}</strong> ({line.sku}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total Physical Count</p>
              <p className="text-lg font-semibold">{formatInventoryNumber(targetCounted)} units</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Snapshot Expected</p>
              <p className="text-sm font-medium text-muted-foreground">
                {formatInventoryNumber(line.expectedQuantityAtSnapshot)} units
              </p>
            </div>
          </div>

          <div className="space-y-3 divide-y divide-border/50">
            {conditions.map((condition) => {
              const expectedConditionQty =
                line.expectedQuantitiesByCondition?.[condition] ?? '0';
              const val = localValues[condition] ?? '';

              return (
                <div key={condition} className="flex items-center justify-between pt-3 first:pt-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <InventoryConditionBadge condition={condition} />
                      <span className="text-xs text-muted-foreground">
                        Exp: {formatInventoryNumber(expectedConditionQty)}
                      </span>
                    </div>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      disabled={disabled || isSaving}
                      value={val}
                      onChange={(e) =>
                        setLocalValues((prev) => ({
                          ...prev,
                          [condition]: e.target.value,
                        }))
                      }
                      className="text-right tabular-nums h-8"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Balance Tracker */}
          <div
            className={`flex items-center justify-between rounded-md p-2.5 text-xs ${
              isBalanced
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            <div className="flex items-center gap-1.5 font-medium">
              {isBalanced ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Allocated: {formatInventoryNumber(currentSum)} / {formatInventoryNumber(targetNumber)} (Balanced)
                </>
              ) : (
                <>
                  <AlertCircle className="size-4 text-amber-600" />
                  Allocated: {formatInventoryNumber(currentSum)} / {formatInventoryNumber(targetNumber)}{' '}
                  ({remaining > 0 ? `${formatInventoryNumber(remaining)} unassigned` : `${formatInventoryNumber(Math.abs(remaining))} over-allocated`})
                </>
              )}
            </div>

            {!isBalanced && remaining > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-amber-900 hover:text-amber-950 px-2"
                onClick={handleAssignRemainingToSellable}
              >
                Assign to Sellable
              </Button>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSetAllSellable}
            disabled={disabled || isSaving}
          >
            Reset All to Sellable
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={disabled || isSaving || !isBalanced}
          >
            {isSaving ? 'Saving…' : 'Apply Conditions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Stocktake Detail Component ──────────────────────────────────────────

export function StocktakeDetail({ stocktakeId }: { stocktakeId: string }) {
  const router = useRouter();
  const [stocktake, setStocktake] = useState<EnrichedStocktake | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Version concurrency ref to prevent stale version race conditions
  const currentVersionRef = useRef<number>(1);

  // Found SKU modal
  const [foundOpen, setFoundOpen] = useState(false);
  const [variants, setVariants] = useState<readonly CatalogVariantChoiceDto[]>([]);
  const [foundVariantId, setFoundVariantId] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  const [isLoadingVariants, setIsLoadingVariants] = useState(false);
  const [isAddingFound, setIsAddingFound] = useState(false);

  // Condition breakdown modal
  const [conditionModalLine, setConditionModalLine] = useState<EnrichedStocktake['lines'][number] | null>(null);

  // Count states
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [conditionCounts, setConditionCounts] = useState<
    Record<string, Partial<Record<Condition, string>>>
  >({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [saveSuccesses, setSaveSuccesses] = useState<Record<string, boolean>>({});

  // Filters & Search
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [copied, setCopied] = useState(false);

  // Load stocktake data
  const reload = async () => {
    try {
      const res = await inventoryRequest<{ data: EnrichedStocktake }>(
        `/inventory/stocktakes/${stocktakeId}`,
      );
      setStocktake(res.data);
      currentVersionRef.current = res.data.version;

      // Merge server-persisted counts
      const persisted: Record<string, string> = {};
      const condPersisted: Record<string, Partial<Record<Condition, string>>> = {};
      for (const line of res.data.lines) {
        if (line.countedQuantity !== null) {
          persisted[line.inventoryItemId] = line.countedQuantity;
        }
        if (line.countedQuantitiesByCondition) {
          condPersisted[line.inventoryItemId] = line.countedQuantitiesByCondition;
        }
      }
      setCounts((prev) => ({ ...persisted, ...prev }));
      setConditionCounts((prev) => ({ ...condPersisted, ...prev }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload stocktake data.');
    }
  };

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    inventoryRequest<{ data: EnrichedStocktake }>(`/inventory/stocktakes/${stocktakeId}`)
      .then((res) => {
        if (!active) return;
        setStocktake(res.data);
        currentVersionRef.current = res.data.version;

        const persisted: Record<string, string> = {};
        const condPersisted: Record<string, Partial<Record<Condition, string>>> = {};
        for (const line of res.data.lines) {
          if (line.countedQuantity !== null) {
            persisted[line.inventoryItemId] = line.countedQuantity;
          }
          if (line.countedQuantitiesByCondition) {
            condPersisted[line.inventoryItemId] = line.countedQuantitiesByCondition;
          }
        }
        setCounts(persisted);
        setConditionCounts(condPersisted);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stocktakeId]);

  // Concurrency-safe count save with automatic STALE_VERSION retry
  const saveCount = async (
    inventoryItemId: string,
    value: string,
    quantitiesByCondition?: Partial<Record<Condition, string>>,
  ) => {
    if (!stocktake || stocktake.status !== 'COUNTING') return;
    if (!value.trim() || !/^\d+(?:\.\d{1,6})?$/.test(value)) return;

    setSaving((p) => ({ ...p, [inventoryItemId]: true }));
    setSaveErrors((p) => ({ ...p, [inventoryItemId]: '' }));
    setSaveSuccesses((p) => ({ ...p, [inventoryItemId]: false }));

    const payload = {
      countedQuantity: value,
      ...(quantitiesByCondition ? { countedQuantitiesByCondition: quantitiesByCondition } : {}),
      version: currentVersionRef.current,
    };

    try {
      await inventoryRequest(
        `/inventory/stocktakes/${stocktakeId}/lines/${inventoryItemId}/count`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      // Increment version locally on success
      currentVersionRef.current += 1;
      setStocktake((prev) => (prev ? { ...prev, version: prev.version + 1 } : prev));
      setSaveSuccesses((p) => ({ ...p, [inventoryItemId]: true }));

      // Auto-clear success checkmark after 2 seconds
      setTimeout(() => {
        setSaveSuccesses((p) => ({ ...p, [inventoryItemId]: false }));
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Could not save count.';

      // Automatic stale version recovery: refetch current version and retry once
      if (errorMsg.includes('STALE_VERSION') || errorMsg.includes('no longer current')) {
        try {
          const refreshed = await inventoryRequest<{ data: EnrichedStocktake }>(
            `/inventory/stocktakes/${stocktakeId}`,
          );
          currentVersionRef.current = refreshed.data.version;
          setStocktake((prev) => (prev ? { ...prev, version: refreshed.data.version } : prev));

          // Retry with synchronized version
          await inventoryRequest(
            `/inventory/stocktakes/${stocktakeId}/lines/${inventoryItemId}/count`,
            {
              method: 'POST',
              body: JSON.stringify({
                ...payload,
                version: refreshed.data.version,
              }),
            },
          );

          currentVersionRef.current += 1;
          setStocktake((prev) => (prev ? { ...prev, version: prev.version + 1 } : prev));
          setSaveSuccesses((p) => ({ ...p, [inventoryItemId]: true }));
          return;
        } catch (retryErr) {
          setSaveErrors((p) => ({
            ...p,
            [inventoryItemId]:
              retryErr instanceof Error ? retryErr.message : 'Sync error. Please reload.',
          }));
        }
      } else {
        setSaveErrors((p) => ({ ...p, [inventoryItemId]: errorMsg }));
      }
    } finally {
      setSaving((p) => ({ ...p, [inventoryItemId]: false }));
    }
  };

  // Quick fill row with expected quantity
  const handleQuickMatchExpected = async (line: EnrichedStocktake['lines'][number]) => {
    const expectedQty = line.expectedQuantityAtSnapshot;
    setCounts((p) => ({ ...p, [line.inventoryItemId]: expectedQty }));
    await saveCount(line.inventoryItemId, expectedQty);
  };

  // Post stocktake (Finalize)
  const handlePost = async () => {
    if (!stocktake) return;
    setIsPosting(true);
    setError(null);
    try {
      await inventoryRequest(`/inventory/stocktakes/${stocktakeId}/post`, {
        method: 'POST',
        headers: { 'idempotency-key': `post-${stocktakeId}-${Date.now()}` },
      });
      setSuccessMessage('Stocktake posted successfully. Inventory balances have been reconciled in the ledger.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stocktake could not be posted.');
    } finally {
      setIsPosting(false);
    }
  };

  // Submit for review or cancel
  const handleTransition = async (action: 'submit-review' | 'cancel') => {
    if (!stocktake) return;
    setIsTransitioning(true);
    setError(null);
    try {
      await inventoryRequest(`/inventory/stocktakes/${stocktakeId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: currentVersionRef.current }),
      });
      setSuccessMessage(
        action === 'submit-review'
          ? 'Stocktake submitted for review. Physical counts are now locked for manager sign-off.'
          : 'Stocktake cancelled. No inventory balances were modified.',
      );
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stocktake status could not be updated.');
    } finally {
      setIsTransitioning(false);
    }
  };

  // Open Add Found SKU modal
  const openFoundSkuModal = async () => {
    setError(null);
    setVariantSearch('');
    setFoundVariantId('');
    setFoundOpen(true);
    if (!variants.length) {
      setIsLoadingVariants(true);
      try {
        const response = await inventoryRequest<{ data: readonly CatalogVariantChoiceDto[] }>(
          '/catalog/variants',
        );
        setVariants(response.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Catalog variants could not be loaded.');
      } finally {
        setIsLoadingVariants(false);
      }
    }
  };

  // Submit found SKU
  const addFoundSku = async () => {
    if (!stocktake || !foundVariantId) return;
    setIsAddingFound(true);
    setError(null);
    try {
      await inventoryRequest(`/inventory/stocktakes/${stocktakeId}/found-lines`, {
        method: 'POST',
        body: JSON.stringify({ variantId: foundVariantId, version: currentVersionRef.current }),
      });
      setFoundOpen(false);
      setFoundVariantId('');
      setSuccessMessage('Found SKU added with expected snapshot quantity of 0. Enter its physical count below.');
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Found SKU could not be added.');
    } finally {
      setIsAddingFound(false);
    }
  };

  const copyStocktakeNumber = () => {
    if (!stocktake?.stocktakeNumber) return;
    navigator.clipboard.writeText(stocktake.stocktakeNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-10 w-80 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!stocktake) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Inventory', href: '/inventory' },
            { label: 'Stocktakes', href: '/inventory/stocktakes' },
            { label: 'Session Details', current: true },
          ]}
        />
        <InventoryEmptyState
          title="Stocktake session not found"
          description="This stocktake session does not exist, was removed, or you do not have permission to view it."
        />
      </div>
    );
  }

  // Aggregate metrics
  const totalCount = stocktake.lines.length;
  const countedLinesList = stocktake.lines.filter(
    (l) => counts[l.inventoryItemId] !== undefined && counts[l.inventoryItemId] !== '',
  );
  const countedCount = countedLinesList.length;
  const uncountedCount = totalCount - countedCount;
  const progressPct = totalCount === 0 ? 0 : Math.round((countedCount / totalCount) * 100);
  const allCounted = totalCount > 0 && countedCount === totalCount;

  // Calculate variances taking post-snapshot movements into account
  const linesWithCalculatedVariance = stocktake.lines.map((line) => {
    const rawCounted = counts[line.inventoryItemId];
    const hasCount = rawCounted !== undefined && rawCounted !== '';
    const countedNumber = hasCount ? Number(rawCounted) : null;
    const movements = Number(line.movementsAfterSnapshot || '0');
    const snapshotExpected = Number(line.expectedQuantityAtSnapshot);
    const finalExpected = line.finalExpectedQuantity !== null
      ? Number(line.finalExpectedQuantity)
      : snapshotExpected + movements;

    let variance: number | null = null;
    if (line.varianceQuantity !== null) {
      variance = Number(line.varianceQuantity);
    } else if (countedNumber !== null) {
      variance = countedNumber - finalExpected;
    }

    return {
      ...line,
      hasCount,
      countedNumber,
      finalExpected,
      variance,
      movements,
    };
  });

  const discrepantLines = linesWithCalculatedVariance.filter(
    (l) => l.hasCount && l.variance !== null && Math.abs(l.variance) > 0.000001,
  );
  const matchedLines = linesWithCalculatedVariance.filter(
    (l) => l.hasCount && l.variance !== null && Math.abs(l.variance) <= 0.000001,
  );

  const discrepantCount = discrepantLines.length;
  const matchedCount = matchedLines.length;

  // Filter lines by search and active tab
  const filteredLines = linesWithCalculatedVariance.filter((l) => {
    // Search filter
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      l.sku.toLowerCase().includes(q) ||
      l.productTitle.toLowerCase().includes(q) ||
      (l.optionSummary ?? '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    // Tab filter
    if (activeTab === 'discrepancies') {
      return l.hasCount && l.variance !== null && Math.abs(l.variance) > 0.000001;
    }
    if (activeTab === 'uncounted') {
      return !l.hasCount;
    }
    if (activeTab === 'matched') {
      return l.hasCount && l.variance !== null && Math.abs(l.variance) <= 0.000001;
    }
    return true;
  });

  // Filter available variants for Add Found SKU (exclude already present items)
  const existingVariantIds = new Set(stocktake.lines.map((l) => l.variantId));
  const availableVariants = variants.filter((v) => !existingVariantIds.has(v.id));
  const filteredVariants = availableVariants.filter((v) => {
    const q = variantSearch.trim().toLowerCase();
    return (
      !q ||
      v.sku.toLowerCase().includes(q) ||
      v.productTitle.toLowerCase().includes(q) ||
      (v.optionSummary ?? '').toLowerCase().includes(q)
    );
  });

  // KPI Stats using reusable InventoryStatCards component
  const statsData = [
    {
      label: 'Items to Count',
      value: formatInventoryNumber(totalCount),
      description: 'Scheduled & found SKUs',
    },
    {
      label: 'Count Progress',
      value: `${formatInventoryNumber(countedCount)} / ${formatInventoryNumber(totalCount)}`,
      description: `${progressPct}% counted`,
    },
    {
      label: 'Discrepancies',
      value: formatInventoryNumber(discrepantCount),
      description:
        discrepantCount > 0
          ? `${discrepantCount} item${discrepantCount === 1 ? '' : 's'} with variance`
          : 'Zero variances detected',
    },
    {
      label: 'Session Status',
      value:
        stocktake.status === 'POSTED'
          ? 'Reconciled'
          : stocktake.status === 'REVIEW'
            ? 'Awaiting Post'
            : stocktake.status === 'CANCELLED'
              ? 'Cancelled'
              : allCounted
                ? 'Ready for Review'
                : 'Counting In Progress',
      description:
        stocktake.status === 'POSTED'
          ? 'Balances updated in ledger'
          : stocktake.status === 'REVIEW'
            ? 'Review variances before posting'
            : stocktake.status === 'CANCELLED'
              ? 'No balances were changed'
              : `${uncountedCount} remaining to count`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Standard Breadcrumb Navigation */}
      <Breadcrumb
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Stocktakes', href: '/inventory/stocktakes' },
          { label: stocktake.stocktakeNumber || 'Session Details', current: true },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-5">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">
              Stocktake — {stocktake.locationName}
            </h1>
            <StocktakeStatusBadge status={stocktake.status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-0.5">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-primary" />
              {stocktake.locationName}
            </span>

            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Snapshot: {formatInventoryDate(stocktake.snapshotAt?.toString())}
            </span>

            <button
              type="button"
              onClick={copyStocktakeNumber}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
              title="Copy session number"
            >
              <span>{stocktake.stocktakeNumber}</span>
              {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
            </button>

            {stocktake.status === 'POSTED' && stocktake.postedInventoryTransactionId && (
              <Link
                href={`/admin/inventory/adjustments`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <span>View Ledger Adjustment</span>
                <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {stocktake.status === 'COUNTING' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openFoundSkuModal()}
                disabled={isTransitioning}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Add Found SKU
              </Button>

              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={isTransitioning} />}>
                  Cancel Stocktake
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this stocktake?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Recorded counts remain as historical audit notes, but no inventory balances will be changed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Counting</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleTransition('cancel')}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Cancel Stocktake
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                size="sm"
                onClick={() => handleTransition('submit-review')}
                disabled={totalCount === 0 || !allCounted || isTransitioning}
                className="gap-1.5"
              >
                {isTransitioning ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" />
                    Submit for Review
                  </>
                )}
              </Button>
            </>
          )}

          {stocktake.status === 'REVIEW' && (
            <>
              {/* Backend supports cancellation in REVIEW state */}
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={isTransitioning || isPosting} />}>
                  Cancel Stocktake
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this stocktake?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will abort the stocktake without applying any adjustments. Recorded counts will be preserved as audit records.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back to Review</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleTransition('cancel')}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Cancel Stocktake
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger render={<Button size="sm" disabled={isPosting || isTransitioning} className="gap-1.5" />}>
                  {isPosting ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" />
                      Posting…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3.5" />
                      Post Stocktake
                    </>
                  )}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Post this stocktake to ledger?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Posting will finalize all counted quantities and write authoritative inventory adjustments
                      to the ledger for all {discrepantCount} variance line{discrepantCount === 1 ? '' : 's'}. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Reviewing</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePost} disabled={isPosting}>
                      Post Stocktake
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {stocktake.status === 'POSTED' && (
            <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 py-1.5 px-3">
              Reconciliation Completed on {formatInventoryDate(stocktake.postedAt?.toString())}
            </Badge>
          )}
        </div>
      </div>

      {/* Operational Feedback */}
      {error && <InventoryFeedback message={error} isError />}
      {successMessage && <InventoryFeedback message={successMessage} />}

      {/* Reusable Metric Stat Cards */}
      <InventoryStatCards stats={statsData} />

      {/* Count Sheet & Discrepancy Matrix */}
      <Card className="border shadow-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Physical Count Sheet</CardTitle>
              <CardDescription className="text-xs">
                {stocktake.status === 'COUNTING'
                  ? 'Record physical counts for each item. Changes auto-save securely as you complete each field.'
                  : stocktake.status === 'REVIEW'
                    ? 'Review recorded quantities and variances before posting authoritative ledger adjustments.'
                    : 'Physical count records and applied adjustments are permanently archived.'}
              </CardDescription>
            </div>

            {/* Search filter */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search SKU, product title, or option…"
                className="pl-8 text-xs h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Operational Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
            <Button
              type="button"
              variant={activeTab === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('all')}
              className="h-7 text-xs rounded-full px-3"
            >
              All Items ({totalCount})
            </Button>

            <Button
              type="button"
              variant={activeTab === 'discrepancies' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('discrepancies')}
              className={`h-7 text-xs rounded-full px-3 ${
                discrepantCount > 0 && activeTab !== 'discrepancies'
                  ? 'text-destructive hover:text-destructive'
                  : ''
              }`}
            >
              Discrepancies ({discrepantCount})
            </Button>

            <Button
              type="button"
              variant={activeTab === 'uncounted' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('uncounted')}
              className="h-7 text-xs rounded-full px-3"
            >
              Uncounted ({uncountedCount})
            </Button>

            <Button
              type="button"
              variant={activeTab === 'matched' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('matched')}
              className="h-7 text-xs rounded-full px-3"
            >
              Matched ({matchedCount})
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {totalCount === 0 ? (
            <div className="py-12 px-4">
              <InventoryEmptyState
                title="No inventory snapshot lines"
                description="This location had no active inventory balance records when the stocktake was started. Click 'Add Found SKU' above to register physically found stock."
              />
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="py-12 px-4 text-center text-sm text-muted-foreground">
              No items match the current search or tab filter.
            </div>
          ) : (
            <>
              {/* Desktop Table View (md and up) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                      <th className="py-3 px-4">Product / Item</th>
                      <th className="py-3 px-3">SKU</th>
                      <th className="py-3 px-3 text-right">Expected</th>
                      {stocktake.status !== 'COUNTING' && (
                        <th className="py-3 px-3 text-right">Net Movement</th>
                      )}
                      <th className="py-3 px-3 text-center w-52">Counted Qty</th>
                      <th className="py-3 px-3 text-right">Variance</th>
                      <th className="py-3 px-4 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredLines.map((line) => {
                      const isSaving = saving[line.inventoryItemId];
                      const saveError = saveErrors[line.inventoryItemId];
                      const isSaved = saveSuccesses[line.inventoryItemId];
                      const rawCounted = counts[line.inventoryItemId] ?? '';
                      const lineConditions = conditionCounts[line.inventoryItemId] ?? {};
                      const hasSplit = Object.values(lineConditions).some(
                        (v) => v !== undefined && v !== '' && Number(v) > 0 && Number(v) !== Number(rawCounted),
                      );

                      return (
                        <tr
                          key={line.inventoryItemId}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          {/* Product Details */}
                          <td className="py-3 px-4">
                            <p className="font-medium text-foreground">{line.productTitle}</p>
                            {line.optionSummary ? (
                              <p className="text-xs text-muted-foreground">{line.optionSummary}</p>
                            ) : null}
                            {saveError ? (
                              <p className="text-xs text-destructive mt-0.5">{saveError}</p>
                            ) : null}
                          </td>

                          {/* SKU (no font-mono) */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-foreground">
                              {line.sku}
                            </span>
                          </td>

                          {/* Snapshot Expected */}
                          <td className="py-3 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                            {formatInventoryNumber(line.expectedQuantityAtSnapshot)}
                          </td>

                          {/* Net Movements After Snapshot */}
                          {stocktake.status !== 'COUNTING' && (
                            <td className="py-3 px-3 text-right tabular-nums text-xs whitespace-nowrap">
                              {line.movements !== 0 ? (
                                <span
                                  className={
                                    line.movements > 0 ? 'text-emerald-600' : 'text-amber-600'
                                  }
                                >
                                  {line.movements > 0 ? '+' : ''}
                                  {formatInventoryNumber(line.movements)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )}

                          {/* Counted Quantity + Condition Trigger */}
                          <td className="py-3 px-3 align-middle">
                            <div className="flex items-center justify-center gap-1.5">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                disabled={stocktake.status !== 'COUNTING' || isSaving}
                                value={rawCounted}
                                onChange={(e) =>
                                  setCounts((prev) => ({
                                    ...prev,
                                    [line.inventoryItemId]: e.target.value,
                                  }))
                                }
                                onBlur={() => {
                                  const v = counts[line.inventoryItemId];
                                  if (v !== undefined) {
                                    void saveCount(line.inventoryItemId, v);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const v = counts[line.inventoryItemId];
                                    if (v !== undefined) {
                                      void saveCount(line.inventoryItemId, v);
                                    }
                                  }
                                }}
                                className="h-8 w-24 text-right tabular-nums text-sm"
                              />

                              {/* Condition Breakdown Button */}
                              <Button
                                type="button"
                                variant={hasSplit ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setConditionModalLine(line)}
                                className={`h-8 px-2 text-xs gap-1 ${
                                  hasSplit ? 'text-primary border border-primary/20' : 'text-muted-foreground'
                                }`}
                                title="Split into Damaged, Quarantine, or Inspection"
                              >
                                <SlidersHorizontal className="size-3.5" />
                                {hasSplit ? 'Split' : 'Cond'}
                              </Button>
                            </div>
                          </td>

                          {/* Variance */}
                          <td className="py-3 px-3 text-right tabular-nums font-medium whitespace-nowrap">
                            {line.variance === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : line.variance === 0 ? (
                              <span className="text-muted-foreground">0</span>
                            ) : (
                              <span
                                className={
                                  line.variance > 0
                                    ? 'text-emerald-600 font-semibold'
                                    : 'text-destructive font-semibold'
                                }
                              >
                                {line.variance > 0 ? '+' : ''}
                                {formatInventoryNumber(line.variance)}
                              </span>
                            )}
                          </td>

                          {/* Status & Quick-Actions */}
                          <td className="py-3 px-4 text-center">
                            {isSaving ? (
                              <span className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                                <RefreshCw className="size-3 animate-spin" />
                                Saving…
                              </span>
                            ) : isSaved ? (
                              <span className="text-xs text-emerald-600 flex items-center justify-center gap-1 font-medium">
                                <Check className="size-3.5" />
                                Saved
                              </span>
                            ) : line.hasCount ? (
                              <Badge variant="outline" className="text-xs py-0 h-5 text-emerald-700 bg-emerald-50/60 border-emerald-200">
                                Counted
                              </Badge>
                            ) : stocktake.status === 'COUNTING' ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleQuickMatchExpected(line)}
                                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                title="Match snapshot expected count"
                              >
                                Match Expected
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Touch Cards View (under md) */}
              <div className="md:hidden divide-y divide-border/60">
                {filteredLines.map((line) => {
                  const isSaving = saving[line.inventoryItemId];
                  const saveError = saveErrors[line.inventoryItemId];
                  const rawCounted = counts[line.inventoryItemId] ?? '';
                  const lineConditions = conditionCounts[line.inventoryItemId] ?? {};
                  const hasSplit = Object.values(lineConditions).some(
                    (v) => v !== undefined && v !== '' && Number(v) > 0 && Number(v) !== Number(rawCounted),
                  );

                  return (
                    <div key={line.inventoryItemId} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm text-foreground">{line.productTitle}</p>
                          {line.optionSummary && (
                            <p className="text-xs text-muted-foreground">{line.optionSummary}</p>
                          )}
                          <span className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-xs bg-muted text-foreground">
                            {line.sku}
                          </span>
                        </div>

                        {/* Variance badge on mobile */}
                        {line.variance !== null && (
                          <Badge
                            variant={line.variance === 0 ? 'outline' : 'secondary'}
                            className={`tabular-nums ${
                              line.variance > 0
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                : line.variance < 0
                                  ? 'text-destructive bg-destructive/10'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            Var: {line.variance > 0 ? '+' : ''}
                            {formatInventoryNumber(line.variance)}
                          </Badge>
                        )}
                      </div>

                      {/* Expected & Movements stats */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-2 rounded-lg">
                        <div>
                          <span className="text-muted-foreground">Expected: </span>
                          <span className="font-medium">{formatInventoryNumber(line.expectedQuantityAtSnapshot)}</span>
                        </div>
                        {line.movements !== 0 && (
                          <div>
                            <span className="text-muted-foreground">Net Moved: </span>
                            <span className={line.movements > 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                              {line.movements > 0 ? '+' : ''}{formatInventoryNumber(line.movements)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Count input for touch devices */}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex-1 min-w-0">
                          <label className="text-[11px] text-muted-foreground block mb-1">
                            Counted Physical Quantity
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            disabled={stocktake.status !== 'COUNTING' || isSaving}
                            value={rawCounted}
                            onChange={(e) =>
                              setCounts((prev) => ({
                                ...prev,
                                [line.inventoryItemId]: e.target.value,
                              }))
                            }
                            onBlur={() => {
                              const v = counts[line.inventoryItemId];
                              if (v !== undefined) void saveCount(line.inventoryItemId, v);
                            }}
                            className="h-10 text-base tabular-nums"
                          />
                        </div>

                        <div className="pt-4 flex items-center gap-1">
                          <Button
                            type="button"
                            variant={hasSplit ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setConditionModalLine(line)}
                            className="h-10 px-3 text-xs"
                          >
                            <SlidersHorizontal className="size-4" />
                          </Button>

                          {!line.hasCount && stocktake.status === 'COUNTING' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleQuickMatchExpected(line)}
                              className="h-10 px-3 text-xs"
                            >
                              Match
                            </Button>
                          )}
                        </div>
                      </div>

                      {saveError && (
                        <p className="text-xs text-destructive">{saveError}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Bottom Progress Summary */}
          {stocktake.status === 'COUNTING' && totalCount > 0 && !allCounted && (
            <div className="px-4 py-3 text-xs text-muted-foreground border-t bg-muted/20 flex items-center justify-between">
              <span>
                {uncountedCount} item{uncountedCount === 1 ? '' : 's'} remaining to count before submitting for review.
              </span>
              <span className="font-medium text-foreground">{progressPct}% complete</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Add Found SKU Modal */}
      <Dialog open={foundOpen} onOpenChange={setFoundOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5 text-primary" />
              Add Found SKU
            </DialogTitle>
            <DialogDescription>
              Add inventory physically present at this location but missing from the initial snapshot.
              It starts with an expected count of 0.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 flex-1 min-w-0 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search catalog by title, SKU, or barcode…"
                className="pl-9 text-sm h-9"
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg divide-y divide-border/60 max-h-60">
              {isLoadingVariants ? (
                <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="size-4 animate-spin" />
                  Loading catalog variants…
                </div>
              ) : availableVariants.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  All active catalog variants are already included in this stocktake session.
                </div>
              ) : filteredVariants.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No catalog variants match &ldquo;{variantSearch}&rdquo;.
                </div>
              ) : (
                filteredVariants.map((variant) => {
                  const isSelected = foundVariantId === variant.id;

                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setFoundVariantId(variant.id)}
                      className={`w-full text-left p-3 text-sm flex items-start gap-3 transition-colors ${
                        isSelected ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Package className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{variant.productTitle}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className="bg-muted px-1.5 py-0.5 rounded text-foreground">
                            {variant.sku}
                          </span>
                          {variant.optionSummary && <span>{variant.optionSummary}</span>}
                        </div>
                      </div>
                      {isSelected && <Check className="size-4 text-primary shrink-0 mt-1" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFoundOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void addFoundSku()}
              disabled={!foundVariantId || isAddingFound}
              className="gap-1.5"
            >
              {isAddingFound ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  Add to Count Sheet
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split Condition Breakdown Modal */}
      <ConditionBreakdownModal
        open={Boolean(conditionModalLine)}
        onOpenChange={(open) => {
          if (!open) setConditionModalLine(null);
        }}
        line={conditionModalLine}
        currentCounted={conditionModalLine ? counts[conditionModalLine.inventoryItemId] ?? '0' : '0'}
        conditionValues={conditionModalLine ? conditionCounts[conditionModalLine.inventoryItemId] ?? {} : {}}
        onSave={async (itemId, total, conds) => {
          setCounts((prev) => ({ ...prev, [itemId]: total }));
          setConditionCounts((prev) => ({ ...prev, [itemId]: conds }));
          await saveCount(itemId, total, conds);
        }}
        disabled={stocktake.status !== 'COUNTING'}
      />
    </div>
  );
}
