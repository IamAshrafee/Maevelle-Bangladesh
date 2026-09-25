'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { OperationalEmptyState } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';
import type {
  AccountLedgerData,
  LedgerDirectionFilter,
  LedgerFilterState,
  LedgerTransactionTypeFilter,
} from './types';

interface AccountLedgerTabProps {
  readonly ledgerData: AccountLedgerData;
  readonly filters: LedgerFilterState;
  readonly isLoading: boolean;
  readonly onFiltersChange: (filters: Partial<LedgerFilterState>) => void;
  readonly onResetFilters: () => void;
}

export function AccountLedgerTab({
  ledgerData,
  filters,
  isLoading,
  onFiltersChange,
  onResetFilters,
}: AccountLedgerTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { items, pagination } = {
    items: ledgerData.entries,
    pagination: ledgerData.pagination,
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Fallback
    }
  };

  const hasActiveFilters =
    Boolean(filters.query) ||
    filters.direction !== 'ALL' ||
    filters.transactionType !== 'ALL' ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  const startItem =
    pagination.totalItems > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Filters Toolbar */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 max-w-md">
              <SearchInput
                placeholder="Search transaction number, description, or domain..."
                value={filters.query}
                onChange={(val) => onFiltersChange({ query: val, page: 1 })}
                onClear={() => onFiltersChange({ query: '', page: 1 })}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Direction Filter */}
              <NativeSelect
                value={filters.direction}
                onChange={(e) =>
                  onFiltersChange({
                    direction: e.target.value as LedgerDirectionFilter,
                    page: 1,
                  })
                }
                className="h-8 text-xs w-[125px]"
                aria-label="Filter by cash direction"
              >
                <option value="ALL">All directions</option>
                <option value="IN">Money in (+)</option>
                <option value="OUT">Money out (-)</option>
              </NativeSelect>

              {/* Transaction Type Filter */}
              <NativeSelect
                value={filters.transactionType}
                onChange={(e) =>
                  onFiltersChange({
                    transactionType: e.target.value as LedgerTransactionTypeFilter,
                    page: 1,
                  })
                }
                className="h-8 text-xs w-[165px]"
                aria-label="Filter by transaction type"
              >
                <option value="ALL">All transaction types</option>
                <option value="PAYMENT_SOURCE_POSTING">Customer Payment</option>
                <option value="REFUND_SOURCE_POSTING">Customer Refund</option>
                <option value="EXPENSE_PAYMENT">Expense Payment</option>
                <option value="INTERNAL_TRANSFER">Internal Transfer</option>
                <option value="COD_SETTLEMENT">COD Settlement</option>
                <option value="OPENING_BALANCE">Opening Balance</option>
                <option value="EXTERNAL_ADJUSTMENT">Adjustment</option>
              </NativeSelect>

              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onResetFilters}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3 mr-1" />
                  Reset
                </Button>
              ) : null}
            </div>
          </div>

          {/* Date range filter sub-row */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
            <span>Filter date:</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => onFiltersChange({ from: e.target.value, page: 1 })}
              className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="From"
              aria-label="Date from"
            />
            <span>to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => onFiltersChange({ to: e.target.value, page: 1 })}
              className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="To"
              aria-label="Date to"
            />
            {filters.from || filters.to ? (
              <button
                type="button"
                onClick={() => onFiltersChange({ from: '', to: '', page: 1 })}
                className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
              >
                Clear dates
              </button>
            ) : null}
          </div>
        </div>

        {/* Transactions Table */}
        <Card className="overflow-hidden border-border/80 shadow-2xs">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12">
              <OperationalEmptyState
                title={hasActiveFilters ? 'No matching transactions' : 'No account activity yet'}
                description={
                  hasActiveFilters
                    ? 'No ledger movements match the current filter criteria. Try clearing or relaxing filters.'
                    : 'Customer payments, expenses, transfers, refunds, and adjustments affecting this account will appear here.'
                }
              />
              {hasActiveFilters ? (
                <div className="flex justify-center mt-3">
                  <Button variant="outline" size="sm" onClick={onResetFilters}>
                    Clear filters
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40%]">Movement & description</TableHead>
                    <TableHead className="w-[18%]">Transaction type</TableHead>
                    <TableHead className="w-[20%]">Business source</TableHead>
                    <TableHead className="w-[12%]">Occurred at</TableHead>
                    <TableHead className="w-[10%] text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((entry) => {
                    const incoming = Number(entry.amount_delta) > 0;
                    const isCopied = copiedId === entry.id;

                    return (
                      <TableRow key={entry.id} className="transition-colors">
                        {/* Movement & Description */}
                        <TableCell>
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                                incoming
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              }`}
                              aria-hidden="true"
                            >
                              {incoming ? (
                                <ArrowDownLeft className="size-3.5" />
                              ) : (
                                <ArrowUpRight className="size-3.5" />
                              )}
                            </span>

                            <div className="min-w-0 space-y-0.5">
                              <p className="text-sm font-medium text-foreground leading-snug">
                                {entry.description}
                              </p>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                                <span>{entry.transaction_number}</span>
                                <Tooltip>
                                  <TooltipTrigger
                                    onClick={() =>
                                      copyToClipboard(entry.transaction_number, entry.id)
                                    }
                                    className="hover:text-foreground transition-colors p-0.5"
                                    aria-label="Copy transaction number"
                                  >
                                    {isCopied ? (
                                      <Check className="size-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="size-3" />
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    {isCopied ? 'Copied!' : 'Copy transaction number'}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Transaction Type */}
                        <TableCell>
                          <StatusBadge status={entry.transaction_type} />
                        </TableCell>

                        {/* Business Source */}
                        <TableCell>
                          {entry.source_domain === 'payments.payment' && entry.source_id ? (
                            <Link
                              href={`/payments/${entry.source_id}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <span>Customer payment</span>
                              <ExternalLink className="size-3" />
                            </Link>
                          ) : entry.source_domain === 'finance.expense' && entry.source_id ? (
                            <Link
                              href={`/finance/expenses/${entry.source_id}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <span>Expense record</span>
                              <ExternalLink className="size-3" />
                            </Link>
                          ) : entry.source_domain === 'finance.cod_settlement' ? (
                            <Link
                              href="/finance/cod-settlements"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <span>COD settlement</span>
                              <ExternalLink className="size-3" />
                            </Link>
                          ) : entry.source_domain === 'finance.account' ? (
                            <span className="text-xs text-muted-foreground">
                              Opening balance float
                            </span>
                          ) : entry.source_domain === 'finance.transfer' ? (
                            <span className="text-xs text-muted-foreground">
                              Account transfer
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {entry.source_domain
                                ? humanizeFinanceCode(entry.source_domain)
                                : 'Manual / direct ledger'}
                            </span>
                          )}
                        </TableCell>

                        {/* Occurred At */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger>
                              {formatFinanceDate(entry.created_at, true)}
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {new Date(entry.created_at).toISOString()}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>

                        {/* Amount */}
                        <TableCell
                          className={`text-right text-sm font-semibold tabular-nums whitespace-nowrap ${
                            incoming
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {incoming ? '+' : ''}
                          {formatMoney(entry.amount_delta, entry.currency_code)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalItems > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border/60 px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Showing <strong className="text-foreground">{startItem}</strong> to{' '}
                  <strong className="text-foreground">{endItem}</strong> of{' '}
                  <strong className="text-foreground">{pagination.totalItems}</strong> entries
                </span>
                <span>·</span>
                <label className="flex items-center gap-1">
                  <span>Per page:</span>
                  <NativeSelect
                    value={String(filters.pageSize)}
                    onChange={(e) =>
                      onFiltersChange({ pageSize: Number(e.target.value), page: 1 })
                    }
                    className="h-7 text-xs w-[65px]"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </NativeSelect>
                </label>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onFiltersChange({ page: pagination.page - 1 })}
                  disabled={pagination.page <= 1 || isLoading}
                  className="h-8 gap-1 text-xs px-2.5"
                >
                  <ChevronLeft className="size-3.5" />
                  <span>Previous</span>
                </Button>

                <span className="px-2 text-xs text-muted-foreground font-medium">
                  Page {pagination.page} of {Math.max(1, pagination.totalPages)}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onFiltersChange({ page: pagination.page + 1 })}
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  className="h-8 gap-1 text-xs px-2.5"
                >
                  <span>Next</span>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </TooltipProvider>
  );
}
