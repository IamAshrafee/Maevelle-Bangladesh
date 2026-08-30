'use client';

import {
  Archive,
  Boxes,
  CircleAlert,
  Grid2X2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Tags,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

import type {
  CatalogVariantCreateDto,
  CatalogVariantMatrixDto,
  CatalogVariantUpdateDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData } from '@/lib/catalog/api';

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function variantConfiguration(
  workspace: ProductEditorSectionProps['workspace'],
  optionValueIds: readonly string[],
): string {
  const all = workspace.options.flatMap((axis) => axis.values);
  const labels = optionValueIds.map(
    (id) => all.find((value) => value.id === id)?.label ?? 'Unknown',
  );
  return labels.length > 0 ? labels.join(' / ') : 'Default Variant';
}

export function ProductVariantsForm({
  workspace,
  references,
  onRefresh,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const [matrix, setMatrix] = useState<CatalogVariantMatrixDto>();
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [colors, setColors] = useState(references.colors);
  const [selectedVariantId, setSelectedVariantId] = useState(workspace.variants[0]?.id ?? '');
  const [skuPrefix, setSkuPrefix] = useState(
    slug(workspace.title).replaceAll('-', '').toUpperCase().slice(0, 12),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedVariant = workspace.variants.find((variant) => variant.id === selectedVariantId);
  const activeAxes = workspace.options.filter((axis) => axis.status === 'ACTIVE');
  const missingRows = matrix?.rows.filter((row) => row.state === 'MISSING') ?? [];

  async function loadSupporting(signal?: AbortSignal) {
    try {
      const [variantMatrix, warehouseLocations] = await Promise.all([
        catalogData<CatalogVariantMatrixDto>(
          `/admin/catalog/products/${workspace.id}/variant-matrix?page=1&pageSize=100`,
          signal ? { signal } : undefined,
        ),
        catalogData<readonly WarehouseLocationDto[]>(
          '/admin/warehouse/locations',
          signal ? { signal } : undefined,
        ).catch(() => []),
      ]);
      setMatrix(variantMatrix);
      setLocations(warehouseLocations);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError'))
        setError(caught instanceof Error ? caught.message : 'Variant matrix could not be loaded.');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSupporting(controller.signal);
    return () => controller.abort();
  }, [workspace.id, workspace.version, workspace.variants.length, workspace.options.length]);
  useEffect(() => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => setColors(references.colors), [references.colors]);
  useEffect(() => {
    if (!workspace.variants.some((variant) => variant.id === selectedVariantId))
      setSelectedVariantId(workspace.variants[0]?.id ?? '');
  }, [workspace.variants, selectedVariantId]);

  async function addAxis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/option-axes`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          code: slug(String(data.get('code') || name)),
          position: activeAxes.length,
        }),
      });
      form.reset();
      await onRefresh('Product option added. Add its customer-facing values next.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product option could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function addValue(event: FormEvent<HTMLFormElement>, axisId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayValue = String(data.get('displayValue') ?? '').trim();
    if (!displayValue) return;
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/option-axes/${axisId}/values`, {
        method: 'POST',
        body: JSON.stringify({
          displayValue,
          code: slug(String(data.get('code') || displayValue)),
          colorId: data.get('colorId') || undefined,
          sizeDefinitionId: data.get('sizeDefinitionId') || undefined,
        }),
      });
      form.reset();
      await onRefresh('Option value added. The Variant matrix was recalculated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Option value could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function addColor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      const color = await catalogData<(typeof colors)[number]>('/admin/catalog/colors', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code: slug(String(data.get('code') || name)),
          hexValue: String(data.get('hexValue') ?? '').trim() || null,
        }),
      });
      setColors((current) => [...current, color]);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Color could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function changeColorStatus(
    colorId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    setBusy(true);
    setError('');
    try {
      const color = await catalogData<(typeof colors)[number]>(`/admin/catalog/colors/${colorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status }),
      });
      setColors((current) => current.map((item) => (item.id === color.id ? color : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Color could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveAxis(axisId: string, version: number, label: string) {
    if (
      !window.confirm(
        `Archive the ${label} option? Existing Variants keep history but may need repair before publishing.`,
      )
    )
      return;
    setBusy(true);
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/option-axes/${axisId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status: 'ARCHIVED' }),
      });
      await onRefresh(`${label} archived. Review affected Variant combinations.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Option could not be archived.');
    } finally {
      setBusy(false);
    }
  }

  async function changeValueStatus(
    axisId: string,
    valueId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    if (
      status === 'ARCHIVED' &&
      !window.confirm(
        'Archive this option value? Existing Variants keep history and may require repair.',
      )
    )
      return;
    setBusy(true);
    try {
      await catalogData(`/admin/catalog/option-axes/${axisId}/values/${valueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status }),
      });
      await onRefresh(`Option value ${status === 'ACTIVE' ? 'restored' : 'archived'}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Option value could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function createDefaultVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          sku: data.get('sku'),
          title: data.get('title') || undefined,
          optionValueIds: [],
        }),
      });
      await onRefresh('Default sellable Variant created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Default Variant could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function generateMissing() {
    if (!matrix || missingRows.length === 0 || busy) return;
    if (
      matrix.summary.missingCombinations > 250 ||
      matrix.summary.missingCombinations > matrix.rows.length
    )
      return setError(
        'Generate at most 250 Variants at once. Narrow the option set or create this matrix in smaller groups.',
      );
    if (!skuPrefix.trim()) return setError('Enter an SKU prefix before generating Variants.');
    const variants: CatalogVariantCreateDto[] = missingRows.map((row) => {
      const primaryColorId = row.values
        .map(
          (value) =>
            workspace.options
              .flatMap((axis) => axis.values)
              .find((candidate) => candidate.id === value.valueId)?.color?.id,
        )
        .find((colorId): colorId is string => Boolean(colorId));
      return {
        sku: `${skuPrefix.trim().toUpperCase()}-${row.values.map((value) => slug(value.valueLabel).toUpperCase()).join('-')}`,
        title: row.values.map((value) => value.valueLabel).join(' / '),
        optionValueIds: row.values.map((value) => value.valueId),
        ...(primaryColorId ? { primaryColorId } : {}),
      };
    });
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/variants/bulk`, {
        method: 'POST',
        body: JSON.stringify({ variants }),
      });
      await onRefresh(
        `${variants.length} Variant${variants.length === 1 ? '' : 's'} created from the reviewed matrix.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Variants could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVariant) return;
    const data = new FormData(event.currentTarget);
    const associatedColorIds = data.getAll('associatedColorId').map(String);
    const primaryColorId = String(data.get('primaryColorId') ?? '') || null;
    const payload: CatalogVariantUpdateDto = {
      version: selectedVariant.version,
      title: String(data.get('title') ?? '').trim() || null,
      sku: String(data.get('sku') ?? ''),
      barcode: String(data.get('barcode') ?? '').trim() || null,
      status: String(data.get('status')) as 'ACTIVE' | 'ARCHIVED',
      primaryColorId,
      associatedColorIds: associatedColorIds.filter((id) => id !== primaryColorId),
      weight: data.get('weightValue')
        ? {
            value: String(data.get('weightValue')),
            unit: String(data.get('weightUnit')) as 'G' | 'KG' | 'OZ' | 'LB',
          }
        : null,
      dimensions:
        data.get('lengthValue') && data.get('widthValue') && data.get('heightValue')
          ? {
              length: String(data.get('lengthValue')),
              width: String(data.get('widthValue')),
              height: String(data.get('heightValue')),
              unit: String(data.get('dimensionUnit')) as 'MM' | 'CM' | 'IN',
            }
          : null,
    };
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/variants/${selectedVariant.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const amount = String(data.get('amount') ?? '').trim();
      if (amount)
        await catalogData(`/admin/pricing/variants/${selectedVariant.id}/current`, {
          method: 'PUT',
          body: JSON.stringify({
            currency: workspace.operationalSignals.defaultCurrency,
            amount,
            compareAtAmount: String(data.get('compareAtAmount') ?? '').trim() || null,
          }),
        });
      const quantity = String(data.get('quantityDelta') ?? '').trim();
      const locationId = String(data.get('locationId') ?? '');
      if (quantity && locationId)
        await catalogData('/admin/inventory/adjustments', {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            variantId: selectedVariant.id,
            locationId,
            condition: 'SELLABLE',
            quantityDelta: quantity,
            reasonCode: 'OPENING_BALANCE',
            note: 'Product setup opening/correction quantity',
          }),
        });
      await onRefresh(
        'Variant identity, commercial data, and any inventory adjustment were saved.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Variant could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Palette className="size-4" aria-hidden="true" /> Color Library
          </h2>
          <p className="text-sm text-muted-foreground">
            Reusable normalized Colors power swatches, filters, a Variant's primary Color, and
            optional associated search Colors.
          </p>
        </header>
        <div className="flex flex-wrap gap-2 p-5">
          {colors.map((color) => (
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${color.status === 'ARCHIVED' ? 'opacity-55' : ''}`}
              key={color.id}
            >
              <span
                className="size-4 rounded-full border"
                style={{ backgroundColor: color.hexValue ?? 'transparent' }}
                aria-hidden="true"
              />
              {color.name}
              <button
                className="rounded px-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                aria-label={`${color.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${color.name}`}
                disabled={busy}
                onClick={() =>
                  void changeColorStatus(
                    color.id,
                    color.version,
                    color.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                  )
                }
              >
                {color.status === 'ACTIVE' ? '×' : '↺'}
              </button>
            </span>
          ))}
          {colors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No normalized Colors yet. Add the first one below.
            </p>
          ) : null}
        </div>
        <form
          className="grid gap-2 border-t p-4 sm:grid-cols-[1fr_1fr_8rem_auto]"
          onSubmit={(event) => void addColor(event)}
        >
          <Input
            aria-label="Color name"
            autoComplete="off"
            name="name"
            placeholder="Example: Crimson…"
            required
          />
          <Input aria-label="Color code" autoComplete="off" name="code" placeholder="Auto code…" />
          <Input
            aria-label="Color hex value"
            autoComplete="off"
            name="hexValue"
            pattern="#[0-9a-fA-F]{6}"
            placeholder="#DC143C"
          />
          <Button type="submit" disabled={busy}>
            <Plus aria-hidden="true" /> Add Color
          </Button>
        </form>
      </section>
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold">Product Options</h2>
            <p className="text-sm text-muted-foreground">
              Options are customer choices such as Color and Size. Associated colors are search
              metadata, not options.
            </p>
          </div>
          <Button size="sm" variant="outline" render={<Link href="/sizing" />}>
            Manage Size Systems
          </Button>
        </header>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {workspace.options.map((axis) => (
            <article
              className={`rounded-lg border ${axis.status === 'ARCHIVED' ? 'opacity-70' : ''}`}
              key={axis.id}
            >
              <header className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
                <div>
                  <strong className="text-sm">{axis.name}</strong>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{axis.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={axis.status} />
                  {axis.status === 'ACTIVE' ? (
                    <Button
                      aria-label={`Archive ${axis.name}`}
                      size="icon-xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void archiveAxis(axis.id, axis.version, axis.name)}
                    >
                      <Archive aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </header>
              <div className="flex flex-wrap gap-1.5 p-3">
                {axis.values.map((value) => (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${value.status === 'ARCHIVED' ? 'line-through opacity-60' : ''}`}
                    key={value.id}
                  >
                    {value.color?.hexValue ? (
                      <span
                        className="size-3 rounded-full border"
                        style={{ backgroundColor: value.color.hexValue }}
                        aria-hidden="true"
                      />
                    ) : null}
                    {value.label}
                    <button
                      className="rounded px-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                      aria-label={`${value.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${value.label}`}
                      onClick={() =>
                        void changeValueStatus(
                          axis.id,
                          value.id,
                          value.version,
                          value.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                        )
                      }
                    >
                      {value.status === 'ACTIVE' ? '×' : '↺'}
                    </button>
                  </span>
                ))}
              </div>
              {axis.status === 'ACTIVE' ? (
                <form
                  className="grid gap-2 border-t p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  onSubmit={(event) => void addValue(event, axis.id)}
                >
                  <Input
                    aria-label={`${axis.name} value label`}
                    autoComplete="off"
                    name="displayValue"
                    placeholder={
                      axis.code.includes('color')
                        ? 'Red…'
                        : axis.code.includes('size')
                          ? 'Medium…'
                          : 'Value…'
                    }
                    required
                  />
                  <Input
                    aria-label={`${axis.name} value code`}
                    autoComplete="off"
                    name="code"
                    placeholder="Auto code…"
                  />
                  {axis.code.toLowerCase().includes('size') ? (
                    <select
                      aria-label={`${axis.name} normalized size`}
                      className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                      name="sizeDefinitionId"
                      defaultValue=""
                    >
                      <option value="">No normalized size</option>
                      {references.sizeDefinitions.map((definition) => (
                        <option key={definition.id} value={definition.id}>
                          {references.sizeSystems.find(
                            (system) => system.id === definition.sizeSystemId,
                          )?.name ?? 'Size system'}{' '}
                          · {definition.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      aria-label={`${axis.name} Color swatch`}
                      className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                      name="colorId"
                      defaultValue=""
                    >
                      <option value="">No Color swatch</option>
                      {colors
                        .filter((color) => color.status === 'ACTIVE')
                        .map((color) => (
                          <option key={color.id} value={color.id}>
                            {color.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <Button type="submit" size="sm" disabled={busy}>
                    <Plus aria-hidden="true" /> Add
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
          <form
            className="rounded-lg border border-dashed p-4"
            onSubmit={(event) => void addAxis(event)}
          >
            <h3 className="text-sm font-semibold">Add an Option</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Use only attributes that change the exact sellable item.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                aria-label="Option name"
                autoComplete="off"
                name="name"
                placeholder="Example: Color…"
                required
              />
              <Input
                aria-label="Option code"
                autoComplete="off"
                name="code"
                placeholder="Auto code…"
              />
              <Button type="submit" disabled={busy}>
                <Plus aria-hidden="true" /> Add Option
              </Button>
            </div>
          </form>
        </div>
      </section>

      {activeAxes.length === 0 && workspace.variants.length === 0 ? (
        <form
          className="rounded-xl bg-card p-5 ring-1 ring-foreground/10"
          onSubmit={(event) => void createDefaultVariant(event)}
        >
          <h2 className="font-semibold">Create the Default Sellable Variant</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This Product has no meaningful customer options. It still needs one internal SKU for
            orders, pricing, and inventory.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label htmlFor="default-title">Variant Title</Label>
              <Input autoComplete="off" id="default-title" name="title" placeholder="Default" />
            </div>
            <div>
              <Label htmlFor="default-sku">SKU</Label>
              <Input
                autoComplete="off"
                id="default-sku"
                name="sku"
                placeholder={`${skuPrefix || 'PRODUCT'}-DEFAULT`}
                required
                spellCheck={false}
              />
            </div>
            <Button className="self-end" type="submit" disabled={busy}>
              Create Variant
            </Button>
          </div>
        </form>
      ) : null}

      {activeAxes.length > 0 ? (
        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <header className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold">Variant Matrix</h2>
              <p className="text-sm text-muted-foreground">
                Review combinations before creating them. The server prevents duplicate combinations
                and SKUs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Generated SKU prefix"
                className="w-40"
                autoComplete="off"
                value={skuPrefix}
                onChange={(event) =>
                  setSkuPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
                }
              />
              <Button
                disabled={
                  busy ||
                  missingRows.length === 0 ||
                  (matrix?.summary.missingCombinations ?? 0) > 250
                }
                onClick={() => void generateMissing()}
              >
                <Grid2X2 aria-hidden="true" /> Generate {matrix?.summary.missingCombinations ?? 0}{' '}
                Missing
              </Button>
            </div>
          </header>
          <div className="grid grid-cols-2 gap-2 border-b bg-muted/35 p-4 md:grid-cols-5">
            {[
              ['Potential', matrix?.summary.potentialCombinations ?? '—'],
              ['Active', matrix?.summary.activeVariants ?? '—'],
              ['Missing', matrix?.summary.missingCombinations ?? '—'],
              ['Archived', matrix?.summary.archivedVariants ?? '—'],
              ['Needs Repair', matrix?.summary.incompleteVariants ?? '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {matrix && matrix.summary.potentialCombinations > matrix.rows.length ? (
            <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
              This preview shows the first {matrix.rows.length} of{' '}
              {matrix.summary.potentialCombinations} combinations. Generate smaller groups to stay
              within the 250-Variant safety limit.
            </p>
          ) : null}
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 border-b bg-card text-xs text-muted-foreground">
                <tr>
                  {activeAxes.map((axis) => (
                    <th className="px-4 py-2" key={axis.id}>
                      {axis.name}
                    </th>
                  ))}
                  <th className="px-4 py-2">State</th>
                  <th className="px-4 py-2">SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {matrix?.rows.map((row) => (
                  <tr key={row.combinationKey}>
                    {row.values.map((value) => (
                      <td className="px-4 py-2" key={value.axisId}>
                        {value.valueLabel}
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <StatusBadge status={row.state} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {row.variant?.sku ??
                        `${skuPrefix}-${row.values.map((value) => slug(value.valueLabel).toUpperCase()).join('-')}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Sellable Variants</h2>
            <p className="text-sm text-muted-foreground">
              Manage identity, colors, physical data, current price, and opening/correction
              inventory.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void onRefresh();
              void loadSupporting();
            }}
          >
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
        </header>
        <div className="grid min-h-[30rem] lg:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className="border-b lg:border-r lg:border-b-0">
            <div className="max-h-[42rem] overflow-y-auto p-2">
              {workspace.variants.map((variant) => (
                <button
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 ${selectedVariantId === variant.id ? 'bg-muted' : ''}`}
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
                    {variant.primaryColor?.hexValue ? (
                      <span
                        className="size-5 rounded-full border"
                        style={{ backgroundColor: variant.primaryColor.hexValue }}
                        aria-hidden="true"
                      />
                    ) : (
                      <Boxes className="size-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-medium">
                      {variant.title ?? variantConfiguration(workspace, variant.optionValueIds)}
                    </strong>
                    <small className="block truncate font-mono text-xs text-muted-foreground">
                      {variant.sku}
                    </small>
                  </span>
                  <StatusBadge status={variant.status} />
                </button>
              ))}
              {workspace.variants.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No Variants yet.</p>
              ) : null}
            </div>
          </aside>
          {selectedVariant ? (
            <form
              className="p-5"
              key={`${selectedVariant.id}-${selectedVariant.version}`}
              onSubmit={(event) => void saveVariant(event)}
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {selectedVariant.title ??
                      variantConfiguration(workspace, selectedVariant.optionValueIds)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {variantConfiguration(workspace, selectedVariant.optionValueIds)} · Version{' '}
                    {selectedVariant.version}
                  </p>
                </div>
                <StatusBadge status={selectedVariant.status} />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="variant-title">Variant Title</Label>
                  <Input
                    autoComplete="off"
                    defaultValue={selectedVariant.title ?? ''}
                    id="variant-title"
                    name="title"
                    placeholder={variantConfiguration(workspace, selectedVariant.optionValueIds)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variant-sku">SKU</Label>
                  <Input
                    autoComplete="off"
                    defaultValue={selectedVariant.sku}
                    id="variant-sku"
                    name="sku"
                    required
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variant-barcode">Barcode</Label>
                  <Input
                    autoComplete="off"
                    defaultValue={selectedVariant.barcode ?? ''}
                    id="variant-barcode"
                    name="barcode"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variant-status">Status</Label>
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                    defaultValue={selectedVariant.status}
                    id="variant-status"
                    name="status"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                    defaultValue={selectedVariant.primaryColor?.id ?? ''}
                    id="primary-color"
                    name="primaryColorId"
                  >
                    <option value="">No primary Color</option>
                    {colors
                      .filter((color) => color.status === 'ACTIVE')
                      .map((color) => (
                        <option key={color.id} value={color.id}>
                          {color.name}
                        </option>
                      ))}
                  </select>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Associated Search Colors</legend>
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {colors
                      .filter((color) => color.status === 'ACTIVE')
                      .map((color) => (
                        <label className="flex items-center gap-2 text-sm" key={color.id}>
                          <input
                            defaultChecked={selectedVariant.associatedColors.some(
                              (selected) => selected.id === color.id,
                            )}
                            name="associatedColorId"
                            type="checkbox"
                            value={color.id}
                          />
                          <span
                            className="size-3 rounded-full border"
                            style={{ backgroundColor: color.hexValue ?? 'transparent' }}
                            aria-hidden="true"
                          />
                          {color.name}
                        </label>
                      ))}
                  </div>
                </fieldset>
                <div className="space-y-2">
                  <Label htmlFor="weight-value">Shipping Weight</Label>
                  <div className="grid grid-cols-[1fr_5rem] gap-2">
                    <Input
                      defaultValue={selectedVariant.weight?.value ?? ''}
                      id="weight-value"
                      inputMode="decimal"
                      name="weightValue"
                      placeholder="0.000"
                    />
                    <select
                      className="rounded-lg border border-input bg-background px-2 text-sm"
                      defaultValue={selectedVariant.weight?.unit ?? 'G'}
                      name="weightUnit"
                    >
                      <option>G</option>
                      <option>KG</option>
                      <option>OZ</option>
                      <option>LB</option>
                    </select>
                  </div>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Package Dimensions</legend>
                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      aria-label="Length"
                      defaultValue={selectedVariant.dimensions?.length ?? ''}
                      inputMode="decimal"
                      name="lengthValue"
                      placeholder="L"
                    />
                    <Input
                      aria-label="Width"
                      defaultValue={selectedVariant.dimensions?.width ?? ''}
                      inputMode="decimal"
                      name="widthValue"
                      placeholder="W"
                    />
                    <Input
                      aria-label="Height"
                      defaultValue={selectedVariant.dimensions?.height ?? ''}
                      inputMode="decimal"
                      name="heightValue"
                      placeholder="H"
                    />
                    <select
                      aria-label="Dimension unit"
                      className="rounded-lg border border-input bg-background px-2 text-sm"
                      defaultValue={selectedVariant.dimensions?.unit ?? 'CM'}
                      name="dimensionUnit"
                    >
                      <option>MM</option>
                      <option>CM</option>
                      <option>IN</option>
                    </select>
                  </div>
                </fieldset>
                <fieldset className="rounded-lg border p-3 md:col-span-2">
                  <legend className="px-1 text-sm font-semibold">
                    <Tags className="mr-1 inline size-4" aria-hidden="true" /> Current{' '}
                    {workspace.operationalSignals.defaultCurrency} Price
                  </legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="variant-price">Selling Price</Label>
                      <Input
                        defaultValue={selectedVariant.currentPrice?.amount ?? ''}
                        id="variant-price"
                        inputMode="decimal"
                        name="amount"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="variant-compare-price">Compare-at Price</Label>
                      <Input
                        defaultValue={selectedVariant.currentPrice?.compareAtAmount ?? ''}
                        id="variant-compare-price"
                        inputMode="decimal"
                        name="compareAtAmount"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </fieldset>
                <fieldset className="rounded-lg border p-3 md:col-span-2">
                  <legend className="px-1 text-sm font-semibold">
                    <Boxes className="mr-1 inline size-4" aria-hidden="true" /> Inventory Adjustment
                  </legend>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Current available total:{' '}
                    <strong className="tabular-nums text-foreground">
                      {selectedVariant.sellableQuantity}
                    </strong>
                    . Inventory remains an immutable ledger; enter only the quantity change.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="inventory-location">Warehouse</Label>
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                        defaultValue=""
                        id="inventory-location"
                        name="locationId"
                      >
                        <option value="">No inventory change</option>
                        {locations
                          .filter((location) => location.status === 'ACTIVE')
                          .map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="quantity-delta">Quantity Change</Label>
                      <Input
                        id="quantity-delta"
                        inputMode="decimal"
                        name="quantityDelta"
                        placeholder="Example: 12 or -2…"
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
              <footer className="mt-5 flex justify-end">
                <Button type="submit" disabled={busy}>
                  <Save aria-hidden="true" /> {busy ? 'Saving Variant…' : 'Save Variant'}
                </Button>
              </footer>
            </form>
          ) : (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              Choose a Variant to edit.
            </div>
          )}
        </div>
      </section>

      {matrix?.incompleteVariants.length ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <strong className="flex items-center gap-2">
            <CircleAlert className="size-4" aria-hidden="true" /> {matrix.incompleteVariants.length}{' '}
            Variant{matrix.incompleteVariants.length === 1 ? '' : 's'} Need Repair
          </strong>
          <p className="mt-1">
            An option or value was archived after these Variants were created. Restore the
            definition or archive and replace the affected Variants.
          </p>
        </div>
      ) : null}
      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
