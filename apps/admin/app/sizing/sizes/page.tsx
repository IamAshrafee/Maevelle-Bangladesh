'use client';

import { Plus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import {
  archiveSizeDefinition,
  createSizeDefinition,
  fetchSizingWorkspace,
} from '@/lib/sizing/api';
import type { SizeSystemDto, SizeDefinitionDto } from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';

type SizingWorkspace = {
  readonly systems: readonly SizeSystemDto[];
  readonly sizeDefinitions: readonly SizeDefinitionDto[];
};

function slug(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export default function SizesPage() {
  const [workspace, setWorkspace] = useState<SizingWorkspace>({ systems: [], sizeDefinitions: [] });
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSizingWorkspace();
      setWorkspace({ systems: data.systems, sizeDefinitions: data.sizeDefinitions });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Workspace could not be loaded.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await createSizeDefinition({
        sizeSystemId: String(form.get('sizeSystemId') ?? ''),
        code: slug(form.get('code')),
        label: String(form.get('label') ?? ''),
        sortOrder: Number(form.get('sortOrder') ?? 0),
      });
      setMessage('Size definition created.');
      setTone('success');
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create size definition.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function archiveSize(id: string, label: string) {
    if (!confirm(`Archive size definition "${label}"?`)) return;
    setBusy(true);
    try {
      await archiveSizeDefinition(id);
      setMessage('Size definition archived.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to archive size definition.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Sizing"
          title="Size Definitions"
          description="Manage discrete size definitions (e.g. S, M, L) mapped to their respective systems."
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        
        {loading ? (
          <div className="skeleton-list" aria-label="Loading workspace"><span /><span /><span /></div>
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <form className="panel inset-form lg:w-1/3 lg:shrink-0" onSubmit={submitSize}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">New</p>
                  <h2>Size definition</h2>
                </div>
              </div>
              <label>System
                <select name="sizeSystemId" required defaultValue="">
                  <option value="" disabled>Choose system</option>
                  {workspace.systems.map((system) => (
                    <option key={system.id} value={system.id}>{system.name}</option>
                  ))}
                </select>
              </label>
              <label>Label<input name="label" required placeholder="Small, UK 8, etc." /></label>
              <label>Code<input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="small" /></label>
              <label>Sort order<input name="sortOrder" type="number" required defaultValue="0" /></label>
              <button className="button secondary" disabled={busy} type="submit"><Plus aria-hidden="true" /> Add size</button>
            </form>

            <div className="lg:grow">
              {workspace.sizeDefinitions.length > 0 ? (
                <div className="data-table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Code</th>
                        <th>System</th>
                        <th>Sort Order</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.sizeDefinitions.map((size) => {
                        const system = workspace.systems.find(s => s.id === size.sizeSystemId);
                        return (
                          <tr key={size.id}>
                            <td><strong>{size.label}</strong></td>
                            <td><code>{size.code}</code></td>
                            <td>{system?.name ?? 'Unknown'}</td>
                            <td>{size.sortOrder}</td>
                            <td className="text-right">
                              <button
                                type="button"
                                onClick={() => archiveSize(size.id, size.label)}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Archive
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <OperationalEmptyState title="No sizes found" description="Create a size definition to get started." />
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
