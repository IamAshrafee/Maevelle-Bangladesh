'use client';

import {
  AlertCircle,
  ArrowRight,
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
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  AdminPage,
  EmptyState,
  LoadingState,
  PageActions,
  PageDescription,
  PageHeader,
  PagePanel,
  PageSection,
  PageTitle,
} from '@/components/ui/page-shell';

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

export default function SizeOptionMappingsPage() {
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
      setDefinitions(workspace.sizeDefinitions.filter((definition) => definition.status === 'ACTIVE'));
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
      return definitions.filter((definition) => definition.sizeSystemId === item.configuredSizeSystemId);
    }
    return definitions;
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

  return (
    <AdminPage className="space-y-6">
      <PageHeader>
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase text-primary">Sizing &amp; Fit Operations</p>
          <PageTitle>Product Option Mapping Console</PageTitle>
          <PageDescription>
            Bridge catalog variant option values to canonical size definitions. Ensures analytics, size guides,
            inventory forecasting, and customer fit recommenders operate on unified sizing standards.
          </PageDescription>
        </div>
        <PageActions className="flex flex-wrap items-center gap-2">
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
            {bulkBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save {dirtyMappings.length > 0 ? `(${dirtyMappings.length})` : ''} Changes
          </Button>
        </PageActions>
      </PageHeader>

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

      {/* Filter and Configuration Strip */}
      <PagePanel className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search product title, option axis, or size value..."
                className="pl-9 h-10 sm:h-9"
              />
            </div>
            <Button type="submit" variant="secondary" size="default" className="min-h-10 sm:min-h-9">
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
          <GitCompareArrows className="size-3.5 text-primary shrink-0" />
          <span>
            Candidate definitions are automatically restricted to the product&apos;s configured size system when assigned.
          </span>
        </div>
      </PagePanel>

      {/* Main Content Area */}
      <PageSection>
        {loading ? (
          <LoadingState message="Loading catalog size option mappings..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No Matching Option Values Found"
            description="No active catalog product size option values match your current search filters."
          />
        ) : (
          <div className="space-y-4">
            {/* Desktop / Tablet View (Table) */}
            <div className="hidden rounded-xl border border-border bg-card shadow-2xs md:block overflow-hidden">
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
                    {items.map((item) => {
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

                      return (
                        <tr
                          key={item.optionValueId}
                          className={`transition-colors hover:bg-muted/40 ${isDirty ? 'bg-primary/5' : ''}`}
                        >
                          <td className="px-4 py-3 max-w-xs">
                            <Link
                              href={`/products/${item.productId}`}
                              className="font-medium text-foreground hover:text-primary hover:underline line-clamp-1"
                            >
                              {item.productTitle}
                            </Link>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-muted-foreground mr-1.5">{item.optionAxisName}:</span>
                            <span className="font-semibold text-foreground bg-muted/60 px-1.5 py-0.5 rounded text-xs">
                              {item.optionValueLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {system ? (
                              <span className="font-medium text-foreground">{system.name}</span>
                            ) : item.configuredSizeSystemId ? (
                              <span className="italic">Unknown system</span>
                            ) : (
                              <span className="text-muted-foreground/60 italic">Not configured</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <NativeSelect
                              value={selected}
                              disabled={busy}
                              onChange={(event) =>
                                setDraftMappings((current) => ({
                                  ...current,
                                  [item.optionValueId]: event.target.value,
                                }))
                              }
                              className="w-64"
                            >
                              <NativeSelectOption value="">Unlinked (No Standard)</NativeSelectOption>
                              {item.sizeDefinitionId &&
                              !candidates.some((definition) => definition.id === item.sizeDefinitionId) ? (
                                <NativeSelectOption value={item.sizeDefinitionId}>
                                  {item.sizeDefinitionLabel ?? 'Current definition'} (Outside configured system)
                                </NativeSelectOption>
                              ) : null}
                              {candidates.map((definition) => (
                                <NativeSelectOption key={definition.id} value={definition.id}>
                                  {definition.label} ({definition.code})
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {mismatch ? (
                              <StatusBadge status="ATTENTION" tone="danger" />
                            ) : item.sizeDefinitionId ? (
                              <StatusBadge status="MATCHED" tone="success" />
                            ) : (
                              <StatusBadge status="UNMATCHED" tone="warning" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <Button
                              type="button"
                              variant={isDirty ? 'default' : 'outline'}
                              size="xs"
                              disabled={busy || !isDirty}
                              onClick={() => void saveOne(item, selected)}
                              className="h-7 min-w-16"
                            >
                              {busy ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                'Save'
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile / Touch View (Card Stack) */}
            <div className="space-y-3 md:hidden">
              {items.map((item) => {
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

                return (
                  <div
                    key={item.optionValueId}
                    className={`rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3 transition-colors ${
                      isDirty ? 'border-primary/50 bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${item.productId}`}
                          className="font-semibold text-sm text-foreground hover:text-primary line-clamp-1"
                        >
                          {item.productTitle}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{item.optionAxisName}:</span>
                          <span className="font-semibold text-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                            {item.optionValueLabel}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {mismatch ? (
                          <StatusBadge status="ATTENTION" tone="danger" />
                        ) : item.sizeDefinitionId ? (
                          <StatusBadge status="MATCHED" tone="success" />
                        ) : (
                          <StatusBadge status="UNMATCHED" tone="warning" />
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Configured System: </span>
                      {system?.name ?? (item.configuredSizeSystemId ? 'Unknown' : 'Not configured')}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground block">
                        Canonical Definition:
                      </label>
                      <NativeSelect
                        value={selected}
                        disabled={busy}
                        onChange={(event) =>
                          setDraftMappings((current) => ({
                            ...current,
                            [item.optionValueId]: event.target.value,
                          }))
                        }
                        className="w-full h-11"
                      >
                        <NativeSelectOption value="">Unlinked (No Standard)</NativeSelectOption>
                        {item.sizeDefinitionId &&
                        !candidates.some((definition) => definition.id === item.sizeDefinitionId) ? (
                          <NativeSelectOption value={item.sizeDefinitionId}>
                            {item.sizeDefinitionLabel ?? 'Current definition'} (Outside system)
                          </NativeSelectOption>
                        ) : null}
                        {candidates.map((definition) => (
                          <NativeSelectOption key={definition.id} value={definition.id}>
                            {definition.label} ({definition.code})
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
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
                        {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                        {isDirty ? 'Save Staged Mapping' : 'Saved'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span>
                Page <span className="font-mono font-medium text-foreground">{pagination.page}</span> of{' '}
                <span className="font-mono font-medium text-foreground">{Math.max(pagination.totalPages, 1)}</span> ·{' '}
                <span className="font-mono font-medium text-foreground">{pagination.totalItems}</span> catalog option values
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
                  disabled={pagination.totalPages === 0 || pagination.page >= pagination.totalPages || loading}
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
