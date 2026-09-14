'use client';

import { Archive, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { MeasurementDefinitionDto, SizingDomainDto } from '@maevelle/contracts';

import {
  archiveMeasurementDefinition,
  createMeasurementDefinition,
  fetchSizingWorkspace,
  restoreMeasurementDefinition,
  updateMeasurementDefinition,
} from '@/lib/sizing/api';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';
import { StatusBadge } from '../../../components/status-badge';

type Workspace = {
  readonly domains: readonly SizingDomainDto[];
  readonly measurementDefinitions: readonly MeasurementDefinitionDto[];
};

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

type EditingState = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  sortOrder: string;
  defaultUnit: 'cm' | 'inch';
} | null;

function slug(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export default function MeasurementsPage() {
  const [workspace, setWorkspace] = useState<Workspace>({ domains: [], measurementDefinitions: [] });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [editing, setEditing] = useState<EditingState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSizingWorkspace();
      setWorkspace({ domains: data.domains, measurementDefinitions: data.measurementDefinitions });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Sizing workspace could not be loaded.', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDomains = workspace.domains.filter((domain) => domain.status === 'ACTIVE');

  const visibleMeasurements = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workspace.measurementDefinitions.filter((measurement) => {
      const domain = workspace.domains.find((candidate) => candidate.id === measurement.sizingDomainId);
      if (statusFilter !== 'ALL' && measurement.status !== statusFilter) return false;
      if (domainFilter !== 'ALL' && measurement.sizingDomainId !== domainFilter) return false;
      if (!query) return true;
      return [measurement.name, measurement.code, measurement.description ?? '', domain?.name ?? ''].some((value) => value.toLowerCase().includes(query));
    });
  }, [domainFilter, search, statusFilter, workspace.domains, workspace.measurementDefinitions]);

  async function submitMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreating(true);
    setFeedback(null);

    try {
      const description = String(form.get('description') ?? '').trim();
      const instructions = String(form.get('instructions') ?? '').trim();
      await createMeasurementDefinition({
        sizingDomainId: String(form.get('sizingDomainId') ?? ''),
        code: slug(form.get('code')),
        name: String(form.get('name') ?? '').trim(),
        subjectType: (form.get('subjectType') as 'BODY' | 'GARMENT' | 'PRODUCT') || 'GARMENT',
        defaultUnit: (form.get('defaultUnit') as 'cm' | 'inch') || 'cm',
        sortOrder: Number(form.get('sortOrder') ?? 0),
        ...(description ? { description } : {}),
        ...(instructions ? { instructions } : {}),
      });
      formElement.reset();
      setFeedback({ message: 'Measurement definition created.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to create measurement definition.', tone: 'danger' });
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(measurement: MeasurementDefinitionDto) {
    if (!editing || editing.id !== measurement.id) return;
    setBusyId(measurement.id);
    setFeedback(null);

    try {
      await updateMeasurementDefinition(measurement.id, {
        name: editing.name.trim(),
        description: editing.description.trim() || null,
        instructions: editing.instructions.trim() || null,
        sortOrder: Number(editing.sortOrder),
        defaultUnit: editing.defaultUnit,
      });
      setEditing(null);
      setFeedback({ message: 'Measurement definition updated.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to update measurement definition.', tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(measurement: MeasurementDefinitionDto) {
    const restoring = measurement.status === 'ARCHIVED';
    if (!restoring && !window.confirm(`Archive measurement “${measurement.name}”? Published guide usage may block this action.`)) return;

    setBusyId(measurement.id);
    setFeedback(null);
    try {
      if (restoring) await restoreMeasurementDefinition(measurement.id);
      else await archiveMeasurementDefinition(measurement.id);
      setFeedback({ message: `Measurement definition ${restoring ? 'restored' : 'archived'}.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : `Failed to ${restoring ? 'restore' : 'archive'} measurement.`, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Measurement Definitions"
        description="Manage reusable measurement columns such as bust, waist, length, inseam, circumference, or product dimensions."
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {feedback ? <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback> : null}

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <form className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submitMeasurement}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">New reusable column</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">Create measurement</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="text-xs font-medium text-slate-700">Domain
                <select name="sizingDomainId" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="" disabled>Choose active domain</option>
                  {activeDomains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-700">Name
                <input name="name" required placeholder="Bust circumference" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700">Code
                <input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="bust" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-700">Subject
                  <select name="subjectType" defaultValue="GARMENT" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="GARMENT">Garment</option><option value="BODY">Body</option><option value="PRODUCT">Product</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-700">Default unit
                  <select name="defaultUnit" defaultValue="cm" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="cm">cm</option><option value="inch">inch</option>
                  </select>
                </label>
              </div>
              <label className="text-xs font-medium text-slate-700">Description
                <input name="description" maxLength={500} placeholder="What this measurement represents" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700">Measuring instructions
                <textarea name="instructions" rows={3} maxLength={10000} placeholder="How staff or customers should measure it…" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700">Sort order
                <input name="sortOrder" type="number" min="0" defaultValue="0" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <button type="submit" disabled={creating || activeDomains.length === 0} className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Add measurement</button>
          </form>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
              <div className="relative min-w-60 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search measurements…" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" /></div>
              <select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"><option value="ALL">All domains</option>{workspace.domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
            </div>

            {loading ? (
              <div className="animate-pulse space-y-3 p-5"><div className="h-14 rounded bg-slate-100" /><div className="h-14 rounded bg-slate-100" /></div>
            ) : visibleMeasurements.length === 0 ? (
              <OperationalEmptyState title="No matching measurements" description="Create a measurement definition or change the current filters." />
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleMeasurements.map((measurement) => {
                  const domain = workspace.domains.find((candidate) => candidate.id === measurement.sizingDomainId);
                  const isEditing = editing?.id === measurement.id;
                  const parentActive = domain?.status === 'ACTIVE';
                  const isBusy = busyId === measurement.id;

                  return (
                    <div key={measurement.id} className="p-4">
                      {isEditing ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-xs font-medium text-slate-700">Name<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
                          <label className="text-xs font-medium text-slate-700">Default unit<select value={editing.defaultUnit} onChange={(event) => setEditing({ ...editing, defaultUnit: event.target.value as 'cm' | 'inch' })} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5"><option value="cm">cm</option><option value="inch">inch</option></select></label>
                          <label className="text-xs font-medium text-slate-700 md:col-span-2">Description<input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
                          <label className="text-xs font-medium text-slate-700 md:col-span-2">Instructions<textarea rows={2} value={editing.instructions} onChange={(event) => setEditing({ ...editing, instructions: event.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
                          <label className="text-xs font-medium text-slate-700">Sort order<input type="number" min="0" value={editing.sortOrder} onChange={(event) => setEditing({ ...editing, sortOrder: event.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" /></label>
                          <div className="flex items-end justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Cancel</button><button type="button" disabled={isBusy || !editing.name.trim()} onClick={() => void saveEdit(measurement)} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save</button></div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-900">{measurement.name}</h3><StatusBadge status={measurement.status} /><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{measurement.defaultUnit}</span></div>
                            <p className="mt-1 text-xs text-slate-500"><code>{measurement.code}</code> · {domain?.name ?? 'Unknown domain'} · {measurement.subjectType} · order {measurement.sortOrder}</p>
                            {measurement.description ? <p className="mt-2 text-xs text-slate-600">{measurement.description}</p> : null}
                            {measurement.instructions ? <p className="mt-1 text-[11px] italic text-slate-500">{measurement.instructions}</p> : null}
                          </div>
                          <div className="flex gap-1">
                            {measurement.status === 'ACTIVE' ? (
                              <><button type="button" disabled={isBusy} onClick={() => setEditing({ id: measurement.id, name: measurement.name, description: measurement.description ?? '', instructions: measurement.instructions ?? '', sortOrder: String(measurement.sortOrder), defaultUnit: measurement.defaultUnit })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil className="h-3.5 w-3.5" /></button><button type="button" disabled={isBusy} onClick={() => void toggleStatus(measurement)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Archive"><Archive className="h-3.5 w-3.5" /></button></>
                            ) : (
                              <button type="button" disabled={isBusy || !parentActive} onClick={() => void toggleStatus(measurement)} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40" title={parentActive ? 'Restore' : 'Restore the parent domain first'}><RotateCcw className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
