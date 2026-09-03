'use client';

import { Plus, Ruler } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import {
  archiveSizingDomain,
  archiveSizeSystem,
  createSizingDomain,
  createSizeSystem,
  fetchSizingWorkspace,
} from '@/lib/sizing/api';
import type { SizingDomainDto, SizeSystemDto } from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';
import { StatusBadge } from '../../../components/status-badge';

type SizingWorkspace = {
  readonly domains: readonly SizingDomainDto[];
  readonly systems: readonly SizeSystemDto[];
};

function slug(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export default function DomainsPage() {
  const [workspace, setWorkspace] = useState<SizingWorkspace>({ domains: [], systems: [] });
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSizingWorkspace();
      setWorkspace({ domains: data.domains, systems: data.systems });
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

  async function archiveDomain(id: string, name: string) {
    if (!confirm(`Archive domain "${name}"?`)) return;
    setBusy(true);
    setMessage('');
    try {
      await archiveSizingDomain(id);
      setMessage('Domain archived.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to archive domain.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function archiveSystem(id: string, name: string) {
    if (!confirm(`Archive size system "${name}"?`)) return;
    setBusy(true);
    setMessage('');
    try {
      await archiveSizeSystem(id);
      setMessage('System archived.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to archive system.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function submitDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      await createSizingDomain({
        code: slug(form.get('code')),
        name: String(form.get('name') ?? ''),
        subjectType: (form.get('subjectType') as 'BODY' | 'GARMENT' | 'PRODUCT') || 'BODY',
      });
      setMessage('Sizing domain created.');
      setTone('success');
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create domain.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function submitSystem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      await createSizeSystem({
        sizingDomainId: String(form.get('sizingDomainId') ?? ''),
        code: slug(form.get('code')),
        name: String(form.get('name') ?? ''),
        regionCode: String(form.get('regionCode') ?? '') || undefined,
      });
      setMessage('Size system created.');
      setTone('success');
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create size system.');
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
          title="Domains & Systems"
          description="Manage high-level sizing domains and regional size systems."
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        
        {loading ? (
          <div className="skeleton-list" aria-label="Loading workspace"><span /><span /><span /></div>
        ) : (
          <div className="flex flex-col gap-8">
            <section className="sizing-foundation-grid">
              <form className="panel inset-form" onSubmit={submitDomain}>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">New</p>
                    <h2>Sizing domain</h2>
                  </div>
                  <Ruler aria-hidden="true" />
                </div>
                <label>Name<input name="name" required placeholder="Women’s dress" /></label>
                <label>Code<input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="women-dress" /></label>
                <label>Subject
                  <select name="subjectType" defaultValue="GARMENT">
                    <option value="GARMENT">Garment</option>
                    <option value="BODY">Body</option>
                    <option value="PRODUCT">Product</option>
                  </select>
                </label>
                <button className="button secondary" disabled={busy} type="submit"><Plus aria-hidden="true" /> Add domain</button>
              </form>

              <form className="panel inset-form" onSubmit={submitSystem}>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">New</p>
                    <h2>Size system</h2>
                  </div>
                </div>
                <label>Domain
                  <select name="sizingDomainId" required defaultValue="">
                    <option value="" disabled>Choose domain</option>
                    {workspace.domains.map((domain) => (
                      <option key={domain.id} value={domain.id}>{domain.name}</option>
                    ))}
                  </select>
                </label>
                <label>Name<input name="name" required placeholder="International Women’s Tops" /></label>
                <label>Code<input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="int-womens-tops" /></label>
                <label>Region Code<input name="regionCode" placeholder="US, EU, UK (Optional)" maxLength={2} /></label>
                <button className="button secondary" disabled={busy} type="submit"><Plus aria-hidden="true" /> Add system</button>
              </form>
            </section>

            {workspace.domains.length > 0 ? (
              <div className="data-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Systems</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.domains.map((domain) => (
                      <tr key={domain.id}>
                        <td><strong>{domain.name}</strong> <code>{domain.code}</code></td>
                        <td>{domain.subjectType}</td>
                        <td><StatusBadge status={domain.status} /></td>
                        <td>
                          {workspace.systems.filter((s) => s.sizingDomainId === domain.id).length > 0 ? (
                            <ul className="space-y-1 text-sm">
                              {workspace.systems.filter((s) => s.sizingDomainId === domain.id).map(s => (
                                <li key={s.id} className="flex items-center justify-between gap-2">
                                  <span>{s.name} ({s.code})</span>
                                  {s.status !== 'ARCHIVED' && (
                                    <button
                                      type="button"
                                      onClick={() => archiveSystem(s.id, s.name)}
                                      className="text-xs text-red-500 hover:underline"
                                    >
                                      Archive
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : <span className="text-muted-foreground text-sm">No systems</span>}
                        </td>
                        <td className="text-right">
                          {domain.status !== 'ARCHIVED' && (
                            <button
                              type="button"
                              onClick={() => archiveDomain(domain.id, domain.name)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Archive Domain
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <OperationalEmptyState title="No domains found" description="Create a sizing domain to get started." />
            )}
          </div>
        )}
      </section>
    </main>
  );
}
