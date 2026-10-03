'use client';

import { useState } from 'react';
import { Eye, Filter, RefreshCw, Search, X } from 'lucide-react';
import type { SmsActivityFilters, SmsNotificationRowDto, SmsTemplateDto } from './sms-types';
import { formatBangladeshPhone, formatSmsDate, smsEventLabel } from './sms-types';
import { SmsStatusBadge } from './sms-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';

export function SmsActivityTab({
  items,
  totalItems,
  totalPages,
  page,
  pageSize,
  filters,
  templates,
  loading,
  onFiltersChange,
  onPageChange,
  onInspect,
  onRefresh,
}: {
  readonly items: readonly SmsNotificationRowDto[];
  readonly totalItems: number;
  readonly totalPages: number;
  readonly page: number;
  readonly pageSize: number;
  readonly filters: SmsActivityFilters;
  readonly templates: readonly SmsTemplateDto[];
  readonly loading: boolean;
  readonly onFiltersChange: (filters: SmsActivityFilters) => void;
  readonly onPageChange: (page: number) => void;
  readonly onInspect: (id: string) => void;
  readonly onRefresh: () => void;
}) {
  const [search, setSearch] = useState(filters.search);
  const set = (key: keyof SmsActivityFilters, value: string) =>
    onFiltersChange({ ...filters, [key]: value });
  const clear = () => {
    setSearch('');
    onFiltersChange({
      search: '',
      status: '',
      notificationType: '',
      triggerType: '',
      encoding: '',
      provider: '',
      createdFrom: '',
      createdTo: '',
    });
  };
  const activeFilters = Object.values(filters).filter(Boolean).length;
  return (
    <Card>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>SMS Activity & Lifecycle</CardTitle>
            <CardDescription>
              Searchable, server-paginated transactional SMS history. No bulk resend actions are
              available.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw
              aria-hidden="true"
              className={`mr-1.5 size-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
            Refresh
          </Button>
        </div>
        <form
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1.4fr)_repeat(4,minmax(145px,0.6fr))]"
          onSubmit={(event) => {
            event.preventDefault();
            set('search', search.trim());
          }}
        >
          <div className="relative">
            <Label htmlFor="sms-activity-search" className="sr-only">
              Search SMS activity
            </Label>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-2.5 size-4 text-muted-foreground"
            />
            <Input
              id="sms-activity-search"
              name="sms-search"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Order, phone, notification, or provider ID…"
            />
          </div>
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => set('status', value)}
            options={[
              'QUEUED',
              'PROCESSING',
              'ACCEPTED',
              'DELIVERED',
              'DELIVERY_DELAYED',
              'FAILED',
              'REJECTED',
              'UNDELIVERABLE',
              'UNKNOWN_PROVIDER_OUTCOME',
              'SUPPRESSED',
              'SKIPPED_NO_PHONE',
            ]}
          />
          <FilterSelect
            label="Event"
            value={filters.notificationType}
            onChange={(value) => set('notificationType', value)}
            options={templates.map((template) => template.event)}
            labels={Object.fromEntries(
              templates.map((template) => [template.event, smsEventLabel(template.event)]),
            )}
          />
          <FilterSelect
            label="Trigger"
            value={filters.triggerType}
            onChange={(value) => set('triggerType', value)}
            options={['AUTOMATIC', 'MANUAL', 'TEST', 'RESEND']}
          />
          <FilterSelect
            label="Encoding"
            value={filters.encoding}
            onChange={(value) => set('encoding', value)}
            options={['GSM_7', 'UNICODE']}
            labels={{ GSM_7: 'GSM-7', UNICODE: 'Unicode' }}
          />
          <div>
            <Label htmlFor="sms-provider-filter" className="sr-only">
              Provider
            </Label>
            <Input
              id="sms-provider-filter"
              name="sms-provider-filter"
              autoComplete="off"
              value={filters.provider}
              onChange={(event) => set('provider', event.target.value)}
              placeholder="Provider…"
            />
          </div>
          <div>
            <Label htmlFor="sms-created-from" className="sr-only">
              Created from
            </Label>
            <Input
              id="sms-created-from"
              name="sms-created-from"
              type="date"
              value={filters.createdFrom}
              onChange={(event) => set('createdFrom', event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sms-created-to" className="sr-only">
              Created to
            </Label>
            <Input
              id="sms-created-to"
              name="sms-created-to"
              type="date"
              value={filters.createdTo}
              onChange={(event) => set('createdTo', event.target.value)}
            />
          </div>
          <div className="flex gap-2 lg:col-span-2">
            <Button type="submit" className="flex-1">
              Apply Search
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clear}
              disabled={!activeFilters && !search}
            >
              <X aria-hidden="true" className="mr-1 size-3.5" />
              Clear
            </Button>
          </div>
        </form>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Filter aria-hidden="true" className="size-3.5" />
          {activeFilters ? `${activeFilters} active filters` : 'All transactional SMS'} ·{' '}
          {totalItems} results
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        ) : items.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Event & Context</th>
                    <th className="px-4 py-3 font-medium">Recipient</th>
                    <th className="px-4 py-3 font-medium">Message</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <SmsStatusBadge status={item.status} compact />
                      </td>
                      <td className="max-w-56 px-4 py-3">
                        <p className="truncate font-medium">
                          {smsEventLabel(item.notification_type)}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {item.order_number ?? item.source_id} · {item.customer_name ?? 'Customer'}{' '}
                          · {item.trigger_type}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {formatBangladeshPhone(item.effective_recipient)}
                        </p>
                        {item.trigger_type === 'TEST' &&
                        item.intended_recipient !== item.effective_recipient ? (
                          <p className="text-[10px] text-amber-700">
                            Intended {formatBangladeshPhone(item.intended_recipient)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <p>{item.encoding === 'GSM_7' ? 'GSM-7' : 'Unicode'}</p>
                        <p className="text-muted-foreground tabular-nums">
                          {item.character_count} chars · {item.estimated_segments} seg
                        </p>
                      </td>
                      <td className="max-w-36 px-4 py-3">
                        <p className="truncate">{item.provider ?? 'Not assigned'}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {item.provider_message_id ?? '—'}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatSmsDate(item.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Inspect ${smsEventLabel(item.notification_type)} SMS`}
                          onClick={() => onInspect(item.id)}
                        >
                          <Eye aria-hidden="true" className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onInspect(item.id)}
                  className="w-full space-y-2 p-4 text-left hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{smsEventLabel(item.notification_type)}</p>
                    <SmsStatusBadge status={item.status} compact />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.order_number ?? item.source_id} · {item.trigger_type} ·{' '}
                    {formatSmsDate(item.created_at)}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">
                      {formatBangladeshPhone(item.effective_recipient)}
                    </Badge>
                    <Badge variant="outline">
                      {item.encoding === 'GSM_7' ? 'GSM-7' : 'Unicode'} · {item.estimated_segments}{' '}
                      seg
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="p-12 text-center">
            <p className="font-medium">No SMS Matches These Filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear filters or wait for transactional SMS activity.
            </p>
            <Button className="mt-4" variant="outline" onClick={clear}>
              Clear Filters
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {Math.max(1, totalPages)} · {pageSize} per page
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly labels?: Readonly<Record<string, string>>;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="sr-only" htmlFor={`sms-filter-${label}`}>
        {label}
      </Label>
      <NativeSelect
        id={`sms-filter-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value="">All {label}</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {labels?.[option] ?? option.replaceAll('_', ' ')}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
