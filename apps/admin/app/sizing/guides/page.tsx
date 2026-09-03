'use client';

import { Plus, Ruler, Search, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { OperationalPageHeader, OperationalEmptyState } from '../../../components/operational-worklist';
import { StatusBadge } from '../../../components/status-badge';

import {
  createSizeGuide,
  fetchSizeGuides,
  fetchSizingWorkspace,
} from '@/lib/sizing/api';
import type { SizeGuideSummaryDto, SizingDomainDto } from '@maevelle/contracts';

export default function SizeGuidesListPage() {
  const router = useRouter();
  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [domains, setDomains] = useState<readonly SizingDomainDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Guide Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDomainId, setCreateDomainId] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guidesData, workspaceData] = await Promise.all([
        fetchSizeGuides(),
        fetchSizingWorkspace(),
      ]);
      setGuides(guidesData);
      setDomains(workspaceData.domains ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load guides');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredGuides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.sizingDomainName.toLowerCase().includes(q) ||
        g.status.toLowerCase().includes(q),
    );
  }, [guides, searchQuery]);

  const handleCreateGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createDomainId) {
      setCreateError('Guide name and sizing domain are required.');
      return;
    }
    setCreateBusy(true);
    setCreateError('');
    try {
      const created = await createSizeGuide({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        sizingDomainId: createDomainId,
      });
      setShowCreateModal(false);
      setCreateName('');
      setCreateDescription('');
      setCreateDomainId('');
      router.push(`/sizing/guides/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create size guide.');
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader 
        eyebrow="Sizing" 
        title="Size Guides" 
        description="Manage dimension, measurement, and fit mappings for products." 
      />
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guides by name or domain..."
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={() => {
            setShowCreateModal(true);
            setCreateError('');
            if (domains.length > 0 && !createDomainId) {
              setCreateDomainId(domains[0]!.id);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Create Guide
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-16 rounded-md bg-slate-100" />
              <div className="h-16 rounded-md bg-slate-100" />
            </div>
          </div>
        ) : error ? (
          <OperationalEmptyState title="Could not load guides" description={error} />
        ) : filteredGuides.length === 0 ? (
          <OperationalEmptyState
            title={searchQuery ? 'No matching size guides' : 'No size guides found'}
            description={
              searchQuery
                ? `No size guides matched your search for "${searchQuery}".`
                : 'Create a size guide to provide measurement and fit information for your products.'
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredGuides.map((guide) => (
              <Link
                key={guide.id}
                href={`/sizing/guides/${guide.id}`}
                className="flex items-center justify-between p-6 transition-colors hover:bg-slate-50"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{guide.name}</h3>
                    <StatusBadge status={guide.status} />
                    {guide.hasPublishedRevision ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        Draft only
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{guide.sizingDomainName}</span>
                    <span>Version {guide.version}</span>
                    <span>{guide.productCount} product{guide.productCount === 1 ? '' : 's'} linked</span>
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-500 hover:text-slate-900">
                  Open Editor &rarr;
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Guide Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">New Size Guide</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGuide} className="mt-4 space-y-4">
              {createError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Guide Name *
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Men’s Standard Tops"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Sizing Domain *
                </label>
                <select
                  required
                  value={createDomainId}
                  onChange={(e) => setCreateDomainId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                >
                  <option value="" disabled>Select a domain</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                {domains.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    No sizing domains found. Create a domain first in Domains & Systems.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Brief description or sizing notes..."
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={createBusy}
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBusy || !createName.trim() || !createDomainId}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {createBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create &amp; Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
