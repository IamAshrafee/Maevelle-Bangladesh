'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  Loader2,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type {
  PaginationDto,
  SizeDefinitionDto,
  SizeOptionValueMappingDto,
  SizeSystemDto,
  SizingMappingStatusDto,
} from '@maevelle/contracts';

import {
  fetchSizeOptionValues,
  fetchSizingWorkspace,
  linkOptionValueToSizeDefinition,
  linkOptionValuesToSizeDefinitionsBulk,
} from '@/lib/sizing/api';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  AdminPage,
  EmptyState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { CardSkeletonStack, TableSkeletonRows } from '@/components/ui/table-skeleton';
import { cn } from '@/lib/utils';
import { RefreshButton } from '@/components/ui/refresh-button';

type Feedback = {
  message: string;
  tone: 'success' | 'warning' | 'danger';
} | null;

const EMPTY_PAGINATION: PaginationDto = {
  page: 1,
  pageSize: 50,
  totalItems: 0,
  totalPages: 0,
};

function MappingStatusBadge({
  mismatch,
  hasDefinition,
}: {
  readonly mismatch: boolean;
  readonly hasDefinition: boolean;
}) {
  if (mismatch) return <StatusBadge status="ATTENTION" tone="danger" />;
  if (hasDefinition) return <StatusBadge status="MATCHED" tone="success" />;
  return <StatusBadge status="UNMATCHED" tone="warning" />;
}

function DefinitionSelect({
  item,
  candidates,
  selected,
  busy,
  className,
  outsideLabel,
  onChange,
}: {
  readonly item: SizeOptionValueMappingDto;
  readonly candidates: readonly SizeDefinitionDto[];
  readonly selected: string;
  readonly busy: boolean;
  readonly className?: string;
  readonly outsideLabel: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <NativeSelect
      value={selected}
      disabled={busy}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      <NativeSelectOption value="">Unlinked (No Standard)</NativeSelectOption>
      {item.sizeDefinitionId &&
      !candidates.some((definition) => definition.id === item.sizeDefinitionId) ? (
        <NativeSelectOption value={item.sizeDefinitionId}>
          {item.sizeDefinitionLabel ?? 'Current definition'} ({outsideLabel})
        </NativeSelectOption>
      ) : null}
      {candidates.map((definition) => (
        <NativeSelectOption key={definition.id} value={definition.id}>
          {definition.label} ({definition.code})
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export function SizingMappingsConsole() {
  const [items, setItems] = useState<readonly SizeOptionValueMappingDto[]>([]);
  const [definitions, setDefinitions] = useState<readonly SizeDefinitionDto[]>([]);
  const [systems, setSystems] = useState<readonly SizeSystemDto[]>([]);
  const [pagination, setPagination] = useState<PaginationDto>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [mappingStatus, setMappingStatus] = useState<SizingMappingStatusDto>('ALL');
  const [sizeSystemId, setSizeSystemId] = useState('ALL');
  const [page, setPage] = useState(1);
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mappingData, workspace] = await Promise.all([
        fetchSizeOptionValues({
          page,
          pageSize: 50,
          mappingStatus,
          ...(search ? { search } : {}),
          ...(sizeSystemId !== 'ALL' ? { sizeSystemId } : {}),
        }),
        fetchSizingWorkspace(),
      ]);

      setItems(mappingData.items);
      setPagination(mappingData.pagination);
      setDefinitions(
        workspace.sizeDefinitions.filter((definition) => definition.status === 'ACTIVE'),
      );
      setSystems(workspace.systems.filter((system) => system.status === 'ACTIVE'));
      setDraftMappings({});
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Failed to load option mappings.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [mappingStatus, page, search, sizeSystemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyMappings = useMemo(
    () =>
      Object.entries(draftMappings).filter(([optionValueId, definitionId]) => {
        const item = items.find((candidate) => candidate.optionValueId === optionValueId);
        return item && (item.sizeDefinitionId ?? '') !== definitionId;
      }),
    [draftMappings, items],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function availableDefinitions(item: SizeOptionValueMappingDto) {
    if (item.configuredSizeSystemId) {
      return definitions.filter(
        (definition) => definition.sizeSystemId === item.configuredSizeSystemId,
      );
    }
    return definitions;
  }

  function getRowState(item: SizeOptionValueMappingDto) {
    const candidates = availableDefinitions(item);
    const selected = draftMappings[item.optionValueId] ?? item.sizeDefinitionId ?? '';
    const busy = busyId === item.optionValueId;
    const isDirty = selected !== (item.sizeDefinitionId ?? '');
    const mismatch = Boolean(
      item.configuredSizeSystemId &&
      item.sizeDefinitionSystemId &&
      item.configuredSizeSystemId !== item.sizeDefinitionSystemId,
    );
    const system = systems.find((candidate) => candidate.id === item.configuredSizeSystemId);
    return { candidates, selected, busy, isDirty, mismatch, system };
  }

  async function saveOne(item: SizeOptionValueMappingDto, definitionId: string) {
    setBusyId(item.optionValueId);
    setFeedback(null);
    try {
      await linkOptionValueToSizeDefinition(item.optionValueId, definitionId || null);
      setFeedback({
        message: `Mapping updated for ${item.productTitle} (${item.optionValueLabel}).`,
        tone: 'success',
      });
      await load();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Failed to update mapping.',
        tone: 'danger',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function saveBulk() {
    if (dirtyMappings.length === 0) return;
    setBulkBusy(true);
    setFeedback(null);
    try {
      await linkOptionValuesToSizeDefinitionsBulk(
        dirtyMappings.map(([optionValueId, definitionId]) => ({
          optionValueId,
          sizeDefinitionId: definitionId || null,
        })),
      );
      setFeedback({
        message: `${dirtyMappings.length} option mapping${dirtyMappings.length === 1 ? '' : 's'} successfully updated.`,
        tone: 'success',
      });
      await load();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Bulk mapping update failed.',
        tone: 'danger',
      });
    } finally {
      setBulkBusy(false);
    }
  }

  function autoMatchCurrentPage() {
    const next: Record<string, string> = { ...draftMappings };
    let matched = 0;

    for (const item of items) {
      if (item.sizeDefinitionId) continue;
      const normalized = item.optionValueLabel.trim().toLowerCase();
      const match = availableDefinitions(item).find(
        (definition) =>
          definition.label.trim().toLowerCase() === normalized ||
          definition.code.trim().toLowerCase() === normalized,
      );
      if (match) {
        next[item.optionValueId] = match.id;
        matched += 1;
      }
    }

    setDraftMappings(next);
    setFeedback({
      message:
        matched > 0
          ? `${matched} exact label/code match${matched === 1 ? '' : 'es'} staged. Review below and click "Save Changes".`
          : 'No new exact matches found on this page.',
      tone: matched > 0 ? 'success' : 'warning',
    });
  }

  function updateDraft(optionValueId: string, value: string) {
    setDraftMappings((current) => ({
      ...current,
      [optionValueId]: value,
    }));
  }

  return (
    <AdminPage className="space-y-6">
      <PageHeader
        eyebrow="Sizing & Fit Operations"
        title="Product Option Mapping Console"
        description="Bridge catalog variant option values to canonical size definitions. Ensures analytics, size guides, inventory forecasting, and customer fit recommenders operate on unified sizing standards."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton
              loading={loading}
              onRefresh={() => void load()}
              tooltip="Refresh mappings"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={autoMatchCurrentPage}
              disabled={loading || items.length === 0}
              className="min-h-11 sm:min-h-9"
            >
              <Sparkles className="size-3.5 text-primary" />
              Auto-Match Exact Labels
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => void saveBulk()}
              disabled={bulkBusy || dirtyMappings.length === 0}
              className="min-h-11 sm:min-h-9"
            >
              {bulkBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save {dirtyMappings.length > 0 ? `(${dirtyMappings.length})` : ''} Changes
            </Button>
          </div>
        }
      />

      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
            feedback.tone === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : feedback.tone === 'warning'
                ? 'border-warning/30 bg-warning/10 text-warning'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.tone === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setFeedback(null)}
            className="h-6 px-2 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      <PagePanel className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search product title, option axis, or size value..."
                className="h-10 pl-9 sm:h-9"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              size="default"
              className="min-h-10 sm:min-h-9"
            >
              Search
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Status:</span>
              <NativeSelect
                value={mappingStatus}
                onChange={(event) => {
                  setPage(1);
                  setMappingStatus(event.target.value as SizingMappingStatusDto);
                }}
                className="w-36"
              >
                <NativeSelectOption value="ALL">All Mappings</NativeSelectOption>
                <NativeSelectOption value="MAPPED">Mapped Only</NativeSelectOption>
                <NativeSelectOption value="UNMAPPED">Unmapped Only</NativeSelectOption>
              </NativeSelect>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>System:</span>
              <NativeSelect
                value={sizeSystemId}
                onChange={(event) => {
                  setPage(1);
                  setSizeSystemId(event.target.value);
                }}
                className="w-48"
              >
                <NativeSelectOption value="ALL">All Configured Systems</NativeSelectOption>
                {systems.map((system) => (
                  <NativeSelectOption key={system.id} value={system.id}>
                    {system.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <GitCompareArrows className="size-3.5 shrink-0 text-primary" />
          <span>
            Candidate definitions are automatically restricted to the product&apos;s configured size
            system when assigned.
          </span>
        </div>
      </PagePanel>

      <PageSection>
        {loading && items.length === 0 ? (
          <div className="space-y-4" aria-busy="true">
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-2xs md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-left text-xs">
                  <thead className="bg-muted/50 font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Axis &amp; Value</th>
                      <th className="px-4 py-3">Configured System</th>
                      <th className="px-4 py-3">Canonical Definition</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Quick Save</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <TableSkeletonRows
                      columns={6}
                      rows={6}
                      columnWidths={['w-44', 'w-28', 'w-32', 'w-40', 'w-20', 'w-20 ml-auto']}
                    />
                  </tbody>
                </table>
              </div>
            </div>
            <div className="md:hidden">
              <CardSkeletonStack count={4} />
            </div>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No Matching Option Values Found"
            description="No active catalog product size option values match your current search filters."
          />
        ) : (
          <div className="space-y-4">
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-2xs md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-left text-xs">
                  <thead className="bg-muted/50 font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Axis &amp; Value</th>
                      <th className="px-4 py-3">Configured System</th>
                      <th className="px-4 py-3">Canonical Definition</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Quick Save</th>
                    </tr>
                  </thead>
                  <tbody className={cn('divide-y divide-border', loading && 'opacity-60 transition-opacity')}>
                    {items.map((item) => {
                      const { candidates, selected, busy, isDirty, mismatch, system } =
                        getRowState(item);

                      return (
                        <tr
                          key={item.optionValueId}
                          className={`transition-colors hover:bg-muted/40 ${isDirty ? 'bg-primary/5' : ''}`}
                        >
                          <td className="max-w-xs px-4 py-3">
                            <Link
                              href={`/products/${item.productId}`}
                              className="line-clamp-1 font-medium text-foreground hover:text-primary hover:underline"
                            >
                              {item.productTitle}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="mr-1.5 text-muted-foreground">
                              {item.optionAxisName}:
                            </span>
                            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-xs font-semibold text-foreground">
                              {item.optionValueLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {system ? (
                              <span className="font-medium text-foreground">{system.name}</span>
                            ) : item.configuredSizeSystemId ? (
                              <span className="italic">Unknown system</span>
                            ) : (
                              <span className="italic text-muted-foreground/60">
                                Not configured
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <DefinitionSelect
                              item={item}
                              candidates={candidates}
                              selected={selected}
                              busy={busy}
                              className="w-64"
                              outsideLabel="Outside configured system"
                              onChange={(value) => updateDraft(item.optionValueId, value)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <MappingStatusBadge
                              mismatch={mismatch}
                              hasDefinition={Boolean(item.sizeDefinitionId)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant={isDirty ? 'default' : 'outline'}
                              size="xs"
                              disabled={busy || !isDirty}
                              onClick={() => void saveOne(item, selected)}
                              className="h-7 min-w-16"
                            >
                              {busy ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={cn('space-y-3 md:hidden', loading && 'opacity-60 transition-opacity')}>
              {items.map((item) => {
                const { candidates, selected, busy, isDirty, mismatch, system } = getRowState(item);

                return (
                  <div
                    key={item.optionValueId}
                    className={`space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors ${
                      isDirty ? 'border-primary/50 bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${item.productId}`}
                          className="line-clamp-1 text-sm font-semibold text-foreground hover:text-primary"
                        >
                          {item.productTitle}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{item.optionAxisName}:</span>
                          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-semibold text-foreground">
                            {item.optionValueLabel}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <MappingStatusBadge
                          mismatch={mismatch}
                          hasDefinition={Boolean(item.sizeDefinitionId)}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Configured System: </span>
                      {system?.name ?? (item.configuredSizeSystemId ? 'Unknown' : 'Not configured')}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        Canonical Definition:
                      </label>
                      <DefinitionSelect
                        item={item}
                        candidates={candidates}
                        selected={selected}
                        busy={busy}
                        className="h-11 w-full"
                        outsideLabel="Outside system"
                        onChange={(value) => updateDraft(item.optionValueId, value)}
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        variant={isDirty ? 'default' : 'outline'}
                        size="sm"
                        disabled={busy || !isDirty}
                        onClick={() => void saveOne(item, selected)}
                        className="min-h-11 w-full"
                      >
                        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {isDirty ? 'Save Staged Mapping' : 'Saved'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground sm:flex-row">
              <span>
                Page{' '}
                <span className="font-mono font-medium text-foreground">{pagination.page}</span> of{' '}
                <span className="font-mono font-medium text-foreground">
                  {Math.max(pagination.totalPages, 1)}
                </span>{' '}
                ·{' '}
                <span className="font-mono font-medium text-foreground">
                  {pagination.totalItems}
                </span>{' '}
                catalog option values
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="min-h-10 sm:min-h-8"
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    pagination.totalPages === 0 ||
                    pagination.page >= pagination.totalPages ||
                    loading
                  }
                  onClick={() => setPage((value) => value + 1)}
                  className="min-h-10 sm:min-h-8"
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </PageSection>
    </AdminPage>
  );
}
