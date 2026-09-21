'use client';

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { FormEvent } from 'react';

import type { FinancialAccountDto, PaginationDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { ExpenseCategoryDto } from '@/lib/finance/types';

export function ExpenseControls({
  query,
  categoryId,
  accountId,
  status,
  paymentState,
  from,
  to,
  categories,
  accounts,
  pagination,
  loading,
  onQueryChange,
  onCategoryChange,
  onAccountChange,
  onStatusChange,
  onPaymentStateChange,
  onFromChange,
  onToChange,
  onQuickRangeChange,
  onApply,
  onReset,
  onPageChange,
}: {
  readonly query: string;
  readonly categoryId: string;
  readonly accountId: string;
  readonly status: string;
  readonly paymentState: string;
  readonly from: string;
  readonly to: string;
  readonly categories: readonly ExpenseCategoryDto[];
  readonly accounts: readonly FinancialAccountDto[];
  readonly pagination: PaginationDto;
  readonly loading: boolean;
  readonly onQueryChange: (value: string) => void;
  readonly onCategoryChange: (value: string) => void;
  readonly onAccountChange: (value: string) => void;
  readonly onStatusChange: (value: string) => void;
  readonly onPaymentStateChange: (value: string) => void;
  readonly onFromChange: (value: string) => void;
  readonly onToChange: (value: string) => void;
  readonly onQuickRangeChange: (from: string, to: string) => void;
  readonly onApply: (event: FormEvent<HTMLFormElement>) => void;
  readonly onReset: () => void;
  readonly onPageChange: (page: number) => void;
}) {
  const hasFilters = Boolean(
    query.trim() ||
    categoryId ||
    accountId ||
    status !== 'ALL' ||
    paymentState !== 'ALL' ||
    from ||
    to,
  );
  const dateValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const range = (kind: 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'LAST_MONTH') => {
    const today = new Date();
    let start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let end = start;
    if (kind === 'LAST_7_DAYS') {
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    } else if (kind === 'THIS_MONTH') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (kind === 'LAST_MONTH') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    }
    onQuickRangeChange(dateValue(start), dateValue(end));
  };
  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm" aria-label="Expense filters">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Quick dates</span>
        <Button type="button" size="sm" variant="outline" onClick={() => range('TODAY')}>
          Today
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => range('LAST_7_DAYS')}>
          7 days
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => range('THIS_MONTH')}>
          This month
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => range('LAST_MONTH')}>
          Last month
        </Button>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,12rem))]"
        onSubmit={onApply}
      >
        <label className="grid gap-1 text-sm font-medium sm:col-span-2 xl:col-span-1">
          Search
          <span className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-8"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Expense, payee, reference, or category"
            />
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Category
          <NativeSelect
            value={categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Account used
          <NativeSelect value={accountId} onChange={(event) => onAccountChange(event.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Payment state
          <NativeSelect
            value={paymentState}
            onChange={(event) => onPaymentStateChange(event.target.value)}
          >
            <option value="ALL">All payment states</option>
            <option value="OUTSTANDING">Outstanding</option>
            <option value="PAID">Paid</option>
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Lifecycle
          <NativeSelect value={status} onChange={(event) => onStatusChange(event.target.value)}>
            <option value="ALL">All records</option>
            <option value="RECORDED">Recorded</option>
            <option value="CANCELLED">Cancelled</option>
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          From
          <Input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          To
          <Input type="date" value={to} onChange={(event) => onToChange(event.target.value)} />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-3">
          <Button type="submit" disabled={loading}>
            Apply
          </Button>
          {hasFilters ? (
            <Button type="button" variant="outline" disabled={loading} onClick={onReset}>
              <X aria-hidden="true" /> Reset
            </Button>
          ) : null}
        </div>
      </form>
      <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {pagination.totalItems} expenses · Page {pagination.page} of{' '}
          {Math.max(1, pagination.totalPages)}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            <ChevronLeft /> Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              loading || pagination.totalPages === 0 || pagination.page >= pagination.totalPages
            }
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
