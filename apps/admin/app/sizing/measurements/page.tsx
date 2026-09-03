'use client';

import { Plus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import {
  archiveMeasurementDefinition,
  createMeasurementDefinition,
  fetchSizingWorkspace,
} from '@/lib/sizing/api';
import type { SizingDomainDto, MeasurementDefinitionDto } from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../../components/operational-worklist';

type SizingWorkspace = {
  readonly domains: readonly SizingDomainDto[];
  readonly measurementDefinitions: readonly MeasurementDefinitionDto[];
};

function slug(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export default function MeasurementsPage() {
  const [workspace, setWorkspace] = useState<SizingWorkspace>({ domains: [], measurementDefinitions: [] });
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSizingWorkspace();
      setWorkspace({ domains: data.domains, measurementDefinitions: data.measurementDefinitions });
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

  async function submitMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await createMeasurementDefinition({
        sizingDomainId: String(form.get('sizingDomainId') ?? ''),
        code: slug(form.get('code')),
        name: String(form.get('name') ?? ''),
        subjectType: (form.get('subjectType') as 'BODY' | 'GARMENT' | 'PRODUCT') || 'BODY',
        defaultUnit: (form.get('defaultUnit') as 'cm' | 'inch') || 'cm',
      });
      setMessage('Measurement definition created.');
      setTone('success');
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create measurement definition.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function archiveMeasurement(id: string, name: string) {
    if (!confirm(`Archive measurement definition "${name}"?`)) return;
    setBusy(true);
    try {
      await archiveMeasurementDefinition(id);
      setMessage('Measurement definition archived.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to archive measurement definition.');
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
          title="Measurement Definitions"
          description="Manage the physical dimensions (e.g. Chest, Waist) that make up a size guide matrix."
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        
        {loading ? (
          <div className="skeleton-list" aria-label="Loading workspace"><span /><span /><span /></div>
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <form className="panel inset-form lg:w-1/3 lg:shrink-0" onSubmit={submitMeasurement}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">New</p>
                  <h2>Measurement</h2>
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
              <label>Name<input name="name" required placeholder="Chest, Inseam, etc." /></label>
              <label>Code<input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="chest" /></label>
              <label>Subject
                <select name="subjectType" defaultValue="GARMENT">
                  <option value="GARMENT">Garment</option>
                  <option value="BODY">Body</option>
                  <option value="PRODUCT">Product</option>
                </select>
              </label>
              <label>Unit
                <select name="defaultUnit" defaultValue="cm">
                  <option value="cm">Centimeters (cm)</option>
                  <option value="inch">Inches (in)</option>
                </select>
              </label>
              <button className="button secondary" disabled={busy} type="submit"><Plus aria-hidden="true" /> Add measurement</button>
            </form>

            <div className="lg:grow">
              {workspace.measurementDefinitions.length > 0 ? (
                <div className="data-table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Domain</th>
                        <th>Subject</th>
                        <th>Unit</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.measurementDefinitions.map((measurement) => {
                        const domain = workspace.domains.find(d => d.id === measurement.sizingDomainId);
                        return (
                          <tr key={measurement.id}>
                            <td><strong>{measurement.name}</strong></td>
                            <td><code>{measurement.code}</code></td>
                            <td>{domain?.name ?? 'Unknown'}</td>
                            <td>{measurement.subjectType}</td>
                            <td>{measurement.defaultUnit}</td>
                            <td className="text-right">
                              <button
                                type="button"
                                onClick={() => archiveMeasurement(measurement.id, measurement.name)}
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
                <OperationalEmptyState title="No measurements found" description="Create a measurement definition to get started." />
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
