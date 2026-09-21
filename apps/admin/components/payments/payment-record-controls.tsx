'use client';

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

import type { PaginationDto, PaymentMethodDto } from '@maevelle/contracts';

type RecordKind = 'payments' | 'refunds';

interface PaymentRecordControlsProps {
  readonly kind: RecordKind;
  readonly methods: readonly PaymentMethodDto[];
  readonly query: string;
  readonly method: string;
  readonly refundStatus: string;
  readonly posting: string;
  readonly from: string;
  readonly to: string;
  readonly pagination: PaginationDto;
  readonly loading: boolean;
  readonly onQueryChange: (value: string) => void;
  readonly onMethodChange: (value: string) => void;
  readonly onRefundStatusChange: (value: string) => void;
  readonly onPostingChange: (value: string) => void;
  readonly onFromChange: (value: string) => void;
  readonly onToChange: (value: string) => void;
  readonly onApply: (event: FormEvent<HTMLFormElement>) => void;
  readonly onReset: () => void;
  readonly onPageChange: (page: number) => void;
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PaymentRecordControls({
  kind,
  methods,
  query,
  method,
  refundStatus,
  posting,
  from,
  to,
  pagination,
  loading,
  onQueryChange,
  onMethodChange,
  onRefundStatusChange,
  onPostingChange,
  onFromChange,
  onToChange,
  onApply,
  onReset,
  onPageChange,
}: PaymentRecordControlsProps) {
  const hasFilters = Boolean(
    query.trim() || method !== 'ALL' || refundStatus !== 'ALL' || posting !== 'ALL' || from || to,
  );
  const presets = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: 'This month', days: 'month' },
    { label: '90 days', days: 90 },
  ] as const;

  function presetDates(days: (typeof presets)[number]['days']) {
    const end = new Date();
    const start = new Date(end);
    if (days === 'month') start.setDate(1);
    else start.setDate(start.getDate() - days + 1);
    return { from: localDateValue(start), to: localDateValue(end) };
  }

  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm" aria-label={`${kind} filters`}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b pb-3">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Quick dates</span>
        {presets.map((preset) => {
          const dates = presetDates(preset.days);
          const selected = from === dates.from && to === dates.to;
          return (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              disabled={loading}
              onClick={() => {
                onFromChange(dates.from);
                onToChange(dates.to);
              }}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,12rem))_auto] xl:items-end"
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
              placeholder={
                kind === 'payments'
                  ? 'Payment, order, method, or reference'
                  : 'Refund, payment, order, or reason'
              }
            />
          </span>
        </label>

        {kind === 'payments' ? (
          <label className="grid gap-1 text-sm font-medium">
            Method
            <NativeSelect value={method} onChange={(event) => onMethodChange(event.target.value)}>
              <NativeSelectOption value="ALL">All methods</NativeSelectOption>
              {methods.map((item) => (
                <NativeSelectOption key={item.id} value={item.code}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <label className="grid gap-1 text-sm font-medium">
            Status
            <NativeSelect
              value={refundStatus}
              onChange={(event) => onRefundStatusChange(event.target.value)}
            >
              <NativeSelectOption value="ALL">All statuses</NativeSelectOption>
              <NativeSelectOption value="REQUESTED">Requested</NativeSelectOption>
              <NativeSelectOption value="PROCESSING">Processing</NativeSelectOption>
              <NativeSelectOption value="UNKNOWN_EXTERNAL_OUTCOME">
                Outcome unknown
              </NativeSelectOption>
              <NativeSelectOption value="COMPLETED">Completed</NativeSelectOption>
              <NativeSelectOption value="FAILED">Failed</NativeSelectOption>
              <NativeSelectOption value="CANCELLED_BEFORE_PROCESSING">Cancelled</NativeSelectOption>
            </NativeSelect>
          </label>
        )}

        <label className="grid gap-1 text-sm font-medium">
          Account posting
          <NativeSelect value={posting} onChange={(event) => onPostingChange(event.target.value)}>
            <NativeSelectOption value="ALL">All posting states</NativeSelectOption>
            <NativeSelectOption value="POSTED">Posted</NativeSelectOption>
            <NativeSelectOption value="UNPOSTED">Not posted</NativeSelectOption>
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

        <div className="flex gap-2">
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
          {pagination.totalItems} {kind} · Page {pagination.page} of{' '}
          {Math.max(1, pagination.totalPages)}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            <ChevronLeft aria-hidden="true" /> Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              loading || pagination.totalPages === 0 || pagination.page >= pagination.totalPages
            }
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Next <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
