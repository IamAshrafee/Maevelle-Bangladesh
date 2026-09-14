'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  Loader2,
  Search,
  Save,
  TriangleAlert,
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

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

const EMPTY_PAGINATION: PaginationDto = { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 };

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
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to load option mappings.', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [mappingStatus, page, search, sizeSystemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyMappings = useMemo(
    () => Object.entries(draftMappings).filter(([optionValueId, definitionId]) => {
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
      setFeedback({ message: `Mapping updated for ${item.productTitle} / ${item.optionValueLabel}.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to update mapping.', tone: 'danger' });
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
      setFeedback({ message: `${dirtyMappings.length} option mapping${dirtyMappings.length === 1 ? '' : 's'} updated.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Bulk mapping update failed.', tone: 'danger' });
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
        (definition) => definition.label.trim().toLowerCase() === normalized || definition.code.trim().toLowerCase() === normalized,
      );
      if (match) {
        next[item.optionValueId] = match.id;
        matched += 1;
      }
    }

    setDraftMappings(next);
    setFeedback({
      message: matched > 0 ? `${matched} exact label/code match${matched === 1 ? '' : 'es'} prepared. Review and save changes.` : 'No new exact matches were found on this page.',
      tone: matched > 0 ? 'success' : 'warning',
    });
  }

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Product Option Mapping"
        description="Map product-level size option values to canonical size definitions so catalog variants, sizing systems, analytics, and future fit workflows speak the same language."
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {feedback ? <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback> : null}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <form onSubmit={submitSearch} className="flex min-w-64 flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search product, axis, or size value…" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </div>
              <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Search</button>
            </form>

            <select value={mappingStatus} onChange={(event) => { setPage(1); setMappingStatus(event.target.value as SizingMappingStatusDto); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
              <option value="ALL">All mappings</option><option value="MAPPED">Mapped</option><option value="UNMAPPED">Unmapped</option>
            </select>
            <select value={sizeSystemId} onChange={(event) => { setPage(1); setSizeSystemId(event.target.value); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
              <option value="ALL">All configured systems</option>{systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <GitCompareArrows className="h-3.5 w-3.5" />
              Definitions are restricted to the product’s configured size system when one exists.
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={autoMatchCurrentPage} disabled={loading} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Auto-match exact labels</button>
              <button type="button" onClick={() => void saveBulk()} disabled={bulkBusy || dirtyMappings.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save {dirtyMappings.length || ''} change{dirtyMappings.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-3 p-5"><div className="h-14 rounded bg-slate-100" /><div className="h-14 rounded bg-slate-100" /></div>
          ) : items.length === 0 ? (
            <OperationalEmptyState title="No matching size options" description="No active catalog size values match the current filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                <thead className="bg-slate-50 font-semibold text-slate-600">
                  <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Axis / value</th><th className="px-4 py-3">Configured system</th><th className="px-4 py-3">Canonical definition</th><th className="px-4 py-3">Health</th><th className="px-4 py-3 text-right">Quick save</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const candidates = availableDefinitions(item);
                    const selected = draftMappings[item.optionValueId] ?? item.sizeDefinitionId ?? '';
                    const busy = busyId === item.optionValueId;
                    const mismatch = Boolean(item.configuredSizeSystemId && item.sizeDefinitionSystemId && item.configuredSizeSystemId !== item.sizeDefinitionSystemId);
                    const system = systems.find((candidate) => candidate.id === item.configuredSizeSystemId);
                    return (
                      <tr key={item.optionValueId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3"><Link href={`/products/${item.productId}`} className="font-medium text-slate-900 hover:underline">{item.productTitle}</Link></td>
                        <td className="px-4 py-3"><div className="text-slate-500">{item.optionAxisName}</div><strong className="text-slate-900">{item.optionValueLabel}</strong></td>
                        <td className="px-4 py-3 text-slate-600">{system?.name ?? (item.configuredSizeSystemId ? 'Unknown system' : 'Not configured')}</td>
                        <td className="px-4 py-3">
                          <select
                            value={selected}
                            disabled={busy}
                            onChange={(event) => setDraftMappings((current) => ({ ...current, [item.optionValueId]: event.target.value }))}
                            className="min-w-56 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          >
                            <option value="">Unlinked</option>
                            {item.sizeDefinitionId && !candidates.some((definition) => definition.id === item.sizeDefinitionId) ? <option value={item.sizeDefinitionId}>{item.sizeDefinitionLabel ?? 'Current definition'} — outside configured system</option> : null}
                            {candidates.map((definition) => <option key={definition.id} value={definition.id}>{definition.label} ({definition.code})</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {mismatch ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700"><TriangleAlert className="h-3 w-3" /> Mismatch</span> : item.sizeDefinitionId ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"><Check className="h-3 w-3" /> Mapped</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">Unmapped</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" disabled={busy || selected === (item.sizeDefinitionId ?? '')} onClick={() => void saveOne(item, selected)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-30">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)} · {pagination.totalItems} option values</span>
            <div className="flex gap-2">
              <button type="button" disabled={pagination.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
              <button type="button" disabled={pagination.totalPages === 0 || pagination.page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
