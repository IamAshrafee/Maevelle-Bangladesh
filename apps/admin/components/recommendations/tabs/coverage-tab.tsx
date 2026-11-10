'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  ExternalLink,
  Eye,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  Sparkles,
  X,
  Filter,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState, LoadingState } from '@/components/ui/page-shell';
import type { CoverageItem, CoverageResponse } from '../recommendations-types';

interface CoverageTabProps {
  coverage: CoverageResponse | null;
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  page: number;
  onPageChange: (p: number) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAllPage: (ids: string[]) => void;
  onClearSelected: () => void;
  onOpenBulkSheet: () => void;
  onInspectProduct: (productId: string) => void;
  canCurate: boolean;
}

export function CoverageTab({
  coverage,
  loading,
  query,
  onQueryChange,
  page,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onSelectAllPage,
  onClearSelected,
  onOpenBulkSheet,
  onInspectProduct,
  canCurate,
}: CoverageTabProps) {
  const [filterMode, setFilterMode] = React.useState<'all' | 'needs-attention' | 'curated'>('all');

  const items = coverage?.items ?? [];

  // Filter items based on local filter tabs
  const filteredItems = React.useMemo(() => {
    if (filterMode === 'needs-attention') {
      return items.filter((item) => item.similarCount === 0 || item.complementaryCount === 0);
    }
    if (filterMode === 'curated') {
      return items.filter((item) => item.actionCount > 0);
    }
    return items;
  }, [items, filterMode]);

  const allPageSelected =
    items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <div className="space-y-4">
      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            aria-label="Search published products"
            placeholder="Search products by title or handle…"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              onPageChange(1);
            }}
            className="pl-9 pr-8 h-9 text-xs sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-muted/60 p-1 rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              filterMode === 'all'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Products
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('needs-attention')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              filterMode === 'needs-attention'
                ? 'bg-background text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <AlertTriangle className="size-3 text-amber-500" />
            Needs Attention
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('curated')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
              filterMode === 'curated'
                ? 'bg-background text-primary shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="size-3 text-primary" />
            Curated Overrides
          </button>
        </div>
      </div>

      {/* Table view */}
      {loading && !coverage ? (
        <LoadingState message="Evaluating catalog recommendation coverage…" />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={Filter}
          title={query ? 'No matching products found' : 'No products in this view'}
          description={
            query
              ? `No published products matched "${query}". Try adjusting your search term.`
              : 'All products currently meet healthy coverage criteria.'
          }
          action={
            query ? (
              <Button variant="outline" size="sm" onClick={() => onQueryChange('')}>
                Clear search
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="relative">
          <Table density="comfortable">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all on current page"
                    checked={allPageSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSelectAllPage(items.map((i) => i.id));
                      } else {
                        onClearSelected();
                      }
                    }}
                    className="size-4 rounded border-border accent-primary cursor-pointer"
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-center">You May Also Like</TableHead>
                <TableHead className="text-center">Complete Your Look</TableHead>
                <TableHead className="text-center">Curated Overrides</TableHead>
                <TableHead className="text-center">Discovery Health</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const isHealthy = item.similarCount > 0 && item.complementaryCount > 0;
                const isSparse = item.similarCount === 0 && item.complementaryCount === 0;

                return (
                  <TableRow
                    key={item.id}
                    data-state={isSelected ? 'selected' : undefined}
                    className="group"
                  >
                    {/* Checkbox */}
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        checked={isSelected}
                        onChange={() => onToggleSelect(item.id)}
                        className="size-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </TableCell>

                    {/* Product Title & Handle */}
                    <TableCell>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-foreground truncate max-w-[260px] sm:max-w-md">
                          {item.title}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          /{item.handle}
                        </span>
                      </div>
                    </TableCell>

                    {/* Similar Recommendations Count */}
                    <TableCell className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold tabular-nums border ${
                                item.similarCount > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60'
                              }`}
                            >
                              {item.similarCount}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.similarCount > 0
                              ? `${item.similarCount} similar items eligible for carousel`
                              : 'No similar items eligible. Check category, tags, or stock.'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>

                    {/* Complementary Recommendations Count */}
                    <TableCell className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-xs font-semibold tabular-nums border ${
                                item.complementaryCount > 0
                                  ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60'
                                  : 'bg-muted text-muted-foreground border-border'
                              }`}
                            >
                              {item.complementaryCount}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.complementaryCount > 0
                              ? `${item.complementaryCount} styling companion items eligible`
                              : 'No styling companions. Check compatibility rules or occasions.'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>

                    {/* Curated Overrides Count */}
                    <TableCell className="text-center">
                      {item.actionCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-semibold tabular-nums bg-primary/10 text-primary border border-primary/20">
                          <Sparkles className="size-3" />
                          {item.actionCount}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono tabular-nums">
                          0
                        </span>
                      )}
                    </TableCell>

                    {/* Health Status */}
                    <TableCell className="text-center">
                      {isHealthy ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          Healthy
                        </span>
                      ) : isSparse ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                          <XCircle className="size-3.5" />
                          No Recs
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-3.5" />
                          Partial
                        </span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => onInspectProduct(item.id)}
                                />
                              }
                            >
                              <Eye className="size-3.5 mr-1" />
                              Inspect
                            </TooltipTrigger>
                            <TooltipContent>Inspect recommendation preview</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  render={
                                    <Link
                                      href={`/products/${item.id}/edit?section=recommendations`}
                                    />
                                  }
                                  nativeButton={false}
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                />
                              }
                            >
                              <Sliders className="size-3.5 mr-1" />
                              Curate
                            </TooltipTrigger>
                            <TooltipContent>Open product curation panel</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          Showing page {page} · Total {coverage?.total ?? 0} published products
        </span>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs font-mono tabular-nums px-2 font-medium">Page {page}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!coverage || page * coverage.pageSize >= coverage.total || loading}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-border bg-card/95 backdrop-blur-md px-4 py-2.5 shadow-lg max-w-[90vw] sm:max-w-md w-full justify-between"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="size-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-foreground truncate">
                {selectedIds.length} Products Selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={onClearSelected}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canCurate}
                onClick={onOpenBulkSheet}
                className="h-8 text-xs shadow-sm flex items-center gap-1.5"
              >
                <Layers className="size-3.5" />
                Bulk Merchandising
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
