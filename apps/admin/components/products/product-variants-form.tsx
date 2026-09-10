'use client';

import { Boxes, Plus, Tags, Loader2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type { CatalogVariantMatrixDto, CatalogVariantCreateDto } from '@maevelle/contracts';
import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CatalogRequestError, catalogData } from '@/lib/catalog/api';

import { ProductColorsModal } from './product-colors-modal';
import { ProductVariantsTable } from './product-variants-table';

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface OptionRecoveryDetails {
  affectedVariantCount: number;
  affectedVariants: readonly { id: string; sku: string; title: string | null }[];
  recoveryAction?: string;
}

function optionRecoveryDetails(error: unknown): OptionRecoveryDetails | undefined {
  if (
    !(error instanceof CatalogRequestError) ||
    (error.code !== 'OPTION_STRUCTURE_IN_USE' && error.code !== 'PUBLISHED_VARIANT_INTEGRITY') ||
    typeof error.details !== 'object' ||
    error.details === null
  )
    return undefined;
  const details = error.details as Record<string, unknown>;
  const variants = Array.isArray(details.affectedVariants)
    ? details.affectedVariants.filter(
        (variant): variant is { id: string; sku: string; title: string | null } =>
          typeof variant === 'object' &&
          variant !== null &&
          typeof (variant as Record<string, unknown>).id === 'string' &&
          typeof (variant as Record<string, unknown>).sku === 'string',
      )
    : [];
  return {
    affectedVariantCount:
      typeof details.affectedVariantCount === 'number'
        ? details.affectedVariantCount
        : variants.length,
    affectedVariants: variants,
    ...(typeof details.recoveryAction === 'string'
      ? { recoveryAction: details.recoveryAction }
      : {}),
  };
}

export function ProductVariantsForm({
  workspace,
  references,
  onRefresh,
  onDirtyChange,
  onMessage,
}: ProductEditorSectionProps) {
  const [matrix, setMatrix] = useState<CatalogVariantMatrixDto>();
  const [colors, setColors] = useState(references.colors);
  const [skuPrefix, setSkuPrefix] = useState(
    slug(workspace.title).replaceAll('-', '').toUpperCase().slice(0, 12),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<OptionRecoveryDetails>();

  const activeAxes = workspace.options.filter((axis) => axis.status === 'ACTIVE');
  const missingRows = matrix?.rows.filter((row) => row.state === 'MISSING') ?? [];

  function showError(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    setRecovery(optionRecoveryDetails(caught));
  }

  async function loadSupporting(signal?: AbortSignal) {
    try {
      const variantMatrix = await catalogData<CatalogVariantMatrixDto>(
        `/admin/catalog/products/${workspace.id}/variant-matrix?page=1&pageSize=100`,
        signal ? { signal } : undefined,
      );
      setMatrix(variantMatrix);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError'))
        showError(caught, 'Variant matrix could not be loaded.');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSupporting(controller.signal);
    return () => controller.abort();
  }, [workspace.id, workspace.version, workspace.variants.length, workspace.options.length]);

  useEffect(() => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => setColors(references.colors), [references.colors]);

  async function addAxis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    setError('');
    setRecovery(undefined);
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
      showError(caught, 'Product option could not be added.');
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
    setRecovery(undefined);
    const colorId = String(data.get('colorId') ?? '').trim();

    try {
      await catalogData(`/admin/catalog/option-axes/${axisId}/values`, {
        method: 'POST',
        body: JSON.stringify({
          displayValue,
          code: slug(displayValue),
          ...(colorId ? { colorId } : {}),
        }),
      });
      form.reset();
      await onRefresh('Option value added.');
    } catch (caught) {
      showError(caught, 'Option value could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveAxis(axisId: string, version: number, label: string) {
    if (
      !window.confirm(
        workspace.publicationStatus === 'PUBLISHED'
          ? `Archive the ${label} option? Published Products cannot archive an option used by active Variants. You may need to unpublish and reconfigure the Product first.`
          : `Archive the ${label} option? Existing Variants keep their history, and the Product cannot be published until active Variants are repaired.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setRecovery(undefined);
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/option-axes/${axisId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status: 'ARCHIVED' }),
      });
      await onRefresh(`${label} archived.`);
    } catch (caught) {
      showError(caught, 'Option could not be archived.');
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
        workspace.publicationStatus === 'PUBLISHED'
          ? 'Archive this option value? The action will be blocked if any active Variant uses it.'
          : 'Archive this option value? Active Variants that use it must be repaired before publishing.',
      )
    )
      return;
    setBusy(true);
    setError('');
    setRecovery(undefined);
    try {
      await catalogData(`/admin/catalog/option-axes/${axisId}/values/${valueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status }),
      });
      await onRefresh(`Option value ${status === 'ACTIVE' ? 'restored' : 'archived'}.`);
    } catch (caught) {
      showError(caught, 'Option value could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function generateMissing() {
    if (!matrix || missingRows.length === 0 || busy) return;
    if (matrix.summary.missingCombinations > 250) {
      return setError('Generate at most 250 Variants at once.');
    }
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
      await onRefresh(`${variants.length} Variant(s) generated.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Variants could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Options & Variants
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your product's axes (e.g. Size, Color) and the resulting variants.
          </p>
        </div>
        <ProductColorsModal colors={colors} setColors={setColors} />
      </div>

      {error && (
        <div
          className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <p className="font-medium">{error}</p>
          {recovery && (
            <div className="text-foreground">
              <p>
                {recovery.recoveryAction === 'UNPUBLISH_AND_RECONFIGURE'
                  ? 'Unpublish the Product, update its options and Variants, then publish again after readiness passes.'
                  : 'Archive or reconfigure the affected Variants below, then try again. If every active Variant must change, unpublish the Product first.'}
              </p>
              {recovery.affectedVariants.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Affected SKU{recovery.affectedVariantCount === 1 ? '' : 's'}:{' '}
                  {recovery.affectedVariants.map((variant) => variant.sku).join(', ')}
                  {recovery.affectedVariantCount > recovery.affectedVariants.length
                    ? ` and ${recovery.affectedVariantCount - recovery.affectedVariants.length} more`
                    : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Options Manager */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <Tags className="size-4" aria-hidden="true" /> Product Options
          </h3>
        </header>

        <div className="space-y-4">
          {activeAxes.map((axis) => (
            <div key={axis.id} className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold text-sm">{axis.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => archiveAxis(axis.id, axis.version, axis.name)}
                  disabled={busy}
                >
                  Archive Axis
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {axis.values.map((value) => (
                  <span
                    key={value.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs ${value.status === 'ARCHIVED' ? 'opacity-50' : ''}`}
                  >
                    {value.label}
                    <button
                      type="button"
                      disabled={busy}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        changeValueStatus(
                          axis.id,
                          value.id,
                          value.version,
                          value.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                        )
                      }
                      aria-label={`${value.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${value.label}`}
                      title={`${value.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${value.label}`}
                    >
                      {value.status === 'ACTIVE' ? '×' : '↺'}
                    </button>
                  </span>
                ))}
              </div>

              <form onSubmit={(e) => addValue(e, axis.id)} className="flex items-center gap-2">
                <Input
                  name="displayValue"
                  placeholder={`New ${axis.name} value...`}
                  className="h-8 max-w-[200px]"
                  required
                />
                <Button type="submit" size="sm" variant="secondary" className="h-8" disabled={busy}>
                  Add Value
                </Button>
              </form>
            </div>
          ))}

          {activeAxes.length < 3 && (
            <form
              onSubmit={addAxis}
              className="flex items-center gap-2 rounded-lg border border-dashed p-4"
            >
              <Input
                name="name"
                placeholder="E.g. Size, Color, Material"
                className="h-8 max-w-[200px]"
                required
              />
              <Button type="submit" size="sm" variant="secondary" className="h-8" disabled={busy}>
                <Plus className="size-3 mr-1" /> Add Option Axis
              </Button>
            </form>
          )}
        </div>
      </section>

      {/* Auto-Generation Matrix */}
      {missingRows.length > 0 && (
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-primary">
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <Boxes className="size-4" /> {missingRows.length} Missing Combinations
          </h3>
          <p className="mb-4 text-sm text-primary/80">
            You've added new options. We can automatically generate {missingRows.length} variants
            for you.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={skuPrefix}
              onChange={(e) => setSkuPrefix(e.target.value)}
              placeholder="SKU Prefix"
              className="h-9 max-w-[150px] bg-background text-foreground"
            />
            <Button onClick={generateMissing} disabled={busy} className="h-9">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate {missingRows.length} Variants
            </Button>
          </div>
        </section>
      )}

      {/* Variants Data Table */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-4">
          <h3 className="font-semibold">Active Variants</h3>
          <p className="text-sm text-muted-foreground">Manage your generated variants below.</p>
        </header>
        <ProductVariantsTable workspace={workspace} onRefresh={onRefresh} onMessage={onMessage} />
      </section>
    </div>
  );
}
