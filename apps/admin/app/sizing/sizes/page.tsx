'use client';

import { Archive, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { SizeDefinitionDto, SizeSystemDto } from '@maevelle/contracts';

import {
  archiveSizeDefinition,
  createSizeDefinition,
  fetchSizingWorkspace,
  restoreSizeDefinition,
  updateSizeDefinition,
} from '@/lib/sizing/api';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';
import { StatusBadge } from '../../../components/status-badge';

type Workspace = {
  readonly systems: readonly SizeSystemDto[];
  readonly sizeDefinitions: readonly SizeDefinitionDto[];
};

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

type EditingState = {
  id: string;
  label: string;
  sortOrder: string;
} | null;

function slug(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export default function SizesPage() {
  const [workspace, setWorkspace] = useState<Workspace>({ systems: [], sizeDefinitions: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [search, setSearch] = useState('');
  const [systemFilter, setSystemFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [editing, setEditing] = useState<EditingState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSizingWorkspace();
      setWorkspace({ systems: data.systems, sizeDefinitions: data.sizeDefinitions });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Sizing workspace could not be loaded.', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSystems = workspace.systems.filter((system) => system.status === 'ACTIVE');

  const visibleDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workspace.sizeDefinitions.filter((definition) => {
      const system = workspace.systems.find((candidate) => candidate.id === definition.sizeSystemId);
      if (statusFilter !== 'ALL' && definition.status !== statusFilter) return false;
      if (systemFilter !== 'ALL' && definition.sizeSystemId !== systemFilter) return false;
      if (!query) return true;
      return [definition.label, definition.code, system?.name ?? ''].some((value) => value.toLowerCase().includes(query));
    });
  }, [search, statusFilter, systemFilter, workspace.sizeDefinitions, workspace.systems]);

  async function submitSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreating(true);
    setFeedback(null);

    try {
      await createSizeDefinition({
        sizeSystemId: String(form.get('sizeSystemId') ?? ''),
        code: slug(form.get('code')),
        label: String(form.get('label') ?? '').trim(),
        sortOrder: Number(form.get('sortOrder') ?? 0),
      });
      formElement.reset();
      setFeedback({ message: 'Size definition created.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to create size definition.', tone: 'danger' });
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(definition: SizeDefinitionDto) {
    if (!editing || editing.id !== definition.id) return;
    setBusyId(definition.id);
    setFeedback(null);

    try {
      await updateSizeDefinition(definition.id, {
        label: editing.label.trim(),
        sortOrder: Number(editing.sortOrder),
      });
      setEditing(null);
      setFeedback({ message: 'Size definition updated.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to update size definition.', tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(definition: SizeDefinitionDto) {
    const restoring = definition.status === 'ARCHIVED';
    if (!restoring && !window.confirm(`Archive size definition “${definition.label}”? Active product option mappings may prevent this action.`)) return;

    setBusyId(definition.id);
    setFeedback(null);
    try {
      if (restoring) await restoreSizeDefinition(definition.id);
      else await archiveSizeDefinition(definition.id);
      setFeedback({ message: `Size definition ${restoring ? 'restored' : 'archived'}.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : `Failed to ${restoring ? 'restore' : 'archive'} size definition.`, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Size Definitions"
        description="Manage canonical size values such as XS, M, EU 38, UK 12, or product-specific standardized labels inside each size system."
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {feedback ? <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback> : null}

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <form className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submitSize}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">New canonical value</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">Create size definition</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-700">Size system
                <select name="sizeSystemId" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="" disabled>Choose active system</option>
                  {activeSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-700">Label
                <input name="label" required placeholder="Medium, EU 38, UK 12…" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs font-medium text-slate-700">Code
                <input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="m or eu-38" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs font-medium text-slate-700">Sort order
                <input name="sortOrder" type="number" min="0" defaultValue="0" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <button type="submit" disabled={creating || activeSystems.length === 0} className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Add size
            </button>
          </form>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
              <div className="relative min-w-60 flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search size definitions…" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </div>
              <select value={systemFilter} onChange={(event) => setSystemFilter(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
                <option value="ALL">All systems</option>
                {workspace.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            {loading ? (
              <div className="animate-pulse space-y-3 p-5"><div className="h-12 rounded bg-slate-100" /><div className="h-12 rounded bg-slate-100" /></div>
            ) : visibleDefinitions.length === 0 ? (
              <OperationalEmptyState title="No matching size definitions" description="Create a canonical size or change the current filters." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-600">
                    <tr><th className="px-4 py-3">Label</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">System</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleDefinitions.map((definition) => {
                      const system = workspace.systems.find((candidate) => candidate.id === definition.sizeSystemId);
                      const isEditing = editing?.id === definition.id;
                      const parentActive = system?.status === 'ACTIVE';
                      const isBusy = busyId === definition.id;

                      return (
                        <tr key={definition.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            {isEditing ? <input value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} className="w-40 rounded border border-slate-300 px-2 py-1" /> : <strong className="text-slate-900">{definition.label}</strong>}
                          </td>
                          <td className="px-4 py-3"><code>{definition.code}</code></td>
                          <td className="px-4 py-3 text-slate-600">{system?.name ?? 'Unknown system'}{system?.status === 'ARCHIVED' ? ' (archived)' : ''}</td>
                          <td className="px-4 py-3">
                            {isEditing ? <input type="number" min="0" value={editing.sortOrder} onChange={(event) => setEditing({ ...editing, sortOrder: event.target.value })} className="w-20 rounded border border-slate-300 px-2 py-1" /> : definition.sortOrder}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={definition.status} /></td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {definition.status === 'ACTIVE' ? (
                                isEditing ? (
                                  <>
                                    <button type="button" disabled={isBusy || !editing.label.trim()} onClick={() => void saveEdit(definition)} className="rounded px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-50">Save</button>
                                    <button type="button" onClick={() => setEditing(null)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" disabled={isBusy} onClick={() => setEditing({ id: definition.id, label: definition.label, sortOrder: String(definition.sortOrder) })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                                    <button type="button" disabled={isBusy} onClick={() => void toggleStatus(definition)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Archive"><Archive className="h-3.5 w-3.5" /></button>
                                  </>
                                )
                              ) : (
                                <button type="button" disabled={isBusy || !parentActive} onClick={() => void toggleStatus(definition)} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40" title={parentActive ? 'Restore' : 'Restore the parent system first'}><RotateCcw className="h-3.5 w-3.5" /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
