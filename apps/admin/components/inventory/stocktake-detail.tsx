'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, CheckCircle2, Clock, MapPin, Package, Search } from 'lucide-react';
import type { StocktakeDetailDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryEmptyState, InventoryConditionBadge } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface StocktakeLine {
  inventoryItemId: string;
  sku: string;
  productTitle: string;
  optionSummary: string | null;
  expectedQuantity: string;
  countedQuantity: string | null;
}

interface EnrichedStocktake {
  id: string;
  locationId: string;
  locationName: string;
  status: string;
  version: number;
  lines: StocktakeLine[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'POSTED'
      ? ('default' as const)
      : status === 'COUNTING'
        ? ('secondary' as const)
        : ('outline' as const);
  return <Badge variant={variant}>{status}</Badge>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function StocktakeDetail({ stocktakeId }: { stocktakeId: string }) {
  const router = useRouter();
  const [stocktake, setStocktake] = useState<EnrichedStocktake | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  // Local state for input values — keyed by inventoryItemId
  const [counts, setCounts] = useState<Record<string, string>>({});
  // Saving state per line
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // Search filter
  const [search, setSearch] = useState('');

  const reload = async () => {
    const res = await inventoryRequest<{ data: EnrichedStocktake }>(`/inventory/stocktakes/${stocktakeId}`);
    setStocktake(res.data);
    // Merge server-persisted counts into local state
    const persisted: Record<string, string> = {};
    for (const line of res.data.lines) {
      if (line.countedQuantity !== null) persisted[line.inventoryItemId] = line.countedQuantity;
    }
    setCounts((prev) => ({ ...persisted, ...prev }));
  };

  useEffect(() => {
    let active = true;
    inventoryRequest<{ data: EnrichedStocktake }>(`/inventory/stocktakes/${stocktakeId}`)
      .then((res) => {
        if (!active) return;
        setStocktake(res.data);
        const persisted: Record<string, string> = {};
        for (const line of res.data.lines) {
          if (line.countedQuantity !== null) persisted[line.inventoryItemId] = line.countedQuantity;
        }
        setCounts(persisted);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [stocktakeId]);

  const saveCount = async (inventoryItemId: string, value: string) => {
    if (!stocktake || stocktake.status !== 'COUNTING') return;
    if (!value.trim() || !/^\d+(?:\.\d{1,6})?$/.test(value)) return;
    setSaving((p) => ({ ...p, [inventoryItemId]: true }));
    setSaveErrors((p) => ({ ...p, [inventoryItemId]: '' }));
    try {
      await inventoryRequest(
        `/inventory/stocktakes/${stocktakeId}/lines/${inventoryItemId}/count`,
        {
          method: 'POST',
          body: JSON.stringify({ countedQuantity: value, version: stocktake.version }),
        },
      );
      // Bump our local version to match backend expectation for next count save
      setStocktake((prev) =>
        prev ? { ...prev, version: prev.version + 1 } : prev,
      );
    } catch (err) {
      setSaveErrors((p) => ({
        ...p,
        [inventoryItemId]: err instanceof Error ? err.message : 'Could not save count.',
      }));
    } finally {
      setSaving((p) => ({ ...p, [inventoryItemId]: false }));
    }
  };

  const handlePost = async () => {
    if (!stocktake) return;
    setIsPosting(true);
    setError(null);
    try {
      await inventoryRequest(`/inventory/stocktakes/${stocktakeId}/post`, {
        method: 'POST',
        headers: { 'idempotency-key': `post-${stocktakeId}` },
      });
      setSuccessMessage('Stocktake posted. Inventory balances have been adjusted.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stocktake could not be posted.');
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!stocktake) {
    return (
      <InventoryEmptyState
        title="Stocktake not found"
        description="This stocktake could not be found or you don't have permission to view it."
      />
    );
  }

  const countedCount = stocktake.lines.filter(
    (l) => counts[l.inventoryItemId] !== undefined && counts[l.inventoryItemId] !== '',
  ).length;
  const totalCount = stocktake.lines.length;
  const progressPct = totalCount === 0 ? 0 : Math.round((countedCount / totalCount) * 100);
  const allCounted = countedCount === totalCount;

  const filteredLines = stocktake.lines.filter((l) => {
    const q = search.toLowerCase();
    return (
      !q ||
      l.sku.toLowerCase().includes(q) ||
      l.productTitle.toLowerCase().includes(q) ||
      (l.optionSummary ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/inventory/stocktakes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight">
              Stocktake — {stocktake.locationName}
            </h2>
            <StatusBadge status={stocktake.status} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {stocktake.locationName}
          </p>
        </div>

        {stocktake.status === 'COUNTING' && (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button disabled={!allCounted || isPosting} />}
            >
              {isPosting ? 'Posting…' : 'Review & Post'}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Post this stocktake?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will finalize the count and apply all variances to your inventory balances.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handlePost} disabled={isPosting}>
                  Post Stocktake
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Items to Count</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Counted</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className={allCounted ? 'text-emerald-600' : undefined}>
                {countedCount}
              </span>
              <span className="text-muted-foreground text-base font-normal"> / {totalCount}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stocktake.status === 'POSTED'
                ? 'Complete'
                : allCounted
                  ? 'Ready to post'
                  : 'In progress'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stocktake.status === 'COUNTING' && !allCounted
                ? `${totalCount - countedCount} items remaining`
                : stocktake.status === 'POSTED'
                  ? 'Balances have been updated'
                  : 'All items counted'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Count sheet */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Count Lines</CardTitle>
            <CardDescription>
              {stocktake.status === 'COUNTING'
                ? 'Enter the physical count for each item. Counts auto-save as you leave each field.'
                : 'Stocktake has been posted. Counts are read-only.'}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by SKU or product…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Product</th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">SKU</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Expected</th>
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground w-36">Counted Qty</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Variance</th>
                  <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground w-20">Status</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {filteredLines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                      No items match your search.
                    </td>
                  </tr>
                )}
                {filteredLines.map((line) => {
                  const rawCounted = counts[line.inventoryItemId];
                  const counted = rawCounted !== undefined && rawCounted !== '' ? Number(rawCounted) : null;
                  const expected = Number(line.expectedQuantity);
                  const variance = counted !== null ? counted - expected : null;
                  const isSaving = saving[line.inventoryItemId];
                  const saveError = saveErrors[line.inventoryItemId];
                  const isCounted = counted !== null;

                  return (
                    <tr
                      key={line.inventoryItemId}
                      className="border-b transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 align-middle">
                        <p className="font-medium">{line.productTitle}</p>
                        {line.optionSummary && (
                          <p className="text-xs text-muted-foreground">{line.optionSummary}</p>
                        )}
                        {saveError && (
                          <p className="text-xs text-destructive mt-0.5">{saveError}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {line.sku}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right align-middle tabular-nums text-muted-foreground">
                        {formatInventoryNumber(line.expectedQuantity)}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={rawCounted ?? ''}
                          disabled={stocktake.status !== 'COUNTING' || isSaving}
                          placeholder="0"
                          className="h-8 w-28 text-right tabular-nums"
                          onChange={(e) =>
                            setCounts((p) => ({ ...p, [line.inventoryItemId]: e.target.value }))
                          }
                          onBlur={() => {
                            const v = counts[line.inventoryItemId];
                            if (v !== undefined) void saveCount(line.inventoryItemId, v);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-right align-middle tabular-nums font-medium">
                        {variance === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : variance === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : (
                          <span className={variance > 0 ? 'text-emerald-600' : 'text-destructive'}>
                            {variance > 0 ? '+' : ''}
                            {formatInventoryNumber(variance)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center align-middle">
                        {isSaving ? (
                          <span className="text-xs text-muted-foreground">Saving…</span>
                        ) : isCounted ? (
                          <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
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

          {stocktake.status === 'COUNTING' && !allCounted && (
            <p className="px-4 py-3 text-xs text-muted-foreground border-t">
              All {totalCount - countedCount} remaining items must be counted before you can post.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
