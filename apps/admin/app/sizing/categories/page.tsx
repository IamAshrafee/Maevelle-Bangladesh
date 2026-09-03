'use client';

import { Check, FolderTree, Loader2, Ruler, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchCategorySizeGuideDefaults,
  fetchSizeGuides,
  setCategoryDefaultSizeGuide,
} from '@/lib/sizing/api';
import type {
  CategorySizeGuideDefaultDto,
  SizeGuideSummaryDto,
} from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';

export default function SizingCategoryDefaultsPage() {
  const [categories, setCategories] = useState<readonly CategorySizeGuideDefaultDto[]>([]);
  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'danger' } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catData, guidesData] = await Promise.all([
        fetchCategorySizeGuideDefaults(),
        fetchSizeGuides(),
      ]);

      setCategories(catData);
      setGuides(guidesData);
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to load category defaults.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpdateCategoryGuide = async (categoryId: string, newGuideId: string) => {
    setSavingId(categoryId);
    setFeedback(null);
    try {
      await setCategoryDefaultSizeGuide(categoryId, newGuideId || null);
      await load();
      setFeedback({
        message: 'Category default size guide updated successfully.',
        tone: 'success',
      });
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Could not update category size guide.',
        tone: 'danger',
      });
    } finally {
      setSavingId(null);
    }
  };

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.categoryName.toLowerCase().includes(q) ||
        c.categoryPath.toLowerCase().includes(q) ||
        (c.sizeGuideName && c.sizeGuideName.toLowerCase().includes(q)),
    );
  }, [categories, searchQuery]);

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Category Defaults"
        description="Assign default size guides to categories. Products in these categories automatically inherit this guide unless explicitly overridden."
      />

      {feedback && (
        <div className="px-6 pt-4">
          <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div className="text-xs text-slate-500">
          Showing {filteredCategories.length} categor{filteredCategories.length === 1 ? 'y' : 'ies'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-14 rounded-lg bg-slate-100" />
            <div className="h-14 rounded-lg bg-slate-100" />
            <div className="h-14 rounded-lg bg-slate-100" />
          </div>
        ) : filteredCategories.length === 0 ? (
          <OperationalEmptyState
            title="No categories found"
            description={
              searchQuery
                ? `No categories match "${searchQuery}".`
                : 'Create categories in Product Organization before setting size guide defaults.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Taxonomy Path</th>
                  <th className="px-4 py-3">Default Size Guide</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map((cat) => {
                  const isSaving = savingId === cat.categoryId;
                  return (
                    <tr key={cat.categoryId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <FolderTree className="h-3.5 w-3.5 text-slate-400" />
                          <span>{cat.categoryName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {cat.categoryPath || `/${cat.categoryName.toLowerCase()}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            disabled={isSaving}
                            value={cat.sizeGuideId ?? ''}
                            onChange={(e) =>
                              void handleUpdateCategoryGuide(cat.categoryId, e.target.value)
                            }
                            className="w-64 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-2xs outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                          >
                            <option value="">None (No default guide)</option>
                            {guides.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name} {g.hasPublishedRevision ? '✓' : '(draft)'}
                              </option>
                            ))}
                          </select>
                          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                          {cat.sizeGuideId && !isSaving && (
                            <Link
                              href={`/sizing/guides/${cat.sizeGuideId}`}
                              className="text-[11px] font-medium text-blue-600 hover:underline"
                            >
                              View Guide &rarr;
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cat.sizeGuideId ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            <Check className="h-3 w-3" /> Configured
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
