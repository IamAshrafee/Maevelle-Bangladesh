'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { CatalogVariantChoiceDto, StocktakeDetailDto } from '@maevelle/contracts';

import {
  InventoryRequestError,
  inventoryRequest,
  formatInventoryNumber,
  formatInventoryDate,
} from '@/lib/inventory/api';
import {
  InventoryStatCards,
  InventoryEmptyState,
  InventoryFeedback,
} from './inventory-page-ui';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  SerializedStocktakeCountDialog,
  type SerializedCountEntry,
} from './serialized-stocktake-count-dialog';
import {
  StocktakeConditionDialog,
  type StocktakeCondition,
} from './stocktake-condition-dialog';
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
import { StatusBadge } from '@/components/status-badge';

type EnrichedStocktake = StocktakeDetailDto;
type Condition = StocktakeCondition;
type FilterTab = 'all' | 'discrepancies' | 'uncounted' | 'matched';

function StocktakeStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

// ─── Main Stocktake Detail Component ──────────────────────────────────────────

export function StocktakeDetail({ stocktakeId }: { stocktakeId: string }) {
  const [stocktake, setStocktake] = useState<EnrichedStocktake | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);

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
  const [conditionModalLine, setConditionModalLine] = useState<
    EnrichedStocktake['lines'][number] | null
  >(null);
  const [serializedCountLine, setSerializedCountLine] = useState<
    EnrichedStocktake['lines'][number] | null
  >(null);

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
  const reload = async (): Promise<boolean> => {
    try {
      setError(null);
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
      setCounts(persisted);
      setConditionCounts(condPersisted);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload stocktake data.');
      return false;
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
    countedUnits?: readonly SerializedCountEntry[],
  ) => {
    if (!stocktake || stocktake.status !== 'COUNTING') return;
    if (!value.trim() || !/^\d+(?:\.\d{1,6})?$/.test(value)) return;

    setSaving((p) => ({ ...p, [inventoryItemId]: true }));
    setSaveErrors((p) => ({ ...p, [inventoryItemId]: '' }));
    setSaveSuccesses((p) => ({ ...p, [inventoryItemId]: false }));

    const payload = {
      countedQuantity: value,
      ...(quantitiesByCondition ? { countedQuantitiesByCondition: quantitiesByCondition } : {}),
      ...(countedUnits ? { countedUnits } : {}),
      version: currentVersionRef.current,
    };
    const commandKey = crypto.randomUUID();

    try {
      await inventoryRequest(
        `/inventory/stocktakes/${stocktakeId}/lines/${inventoryItemId}/count`,
        {
          method: 'POST',
          headers: { 'idempotency-key': commandKey },
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

      // Reload concurrent work for review; never overwrite it automatically.
      if (
        (err instanceof InventoryRequestError && err.code === 'STALE_VERSION') ||
        errorMsg.includes('no longer current')
      ) {
        try {
          await reload();
          setSaveErrors((previous) => ({
            ...previous,
            [inventoryItemId]:
              'Another operator changed this count. The latest values are loaded; review them before saving again.',
          }));
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
        headers: { 'idempotency-key': `post-${stocktakeId}-${currentVersionRef.current}` },
      });
      setSuccessMessage(
        'Stocktake posted successfully. Inventory balances have been reconciled in the ledger.',
      );
      setPostConfirmOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stocktake could not be posted.');
      if (err instanceof InventoryRequestError && err.status === 409) {
        setPostConfirmOpen(false);
        await reload();
      }
    } finally {
      setIsPosting(false);
    }
  };

  const preparePostReview = async () => {
    setIsTransitioning(true);
    const refreshed = await reload();
    setIsTransitioning(false);
    if (refreshed) setPostConfirmOpen(true);
  };

  // Submit for review or cancel
  const handleTransition = async (action: 'submit-review' | 'cancel') => {
    if (!stocktake) return;
    setIsTransitioning(true);
    setError(null);
    try {
      await inventoryRequest(`/inventory/stocktakes/${stocktakeId}/${action}`, {
        method: 'POST',
        headers: { 'idempotency-key': `${action}-${stocktakeId}-${currentVersionRef.current}` },
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
        setError(
          caught instanceof Error ? caught.message : 'Catalog variants could not be loaded.',
        );
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
        headers: {
          'idempotency-key': `found-${stocktakeId}-${currentVersionRef.current}-${foundVariantId}`,
        },
        body: JSON.stringify({ variantId: foundVariantId, version: currentVersionRef.current }),
      });
      setFoundOpen(false);
      setFoundVariantId('');
      setSuccessMessage(
        'Found SKU added with expected snapshot quantity of 0. Enter its physical count below.',
      );
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
    const finalExpected =
      line.finalExpectedQuantity !== null
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
  const movementAffectedCount = linesWithCalculatedVariance.filter(
    (line) => Math.abs(line.movements) > 0.000001,
  ).length;
  const gainCount = discrepantLines.filter((line) => (line.variance ?? 0) > 0).length;
  const lossCount = discrepantLines.filter((line) => (line.variance ?? 0) < 0).length;

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
              {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            </button>

            {stocktake.status === 'POSTED' && stocktake.postedInventoryTransactionId && (
              <Link
                href="/inventory/adjustments"
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
                <AlertDialogTrigger
                  render={<Button variant="outline" size="sm" disabled={isTransitioning} />}
                >
                  Cancel Stocktake
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this stocktake?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Recorded counts remain as historical audit notes, but no inventory balances
                      will be changed.
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
                <AlertDialogTrigger
                  render={
                    <Button variant="outline" size="sm" disabled={isTransitioning || isPosting} />
                  }
                >
                  Cancel Stocktake
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this stocktake?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will abort the stocktake without applying any adjustments. Recorded
                      counts will be preserved as audit records.
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

              <Button
                size="sm"
                disabled={isPosting || isTransitioning}
                onClick={() => void preparePostReview()}
                className="gap-1.5"
              >
                {isTransitioning ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Review and post
              </Button>
              <AlertDialog open={postConfirmOpen} onOpenChange={setPostConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Post this stocktake to ledger?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This refreshed preview contains {discrepantCount} variance line
                      {discrepantCount === 1 ? '' : 's'} ({gainCount} gain, {lossCount} loss) and{' '}
                      {movementAffectedCount} line{movementAffectedCount === 1 ? '' : 's'} affected
                      by net movement after the snapshot. Posting re-locks current balances and
                      recomputes every variance before writing the authoritative ledger adjustment.
                      It cannot be undone.
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
            <Badge
              variant="outline"
              className="border-success/20 bg-success/10 px-3 py-1.5 text-success"
            >
              Reconciliation Completed on {formatInventoryDate(stocktake.postedAt?.toString())}
            </Badge>
          )}
        </div>
      </div>

      {/* Operational Feedback */}
      {error && <InventoryFeedback message={error} isError />}
      {successMessage && <InventoryFeedback message={successMessage} />}

      {stocktake.status === 'REVIEW' ? (
        <div className="flex flex-col gap-3 rounded-xl border border-info/25 bg-info/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-foreground">Live review preview</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Net movement and variance compare the frozen snapshot and saved physical count with
              the latest Location balance. Posting still locks and recomputes these values, so use
              Review and post to refresh once more before confirmation.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            disabled={isTransitioning || isPosting}
          >
            <RefreshCw aria-hidden="true" /> Refresh preview
          </Button>
        </div>
      ) : null}

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
                        (v) =>
                          v !== undefined &&
                          v !== '' &&
                          Number(v) > 0 &&
                          Number(v) !== Number(rawCounted),
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
                                  className={line.movements > 0 ? 'text-success' : 'text-warning'}
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
                              {line.trackingMode === 'SERIAL' ? (
                                <Button
                                  type="button"
                                  variant={line.hasCount ? 'secondary' : 'outline'}
                                  size="sm"
                                  disabled={stocktake.status !== 'COUNTING' || isSaving}
                                  onClick={() => setSerializedCountLine(line)}
                                  className="h-8 gap-1.5 font-mono text-xs tabular-nums"
                                >
                                  <Package className="size-3.5" />
                                  {line.hasCount ? `${rawCounted} units` : 'Count Unit IDs'}
                                </Button>
                              ) : (
                                <>
                                  <Input
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    step="1"
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
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const v = counts[line.inventoryItemId];
                                        if (v !== undefined)
                                          void saveCount(line.inventoryItemId, v);
                                      }
                                    }}
                                    className="h-8 w-24 text-right font-mono text-sm tabular-nums"
                                  />
                                  <Button
                                    type="button"
                                    variant={hasSplit ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setConditionModalLine(line)}
                                    className={`h-8 gap-1 px-2 text-xs ${
                                      hasSplit
                                        ? 'border border-primary/20 text-primary'
                                        : 'text-muted-foreground'
                                    }`}
                                    title="Split into Damaged, Quarantine, or Inspection"
                                  >
                                    <SlidersHorizontal className="size-3.5" />
                                    {hasSplit ? 'Split' : 'Cond'}
                                  </Button>
                                </>
                              )}
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
                                    ? 'text-success font-semibold'
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
                              <span className="flex items-center justify-center gap-1 text-xs font-medium text-success">
                                <Check className="size-3.5" />
                                Saved
                              </span>
                            ) : line.hasCount ? (
                              <Badge
                                variant="outline"
                                className="h-5 border-success/20 bg-success/10 py-0 text-xs text-success"
                              >
                                Counted
                              </Badge>
                            ) : stocktake.status === 'COUNTING' &&
                              line.trackingMode !== 'SERIAL' ? (
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
                    (v) =>
                      v !== undefined &&
                      v !== '' &&
                      Number(v) > 0 &&
                      Number(v) !== Number(rawCounted),
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
                                ? 'border-success/20 bg-success/10 text-success'
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
                          <span className="font-medium">
                            {formatInventoryNumber(line.expectedQuantityAtSnapshot)}
                          </span>
                        </div>
                        {line.movements !== 0 && (
                          <div>
                            <span className="text-muted-foreground">Net Moved: </span>
                            <span
                              className={
                                line.movements > 0
                                  ? 'font-medium text-success'
                                  : 'font-medium text-warning'
                              }
                            >
                              {line.movements > 0 ? '+' : ''}
                              {formatInventoryNumber(line.movements)}
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
                            inputMode="numeric"
                            step="1"
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

                      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
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
                {uncountedCount} item{uncountedCount === 1 ? '' : 's'} remaining to count before
                submitting for review.
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
              Add inventory physically present at this location but missing from the initial
              snapshot. It starts with an expected count of 0.
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
      <StocktakeConditionDialog
        open={Boolean(conditionModalLine)}
        onOpenChange={(open) => {
          if (!open) setConditionModalLine(null);
        }}
        line={conditionModalLine}
        currentCounted={
          conditionModalLine ? (counts[conditionModalLine.inventoryItemId] ?? '0') : '0'
        }
        conditionValues={
          conditionModalLine ? (conditionCounts[conditionModalLine.inventoryItemId] ?? {}) : {}
        }
        onSave={async (itemId, total, conds) => {
          setCounts((prev) => ({ ...prev, [itemId]: total }));
          setConditionCounts((prev) => ({ ...prev, [itemId]: conds }));
          await saveCount(itemId, total, conds);
        }}
        disabled={stocktake.status !== 'COUNTING'}
      />
      <SerializedStocktakeCountDialog
        open={Boolean(serializedCountLine)}
        onOpenChange={(open) => {
          if (!open) setSerializedCountLine(null);
        }}
        line={serializedCountLine}
        disabled={stocktake.status !== 'COUNTING'}
        onSave={async (units) => {
          if (!serializedCountLine) return;
          const conditionTotals = units.reduce<Partial<Record<Condition, string>>>(
            (totals, unit) => {
              totals[unit.condition] = String(Number(totals[unit.condition] ?? '0') + 1);
              return totals;
            },
            {},
          );
          const total = String(units.length);
          setCounts((current) => ({
            ...current,
            [serializedCountLine.inventoryItemId]: total,
          }));
          setConditionCounts((current) => ({
            ...current,
            [serializedCountLine.inventoryItemId]: conditionTotals,
          }));
          await saveCount(serializedCountLine.inventoryItemId, total, conditionTotals, units);
          await reload();
        }}
      />
    </div>
  );
}
