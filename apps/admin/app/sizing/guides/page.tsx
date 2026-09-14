'use client';

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type {
  PaginationDto,
  SizeGuideSummaryDto,
  SizeSystemDto,
  SizingDomainDto,
} from '@maevelle/contracts';

import {
  archiveSizeGuide,
  createSizeGuide,
  fetchSizeGuides,
  fetchSizingWorkspace,
  restoreSizeGuide,
} from '@/lib/sizing/api';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';
import { StatusBadge } from '../../../components/status-badge';

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

const EMPTY_PAGINATION: PaginationDto = { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 };

export default function SizeGuidesListPage() {
  const router = useRouter();
  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [domains, setDomains] = useState<readonly SizingDomainDto[]>([]);
  const [systems, setSystems] = useState<readonly SizeSystemDto[]>([]);
  const [pagination, setPagination] = useState<PaginationDto>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [domainId, setDomainId] = useState('ALL');
  const [page, setPage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDomainId, setCreateDomainId] = useState('');
  const [createSystemId, setCreateSystemId] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guideData, workspace] = await Promise.all([
        fetchSizeGuides({
          page,
          pageSize: 25,
          status,
          ...(domainId !== 'ALL' ? { domainId } : {}),
          ...(search ? { search } : {}),
        }),
        fetchSizingWorkspace(),
      ]);
      setGuides(guideData.items);
      setPagination(guideData.pagination);
      setDomains(workspace.domains);
      setSystems(workspace.systems);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to load size guides.', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [domainId, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDomains = useMemo(() => domains.filter((domain) => domain.status === 'ACTIVE'), [domains]);
  const createSystems = useMemo(
    () => systems.filter((system) => system.status === 'ACTIVE' && system.sizingDomainId === createDomainId),
    [createDomainId, systems],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function openCreate() {
    const firstDomain = activeDomains[0]?.id ?? '';
    setCreateName('');
    setCreateDescription('');
    setCreateDomainId(firstDomain);
    setCreateSystemId('');
    setCreateError('');
    setShowCreateModal(true);
  }

  async function handleCreateGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createName.trim() || !createDomainId) {
      setCreateError('Guide name and sizing domain are required.');
      return;
    }

    setCreateBusy(true);
    setCreateError('');
    try {
      const description = createDescription.trim();
      const created = await createSizeGuide({
        name: createName.trim(),
        sizingDomainId: createDomainId,
        ...(description ? { description } : {}),
        ...(createSystemId ? { sizeSystemId: createSystemId } : {}),
      });
      setShowCreateModal(false);
      router.push(`/sizing/guides/${created.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create size guide.');
    } finally {
      setCreateBusy(false);
    }
  }

  async function toggleGuide(guide: SizeGuideSummaryDto) {
    const restoring = guide.status === 'ARCHIVED';
    if (!restoring && !window.confirm(`Archive “${guide.name}”? Product and category dependencies must be removed first.`)) return;

    setBusyId(guide.id);
    setFeedback(null);
    try {
      if (restoring) await restoreSizeGuide(guide.id);
      else await archiveSizeGuide(guide.id);
      setFeedback({ message: `Size guide ${restoring ? 'restored' : 'archived'}.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : `Failed to ${restoring ? 'restore' : 'archive'} size guide.`, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Size Guides"
        description="Create revisioned measurement guides, bind them to canonical size systems, publish immutable customer-facing versions, and manage lifecycle dependencies."
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {feedback ? <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback> : null}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <form onSubmit={submitSearch} className="flex min-w-64 flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search guides by name…" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </div>
              <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Search</button>
            </form>

            <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as typeof status); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
              <option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="ALL">All statuses</option>
            </select>
            <select value={domainId} onChange={(event) => { setPage(1); setDomainId(event.target.value); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
              <option value="ALL">All domains</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
            </select>
            <button type="button" onClick={openCreate} disabled={activeDomains.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Create guide</button>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-3 p-5"><div className="h-16 rounded bg-slate-100" /><div className="h-16 rounded bg-slate-100" /></div>
          ) : guides.length === 0 ? (
            <OperationalEmptyState title="No matching size guides" description="Create a size guide or change the current filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                <thead className="bg-slate-50 font-semibold text-slate-600">
                  <tr><th className="px-4 py-3">Guide</th><th className="px-4 py-3">Domain / system</th><th className="px-4 py-3">Publication</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {guides.map((guide) => {
                    const busy = busyId === guide.id;
                    return (
                      <tr key={guide.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <Link href={`/sizing/guides/${guide.id}`} className="font-semibold text-slate-900 hover:underline">{guide.name}</Link>
                          {guide.description ? <p className="mt-1 max-w-md truncate text-[11px] text-slate-500">{guide.description}</p> : null}
                          <div className="mt-1"><StatusBadge status={guide.status} /></div>
                        </td>
                        <td className="px-4 py-3"><div className="font-medium text-slate-700">{guide.sizingDomainName}</div><div className="mt-0.5 text-[11px] text-slate-500">{guide.sizeSystemName ?? 'Unbound guide'}</div></td>
                        <td className="px-4 py-3">{guide.hasPublishedRevision ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Published</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">Draft only</span>}<div className="mt-1 text-[11px] text-slate-400">Guide v{guide.version}</div></td>
                        <td className="px-4 py-3 text-slate-600"><div>{guide.productCount} product{guide.productCount === 1 ? '' : 's'}</div><div>{guide.categoryCount} categor{guide.categoryCount === 1 ? 'y' : 'ies'}</div></td>
                        <td className="px-4 py-3 text-slate-500">{new Date(guide.updatedAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Link href={`/sizing/guides/${guide.id}`} className="rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Open</Link>
                            {guide.status === 'ACTIVE' ? <button type="button" disabled={busy} onClick={() => void toggleGuide(guide)} className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40" title="Archive"><Archive className="h-3.5 w-3.5" /></button> : <button type="button" disabled={busy} onClick={() => void toggleGuide(guide)} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40" title="Restore"><RotateCcw className="h-3.5 w-3.5" /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)} · {pagination.totalItems} guides</span>
            <div className="flex gap-2">
              <button type="button" disabled={pagination.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
              <button type="button" disabled={pagination.totalPages === 0 || pagination.page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </section>
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><h2 className="text-base font-semibold text-slate-900">Create size guide</h2><p className="text-xs text-slate-500">A first draft revision is created automatically.</p></div><button type="button" onClick={() => setShowCreateModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <form onSubmit={handleCreateGuide} className="mt-4 space-y-4">
              {createError ? <div className="rounded-md bg-red-50 p-3 text-xs text-red-700">{createError}</div> : null}
              <label className="block text-xs font-semibold text-slate-700">Guide name<input value={createName} onChange={(event) => setCreateName(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Women’s Standard Tops" /></label>
              <label className="block text-xs font-semibold text-slate-700">Sizing domain<select value={createDomainId} onChange={(event) => { setCreateDomainId(event.target.value); setCreateSystemId(''); }} required className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="" disabled>Choose domain</option>{activeDomains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select></label>
              <label className="block text-xs font-semibold text-slate-700">Canonical size system <span className="font-normal text-slate-400">(optional)</span><select value={createSystemId} onChange={(event) => setCreateSystemId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">No system binding</option>{createSystems.map((system) => <option key={system.id} value={system.id}>{system.name}{system.regionCode ? ` · ${system.regionCode}` : ''}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-500">Bind a system when rows should map to canonical definitions such as S/M/L or EU numeric sizes.</span></label>
              <label className="block text-xs font-semibold text-slate-700">Description<textarea rows={3} value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Who should use this guide and for what products?" /></label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" disabled={createBusy} onClick={() => setShowCreateModal(false)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">Cancel</button><button type="submit" disabled={createBusy || !createName.trim() || !createDomainId} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{createBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create & open</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
