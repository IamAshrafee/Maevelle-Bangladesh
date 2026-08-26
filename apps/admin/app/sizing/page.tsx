'use client';

import { CheckCircle2, Plus, RefreshCw, Ruler, Send, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../components/operational-worklist';
import { StatusBadge } from '../../components/status-badge';

type SizingWorkspace = {
  readonly domains: readonly {
    id: string;
    code: string;
    name: string;
    subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
    status: string;
  }[];
  readonly systems: readonly {
    id: string;
    sizingDomainId: string;
    code: string;
    name: string;
    regionCode: string | null;
    status: string;
  }[];
  readonly sizeDefinitions: readonly {
    id: string;
    sizeSystemId: string;
    code: string;
    label: string;
    sortOrder: number;
  }[];
  readonly measurementDefinitions: readonly {
    id: string;
    sizingDomainId: string;
    code: string;
    name: string;
    subjectType: string;
    defaultUnit: 'cm' | 'inch';
  }[];
  readonly guides: readonly {
    id: string;
    name: string;
    sizingDomainId: string;
    status: string;
    currentPublishedRevisionId: string | null;
    version: number;
    revisions: readonly {
      id: string;
      revisionNumber: number;
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      instructions: string | null;
      createdAt: string;
      publishedAt: string | null;
      rows: readonly {
        id: string;
        displayLabel: string;
        position: number;
        sizeDefinitionId: string | null;
        measurements: readonly {
          measurementDefinitionId: string;
          exact: string | null;
          min: string | null;
          max: string | null;
          unit: 'cm' | 'inch';
          approximate: boolean;
        }[];
      }[];
    }[];
  }[];
  readonly productConfigurations: readonly {
    productId: string;
    productTitle: string;
    sizeSystemId: string;
    sizeGuideId: string | null;
    status: string;
  }[];
};

type Product = { readonly id: string; readonly title: string; readonly handle: string };
const emptyWorkspace: SizingWorkspace = {
  domains: [],
  systems: [],
  sizeDefinitions: [],
  measurementDefinitions: [],
  guides: [],
  productConfigurations: [],
};

async function responseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
  };
  return typeof payload.error === 'string' ? payload.error : (payload.error?.message ?? fallback);
}

function slug(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export default function SizingPage() {
  const [workspace, setWorkspace] = useState<SizingWorkspace>(emptyWorkspace);
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState('');
  const [selectedRevisionId, setSelectedRevisionId] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sizingResponse, productsResponse] = await Promise.all([
        fetch('/api/admin/sizing', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/catalog/products', { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!sizingResponse.ok)
        throw new Error(
          await responseError(sizingResponse, 'Sizing workspace could not be loaded.'),
        );
      if (!productsResponse.ok)
        throw new Error(await responseError(productsResponse, 'Products could not be loaded.'));
      const next = ((await sizingResponse.json()) as { data: SizingWorkspace }).data;
      setWorkspace(next);
      setProducts(((await productsResponse.json()) as { data: readonly Product[] }).data);
      setSelectedGuideId((current) => current || next.guides[0]?.id || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sizing workspace could not be loaded.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedGuide = useMemo(
    () => workspace.guides.find((guide) => guide.id === selectedGuideId),
    [selectedGuideId, workspace.guides],
  );
  const selectedRevision = useMemo(
    () =>
      selectedGuide?.revisions.find((revision) => revision.id === selectedRevisionId) ??
      selectedGuide?.revisions[0],
    [selectedGuide, selectedRevisionId],
  );
  const guideDomainId = selectedGuide?.sizingDomainId;
  const domainSystems = workspace.systems.filter(
    (system) => system.sizingDomainId === guideDomainId,
  );
  const domainMeasurements = workspace.measurementDefinitions.filter(
    (definition) => definition.sizingDomainId === guideDomainId,
  );
  const guideDefinitions = workspace.sizeDefinitions.filter((definition) =>
    domainSystems.some((system) => system.id === definition.sizeSystemId),
  );

  async function command(
    path: string,
    options: { method?: 'POST' | 'PUT'; body?: Record<string, unknown> },
    success: string,
  ) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(path, {
        method: options.method ?? 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options.body ?? {}),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Sizing command failed.'));
      const payload =
        response.status === 204
          ? undefined
          : ((await response.json()) as { data?: { id?: string; revisionId?: string } });
      if (payload?.data?.id && path === '/api/admin/sizing/guides') {
        setSelectedGuideId(payload.data.id);
        setSelectedRevisionId(payload.data.revisionId ?? '');
      }
      setMessage(success);
      setTone('success');
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sizing command failed.');
      setTone('danger');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await command(
        '/api/admin/sizing/domains',
        {
          body: {
            code: slug(form.get('code')),
            name: form.get('name'),
            subjectType: form.get('subjectType'),
          },
        },
        'Sizing domain created.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitSystem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await command(
        '/api/admin/sizing/systems',
        {
          body: {
            sizingDomainId: form.get('sizingDomainId'),
            code: slug(form.get('code')),
            name: form.get('name'),
            regionCode: form.get('regionCode') || undefined,
          },
        },
        'Size system created.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await command(
        '/api/admin/sizing/definitions',
        {
          body: {
            sizeSystemId: form.get('sizeSystemId'),
            code: slug(form.get('code')),
            label: form.get('label'),
            sortOrder: Number(form.get('sortOrder') ?? 0),
          },
        },
        'Size definition created.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await command(
        '/api/admin/sizing/measurements',
        {
          body: {
            sizingDomainId: form.get('sizingDomainId'),
            code: slug(form.get('code')),
            name: form.get('name'),
            subjectType: form.get('subjectType'),
            defaultUnit: form.get('defaultUnit'),
          },
        },
        'Measurement definition created.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await command(
        '/api/admin/sizing/guides',
        { body: { sizingDomainId: form.get('sizingDomainId'), name: form.get('name') } },
        'Draft Size Guide created.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGuide) return;
    const form = new FormData(event.currentTarget);
    if (
      await command(
        `/api/admin/sizing/guides/${selectedGuide.id}/revisions`,
        { body: { instructions: form.get('instructions') || undefined } },
        'New draft revision created.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRevision) return;
    const form = new FormData(event.currentTarget);
    const sizeDefinitionId = String(form.get('sizeDefinitionId') ?? '');
    if (
      await command(
        `/api/admin/sizing/revisions/${selectedRevision.id}/rows`,
        {
          body: {
            displayLabel: form.get('displayLabel'),
            position: Number(form.get('position') ?? 0),
            ...(sizeDefinitionId ? { sizeDefinitionId } : {}),
          },
        },
        'Guide row added.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRevision) return;
    const form = new FormData(event.currentTarget);
    const exact = String(form.get('exact') ?? '').trim();
    const min = String(form.get('min') ?? '').trim();
    const max = String(form.get('max') ?? '').trim();
    const rowId = String(form.get('rowId'));
    const measurementDefinitionId = String(form.get('measurementDefinitionId'));
    if (
      await command(
        `/api/admin/sizing/revisions/${selectedRevision.id}/rows/${rowId}/measurements/${measurementDefinitionId}`,
        {
          method: 'PUT',
          body: {
            unitCode: form.get('unitCode'),
            ...(exact ? { exact } : { min, max }),
            isApproximate: form.get('isApproximate') === 'on',
          },
        },
        'Measurement saved.',
      )
    )
      event.currentTarget.reset();
  }
  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const guideId = String(form.get('sizeGuideId') ?? '');
    if (
      await command(
        `/api/admin/catalog/products/${String(form.get('productId'))}/size-configuration`,
        {
          body: {
            sizeSystemId: form.get('sizeSystemId'),
            ...(guideId ? { sizeGuideId: guideId } : {}),
          },
        },
        'Product sizing configuration saved.',
      )
    )
      event.currentTarget.reset();
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Catalog / Fit"
          title="Sizing and Size Guides"
          description="Build reusable Size Systems and revisioned guides with named selections—never UUID copy and paste."
          actions={
            <>
              <button className="button secondary" type="button" onClick={() => void load()}>
                <RefreshCw aria-hidden="true" /> Refresh
              </button>
              <Link className="button secondary" href="/products">
                Open Products
              </Link>
            </>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <OperationalFeedback tone="warning">
          Published guide revisions are immutable. Create a new draft revision to make later
          changes.
        </OperationalFeedback>
        {loading ? (
          <div className="skeleton-list" aria-label="Loading Sizing workspace">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        <section className="sizing-foundation-grid">
          <form className="panel inset-form" onSubmit={(event) => void submitDomain(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Step 1</p>
                <h2>Sizing domain</h2>
              </div>
              <Ruler aria-hidden="true" />
            </div>
            <label>
              Name
              <input name="name" required placeholder="Women’s dress" />
            </label>
            <label>
              Code
              <input
                name="code"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="women-dress"
              />
            </label>
            <label>
              Subject
              <select name="subjectType" defaultValue="GARMENT">
                <option value="GARMENT">Garment</option>
                <option value="BODY">Body</option>
                <option value="PRODUCT">Product</option>
              </select>
            </label>
            <button className="button secondary" disabled={busy} type="submit">
              <Plus aria-hidden="true" /> Add domain
            </button>
          </form>
          <form className="panel inset-form" onSubmit={(event) => void submitSystem(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Step 2</p>
                <h2>Size system</h2>
              </div>
            </div>
            <label>
              Domain
              <select name="sizingDomainId" required defaultValue="">
                <option value="" disabled>
                  Choose domain
                </option>
                {workspace.domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input name="name" required placeholder="International women’s" />
            </label>
            <label>
              Code
              <input
                name="code"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="intl-women"
              />
            </label>
            <label>
              Region (optional)
              <input name="regionCode" placeholder="BD" />
            </label>
            <button
              className="button secondary"
              disabled={busy || workspace.domains.length === 0}
              type="submit"
            >
              <Plus aria-hidden="true" /> Add system
            </button>
          </form>
          <form className="panel inset-form" onSubmit={(event) => void submitSize(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Step 3</p>
                <h2>Size definition</h2>
              </div>
            </div>
            <label>
              System
              <select name="sizeSystemId" required defaultValue="">
                <option value="" disabled>
                  Choose system
                </option>
                {workspace.systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Label
              <input name="label" required placeholder="Medium" />
            </label>
            <label>
              Code
              <input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="m" />
            </label>
            <label>
              Order
              <input name="sortOrder" type="number" min={0} defaultValue={0} />
            </label>
            <button
              className="button secondary"
              disabled={busy || workspace.systems.length === 0}
              type="submit"
            >
              <Plus aria-hidden="true" /> Add size
            </button>
          </form>
          <form className="panel inset-form" onSubmit={(event) => void submitMeasurement(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Step 4</p>
                <h2>Measurement</h2>
              </div>
            </div>
            <label>
              Domain
              <select name="sizingDomainId" required defaultValue="">
                <option value="" disabled>
                  Choose domain
                </option>
                {workspace.domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input name="name" required placeholder="Chest circumference" />
            </label>
            <label>
              Code
              <input name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="chest" />
            </label>
            <div className="form-row">
              <label>
                Subject
                <select name="subjectType" defaultValue="GARMENT">
                  <option value="GARMENT">Garment</option>
                  <option value="BODY">Body</option>
                  <option value="PRODUCT">Product</option>
                </select>
              </label>
              <label>
                Unit
                <select name="defaultUnit" defaultValue="cm">
                  <option value="cm">cm</option>
                  <option value="inch">inch</option>
                </select>
              </label>
            </div>
            <button
              className="button secondary"
              disabled={busy || workspace.domains.length === 0}
              type="submit"
            >
              <Plus aria-hidden="true" /> Add measurement
            </button>
          </form>
        </section>

        <section className="sizing-guide-layout">
          <div className="panel sizing-guide-list">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Guides</p>
                <h2>Revisioned Size Guides</h2>
              </div>
              <span className="result-count">{workspace.guides.length}</span>
            </div>
            <form className="inset-form" onSubmit={(event) => void submitGuide(event)}>
              <label>
                Domain
                <select name="sizingDomainId" required defaultValue="">
                  <option value="" disabled>
                    Choose domain
                  </option>
                  {workspace.domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Guide name
                <input name="name" required placeholder="Women’s dress fit guide" />
              </label>
              <button
                className="button primary"
                disabled={busy || workspace.domains.length === 0}
                type="submit"
              >
                <Plus aria-hidden="true" /> Create guide
              </button>
            </form>
            {workspace.guides.length ? (
              <div className="sizing-guide-buttons">
                {workspace.guides.map((guide) => (
                  <button
                    aria-pressed={guide.id === selectedGuideId}
                    key={guide.id}
                    type="button"
                    onClick={() => {
                      setSelectedGuideId(guide.id);
                      setSelectedRevisionId('');
                    }}
                  >
                    <span>
                      <strong>{guide.name}</strong>
                      <small>
                        {workspace.domains.find((domain) => domain.id === guide.sizingDomainId)
                          ?.name ?? 'Sizing domain'}{' '}
                        · {guide.revisions.length} revision{guide.revisions.length === 1 ? '' : 's'}
                      </small>
                    </span>
                    <StatusBadge
                      status={guide.currentPublishedRevisionId ? 'PUBLISHED' : 'DRAFT'}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <OperationalEmptyState
                title="No Size Guides"
                description="Create a guide after defining the reusable sizing vocabulary."
              />
            )}
          </div>

          <div className="panel sizing-guide-editor">
            {selectedGuide ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Guide workspace</p>
                    <h2>{selectedGuide.name}</h2>
                  </div>
                  <StatusBadge status={selectedRevision?.status ?? 'DRAFT'} />
                </div>
                <label>
                  Revision
                  <select
                    value={selectedRevision?.id ?? ''}
                    onChange={(event) => setSelectedRevisionId(event.target.value)}
                  >
                    {selectedGuide.revisions.map((revision) => (
                      <option key={revision.id} value={revision.id}>
                        Revision {revision.revisionNumber} — {revision.status}
                      </option>
                    ))}
                  </select>
                </label>
                <form className="inset-form" onSubmit={(event) => void submitRevision(event)}>
                  <h3>Create a new draft revision</h3>
                  <label>
                    Customer instructions
                    <textarea
                      name="instructions"
                      rows={2}
                      placeholder="Measure around the fullest part…"
                    />
                  </label>
                  <button className="button secondary" disabled={busy} type="submit">
                    <Plus aria-hidden="true" /> New revision
                  </button>
                </form>
                {selectedRevision?.status === 'DRAFT' ? (
                  <>
                    <form className="inset-form" onSubmit={(event) => void submitRow(event)}>
                      <h3>Add size row</h3>
                      <div className="form-row">
                        <label>
                          Display label
                          <input name="displayLabel" required placeholder="M" />
                        </label>
                        <label>
                          Definition
                          <select name="sizeDefinitionId" defaultValue="">
                            <option value="">Custom label</option>
                            {guideDefinitions.map((definition) => (
                              <option key={definition.id} value={definition.id}>
                                {definition.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Position
                          <input
                            name="position"
                            type="number"
                            min={0}
                            defaultValue={selectedRevision.rows.length}
                          />
                        </label>
                      </div>
                      <button className="button secondary" disabled={busy} type="submit">
                        <Plus aria-hidden="true" /> Add row
                      </button>
                    </form>
                    {selectedRevision.rows.length && domainMeasurements.length ? (
                      <form className="inset-form" onSubmit={(event) => void submitValue(event)}>
                        <h3>Set row measurement</h3>
                        <div className="form-row">
                          <label>
                            Row
                            <select name="rowId" required>
                              {selectedRevision.rows.map((row) => (
                                <option key={row.id} value={row.id}>
                                  {row.displayLabel}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Measurement
                            <select name="measurementDefinitionId" required>
                              {domainMeasurements.map((definition) => (
                                <option key={definition.id} value={definition.id}>
                                  {definition.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Unit
                            <select name="unitCode" defaultValue="cm">
                              <option value="cm">cm</option>
                              <option value="inch">inch</option>
                            </select>
                          </label>
                        </div>
                        <div className="form-row">
                          <label>
                            Exact
                            <input name="exact" inputMode="decimal" placeholder="92" />
                          </label>
                          <label>
                            Minimum
                            <input name="min" inputMode="decimal" placeholder="90" />
                          </label>
                          <label>
                            Maximum
                            <input name="max" inputMode="decimal" placeholder="94" />
                          </label>
                        </div>
                        <label className="checkbox-row">
                          <input name="isApproximate" type="checkbox" /> Approximate measurement
                        </label>
                        <button className="button secondary" disabled={busy} type="submit">
                          Save measurement
                        </button>
                      </form>
                    ) : null}
                    <button
                      className="button primary"
                      disabled={busy || selectedRevision.rows.length === 0}
                      type="button"
                      onClick={() =>
                        void command(
                          `/api/admin/sizing/guides/${selectedGuide.id}/revisions/${selectedRevision.id}/publish`,
                          {},
                          'Size Guide published. Published values are now immutable.',
                        )
                      }
                    >
                      <Send aria-hidden="true" /> Publish revision
                    </button>
                  </>
                ) : (
                  <OperationalFeedback>
                    <ShieldCheck aria-hidden="true" /> This revision is published and read-only.
                  </OperationalFeedback>
                )}
                <div className="data-table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Size</th>
                        {domainMeasurements.map((definition) => (
                          <th key={definition.id}>{definition.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRevision?.rows.map((row) => (
                        <tr key={row.id}>
                          <th>{row.displayLabel}</th>
                          {domainMeasurements.map((definition) => {
                            const value = row.measurements.find(
                              (measurement) =>
                                measurement.measurementDefinitionId === definition.id,
                            );
                            return (
                              <td key={definition.id}>
                                {value ? (value.exact ?? `${value.min}–${value.max}`) : '—'}{' '}
                                {value?.unit}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <OperationalEmptyState
                title="Select a Size Guide"
                description="Choose a guide to manage its drafts, measurements, and publication."
              />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Catalog assignment</p>
              <h2>Attach published sizing to a Product</h2>
            </div>
            <CheckCircle2 aria-hidden="true" />
          </div>
          <form className="form-row" onSubmit={(event) => void submitProduct(event)}>
            <label>
              Product
              <select name="productId" required defaultValue="">
                <option value="" disabled>
                  Choose Product
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Size system
              <select name="sizeSystemId" required defaultValue="">
                <option value="" disabled>
                  Choose system
                </option>
                {workspace.systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Published guide
              <select name="sizeGuideId" defaultValue="">
                <option value="">No guide</option>
                {workspace.guides
                  .filter((guide) => guide.currentPublishedRevisionId)
                  .map((guide) => (
                    <option key={guide.id} value={guide.id}>
                      {guide.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button primary"
              disabled={busy || products.length === 0}
              type="submit"
            >
              Save Product sizing
            </button>
          </form>
          {workspace.productConfigurations.length ? (
            <div className="data-table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>System</th>
                    <th>Guide</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.productConfigurations.map((configuration) => (
                    <tr key={configuration.productId}>
                      <td>{configuration.productTitle}</td>
                      <td>
                        {workspace.systems.find(
                          (system) => system.id === configuration.sizeSystemId,
                        )?.name ?? 'Unknown system'}
                      </td>
                      <td>
                        {workspace.guides.find((guide) => guide.id === configuration.sizeGuideId)
                          ?.name ?? 'No guide'}
                      </td>
                      <td>
                        <StatusBadge status={configuration.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
