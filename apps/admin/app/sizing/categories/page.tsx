'use client';

import { Check, ChevronLeft, ChevronRight, FolderTree, Loader2, Search, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type {
  CategorySizeGuideDefaultDto,
  PaginationDto,
  SizeGuideSummaryDto,
  SizingMappingStatusDto,
} from '@maevelle/contracts';

import {
  fetchCategorySizeGuideDefaults,
  fetchSizeGuides,
  setCategoryDefaultSizeGuide,
} from '@/lib/sizing/api';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

const EMPTY_PAGINATION: PaginationDto = { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 };

export default function SizingCategoryDefaultsPage() {
  const [categories, setCategories] = useState<readonly CategorySizeGuideDefaultDto[]>([]);
  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [pagination, setPagination] = useState<PaginationDto>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [mappingStatus, setMappingStatus] = useState<SizingMappingStatusDto>('ALL');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryData, guideData] = await Promise.all([
        fetchCategorySizeGuideDefaults({ page, pageSize: 25, search, mappingStatus }),
        fetchSizeGuides({ page: 1, pageSize: 100, status: 'ACTIVE' }),
      ]);
      setCategories(categoryData.items);
      setPagination(categoryData.pagination);
      setGuides(guideData.items);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to load category defaults.', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [mappingStatus, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignableGuides = useMemo(
    () => guides.filter((guide) => guide.status === 'ACTIVE' && guide.hasPublishedRevision),
    [guides],
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function updateCategoryGuide(category: CategorySizeGuideDefaultDto, newGuideId: string) {
    setSavingId(category.categoryId);
    setFeedback(null);
    try {
      await setCategoryDefaultSizeGuide(category.categoryId, newGuideId || null);
      setFeedback({ message: `Default guide updated for ${category.categoryName}.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Could not update category default.', tone: 'danger' });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Category Defaults"
        description="Assign a published default guide to a category so products can inherit sizing guidance when no product-specific guide is configured."
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {feedback ? <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback> : null}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <form onSubmit={submitSearch} className="flex min-w-64 flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search category, path, or guide…" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </div>
              <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Search</button>
            </form>
            <select value={mappingStatus} onChange={(event) => { setPage(1); setMappingStatus(event.target.value as SizingMappingStatusDto); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
              <option value="ALL">All categories</option>
              <option value="MAPPED">Configured</option>
              <option value="UNMAPPED">Unassigned</option>
            </select>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
            Only active guides with a published revision are offered for new assignments. Existing unavailable defaults remain visible so they can be corrected.
          </div>

          {loading ? (
            <div className="animate-pulse space-y-3 p-5"><div className="h-14 rounded bg-slate-100" /><div className="h-14 rounded bg-slate-100" /><div className="h-14 rounded bg-slate-100" /></div>
          ) : categories.length === 0 ? (
            <OperationalEmptyState title="No matching categories" description="Try another filter or create categories in Product Organization first." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                <thead className="bg-slate-50 font-semibold text-slate-600">
                  <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Taxonomy path</th><th className="px-4 py-3">Default guide</th><th className="px-4 py-3">Health</th><th className="px-4 py-3 text-right">Guide</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((category) => {
                    const saving = savingId === category.categoryId;
                    const usable = category.sizeGuideId && category.sizeGuideStatus === 'ACTIVE' && category.hasPublishedGuide;
                    const currentGuideIsAssignable = category.sizeGuideId ? assignableGuides.some((guide) => guide.id === category.sizeGuideId) : false;

                    return (
                      <tr key={category.categoryId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><FolderTree className="h-3.5 w-3.5 text-slate-400" /><strong className="text-slate-900">{category.categoryName}</strong></div></td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{category.categoryPath}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              disabled={saving}
                              value={category.sizeGuideId ?? ''}
                              onChange={(event) => void updateCategoryGuide(category, event.target.value)}
                              className="min-w-64 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                            >
                              <option value="">None — no category default</option>
                              {category.sizeGuideId && !currentGuideIsAssignable ? <option value={category.sizeGuideId}>{category.sizeGuideName ?? 'Current unavailable guide'} — unavailable</option> : null}
                              {assignableGuides.map((guide) => <option key={guide.id} value={guide.id}>{guide.name} · {guide.sizingDomainName}</option>)}
                            </select>
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {!category.sizeGuideId ? (
                            <span className="text-slate-400">Unassigned</span>
                          ) : usable ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"><Check className="h-3 w-3" /> Ready</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"><TriangleAlert className="h-3 w-3" /> Needs attention</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {category.sizeGuideId ? <Link href={`/sizing/guides/${category.sizeGuideId}`} className="font-medium text-blue-700 hover:underline">Open</Link> : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)} · {pagination.totalItems} categories</span>
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
