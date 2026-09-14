'use client';

import { Archive, Pencil, Plus, RefreshCw, RotateCcw, Ruler, Settings2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { SizeSystemDto, SizingDomainDto } from '@maevelle/contracts';

import {
  archiveSizeSystem,
  archiveSizingDomain,
  createSizeSystem,
  createSizingDomain,
  fetchSizingWorkspace,
  restoreSizeSystem,
  restoreSizingDomain,
  updateSizeSystem,
  updateSizingDomain,
} from '@/lib/sizing/api';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';
import { StatusBadge } from '../../../components/status-badge';

type Workspace = {
  readonly domains: readonly SizingDomainDto[];
  readonly systems: readonly SizeSystemDto[];
};

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

function slug(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export default function DomainsPage() {
  const [workspace, setWorkspace] = useState<Workspace>({ domains: [], systems: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showArchived, setShowArchived] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSizingWorkspace();
      setWorkspace({ domains: data.domains, systems: data.systems });
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Sizing workspace could not be loaded.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleDomains = useMemo(
    () => workspace.domains.filter((domain) => showArchived || domain.status === 'ACTIVE'),
    [showArchived, workspace.domains],
  );

  const activeDomains = workspace.domains.filter((domain) => domain.status === 'ACTIVE');

  async function submitDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreating(true);
    setFeedback(null);

    try {
      await createSizingDomain({
        code: slug(form.get('code')),
        name: String(form.get('name') ?? '').trim(),
        subjectType: (form.get('subjectType') as 'BODY' | 'GARMENT' | 'PRODUCT') || 'GARMENT',
      });
      formElement.reset();
      setFeedback({ message: 'Sizing domain created.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Failed to create sizing domain.',
        tone: 'danger',
      });
    } finally {
      setCreating(false);
    }
  }

  async function submitSystem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreating(true);
    setFeedback(null);

    try {
      const regionCode = String(form.get('regionCode') ?? '').trim();
      await createSizeSystem({
        sizingDomainId: String(form.get('sizingDomainId') ?? ''),
        code: slug(form.get('code')),
        name: String(form.get('name') ?? '').trim(),
        ...(regionCode ? { regionCode } : {}),
      });
      formElement.reset();
      setFeedback({ message: 'Size system created.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Failed to create size system.',
        tone: 'danger',
      });
    } finally {
      setCreating(false);
    }
  }

  async function editDomain(domain: SizingDomainDto) {
    const value = window.prompt('Domain name', domain.name)?.trim();
    if (!value || value === domain.name) return;

    setBusyId(domain.id);
    setFeedback(null);
    try {
      await updateSizingDomain(domain.id, { name: value });
      setFeedback({ message: 'Sizing domain updated.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to update domain.', tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  async function editSystem(system: SizeSystemDto) {
    const nextName = window.prompt('System name', system.name)?.trim();
    if (!nextName) return;
    const nextRegion = window.prompt('Region code (leave blank for none)', system.regionCode ?? '') ?? system.regionCode ?? '';

    setBusyId(system.id);
    setFeedback(null);
    try {
      await updateSizeSystem(system.id, {
        name: nextName,
        regionCode: nextRegion.trim() || null,
      });
      setFeedback({ message: 'Size system updated.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Failed to update system.', tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDomain(domain: SizingDomainDto) {
    const restoring = domain.status === 'ARCHIVED';
    if (!restoring && !window.confirm(`Archive domain “${domain.name}”? All active child systems/guides must be archived first.`)) return;

    setBusyId(domain.id);
    setFeedback(null);
    try {
      if (restoring) await restoreSizingDomain(domain.id);
      else await archiveSizingDomain(domain.id);
      setFeedback({ message: `Domain ${restoring ? 'restored' : 'archived'}.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : `Failed to ${restoring ? 'restore' : 'archive'} domain.`, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSystem(system: SizeSystemDto) {
    const restoring = system.status === 'ARCHIVED';
    if (!restoring && !window.confirm(`Archive size system “${system.name}”? It cannot be archived while active product configurations depend on it.`)) return;

    setBusyId(system.id);
    setFeedback(null);
    try {
      if (restoring) await restoreSizeSystem(system.id);
      else await archiveSizeSystem(system.id);
      setFeedback({ message: `Size system ${restoring ? 'restored' : 'archived'}.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : `Failed to ${restoring ? 'restore' : 'archive'} system.`, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Domains & Systems"
        description="Define reusable sizing domains and the canonical regional or commercial size systems that belong to them."
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {feedback ? <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback> : null}

        <section className="grid gap-5 xl:grid-cols-2">
          <form className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submitDomain}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Foundation</p>
                <h2 className="mt-1 text-sm font-semibold text-slate-900">Create sizing domain</h2>
              </div>
              <Ruler className="h-5 w-5 text-slate-400" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-700">Name
                <input name="name" required placeholder="Women’s dresses" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700">Code
                <input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="womens-dresses" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700 sm:col-span-2">Measurement subject
                <select name="subjectType" defaultValue="GARMENT" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="GARMENT">Garment</option>
                  <option value="BODY">Body</option>
                  <option value="PRODUCT">Product</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={creating} className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Add domain
            </button>
          </form>

          <form className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submitSystem}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Canonical sizing</p>
                <h2 className="mt-1 text-sm font-semibold text-slate-900">Create size system</h2>
              </div>
              <Settings2 className="h-5 w-5 text-slate-400" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-700 sm:col-span-2">Domain
                <select name="sizingDomainId" required defaultValue="" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="" disabled>Choose an active domain</option>
                  {activeDomains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-700">Name
                <input name="name" required placeholder="EU Women’s Tops" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700">Code
                <input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="eu-womens-tops" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-700 sm:col-span-2">Region / market code
                <input name="regionCode" maxLength={40} placeholder="EU, UK, US, INTL…" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <button type="submit" disabled={creating || activeDomains.length === 0} className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Add system
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Domain hierarchy</h2>
              <p className="text-xs text-slate-500">Archive protection is enforced by the backend. Restore parents before children.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived
              </label>
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-3 p-5"><div className="h-16 rounded bg-slate-100" /><div className="h-16 rounded bg-slate-100" /></div>
          ) : visibleDomains.length === 0 ? (
            <OperationalEmptyState title="No sizing domains" description="Create a domain to begin building reusable sizing standards." />
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleDomains.map((domain) => {
                const systems = workspace.systems.filter((system) => system.sizingDomainId === domain.id && (showArchived || system.status === 'ACTIVE'));
                const domainBusy = busyId === domain.id;
                return (
                  <div key={domain.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">{domain.name}</h3>
                          <StatusBadge status={domain.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500"><code>{domain.code}</code> · {domain.subjectType} · {systems.length} visible system{systems.length === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex gap-2">
                        {domain.status === 'ACTIVE' ? (
                          <>
                            <button type="button" disabled={domainBusy} onClick={() => void editDomain(domain)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3 w-3" /> Edit</button>
                            <button type="button" disabled={domainBusy} onClick={() => void toggleDomain(domain)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><Archive className="h-3 w-3" /> Archive</button>
                          </>
                        ) : (
                          <button type="button" disabled={domainBusy} onClick={() => void toggleDomain(domain)} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><RotateCcw className="h-3 w-3" /> Restore</button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {systems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">No systems in this domain.</div>
                      ) : systems.map((system) => {
                        const systemBusy = busyId === system.id;
                        const parentActive = domain.status === 'ACTIVE';
                        return (
                          <div key={system.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2"><span className="text-xs font-semibold text-slate-900">{system.name}</span><StatusBadge status={system.status} /></div>
                                <p className="mt-1 text-[11px] text-slate-500"><code>{system.code}</code>{system.regionCode ? ` · ${system.regionCode}` : ''}</p>
                              </div>
                              <div className="flex gap-1">
                                {system.status === 'ACTIVE' ? (
                                  <>
                                    <button type="button" disabled={systemBusy} title="Edit system" onClick={() => void editSystem(system)} className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"><Pencil className="h-3.5 w-3.5" /></button>
                                    <button type="button" disabled={systemBusy} title="Archive system" onClick={() => void toggleSystem(system)} className="rounded p-1 text-red-500 hover:bg-red-50"><Archive className="h-3.5 w-3.5" /></button>
                                  </>
                                ) : (
                                  <button type="button" disabled={systemBusy || !parentActive} title={parentActive ? 'Restore system' : 'Restore the domain first'} onClick={() => void toggleSystem(system)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /></button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
