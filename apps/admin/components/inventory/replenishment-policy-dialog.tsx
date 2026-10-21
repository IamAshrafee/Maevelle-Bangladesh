'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import type {
  InventoryItemChoiceDto,
  PaginatedDto,
  ReplenishmentPolicyDto,
  ReplenishmentRecommendationDto,
  SupplierDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { inventoryRequest } from '@/lib/inventory/api';
import { saveReplenishmentPolicy } from '@/lib/inventory/replenishment';

interface PolicyFormState {
  inventoryItemId: string;
  scope: 'ITEM' | 'LOCATION';
  locationId: string;
  reorderPoint: string;
  safetyStock: string;
  targetStock: string;
  leadTimeDays: string;
  preferredSourceLocationId: string;
  preferredSupplierId: string;
}

const emptyForm: PolicyFormState = {
  inventoryItemId: '',
  scope: 'LOCATION',
  locationId: '',
  reorderPoint: '5',
  safetyStock: '0',
  targetStock: '10',
  leadTimeDays: '',
  preferredSourceLocationId: '',
  preferredSupplierId: '',
};

function formFrom(
  policy?: ReplenishmentPolicyDto,
  recommendation?: ReplenishmentRecommendationDto,
): PolicyFormState {
  if (policy)
    return {
      inventoryItemId: policy.inventoryItemId,
      scope: policy.locationId ? 'LOCATION' : 'ITEM',
      locationId: policy.locationId ?? '',
      reorderPoint: policy.reorderPoint,
      safetyStock: policy.safetyStock,
      targetStock: policy.targetStock,
      leadTimeDays: policy.leadTimeDays === null ? '' : String(policy.leadTimeDays),
      preferredSourceLocationId: policy.preferredSourceLocationId ?? '',
      preferredSupplierId: policy.preferredSupplierId ?? '',
    };
  if (recommendation)
    return {
      ...emptyForm,
      inventoryItemId: recommendation.inventoryItemId,
      locationId: recommendation.locationId,
      reorderPoint: recommendation.reorderPoint,
      safetyStock: recommendation.safetyStock,
      targetStock: recommendation.targetStock,
    };
  return emptyForm;
}

export function ReplenishmentPolicyDialog({
  open,
  onOpenChange,
  policy,
  recommendation,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly policy?: ReplenishmentPolicyDto | undefined;
  readonly recommendation?: ReplenishmentRecommendationDto | undefined;
  readonly onSaved: (policy: ReplenishmentPolicyDto) => void;
}) {
  const [form, setForm] = useState<PolicyFormState>(() => formFrom(policy, recommendation));
  const [items, setItems] = useState<readonly InventoryItemChoiceDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [suppliers, setSuppliers] = useState<readonly SupplierDto[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(formFrom(policy, recommendation));
    setError('');
    const controller = new AbortController();
    setLoadingReferences(true);
    Promise.all([
      inventoryRequest<{ data: PaginatedDto<InventoryItemChoiceDto> }>(
        '/inventory/items?catalogStatus=ACTIVE&limit=100',
        { signal: controller.signal },
      ),
      inventoryRequest<{ data: readonly WarehouseLocationDto[] }>('/warehouse/locations', {
        signal: controller.signal,
      }),
      inventoryRequest<{ data: readonly SupplierDto[] }>('/suppliers?pageSize=100', {
        signal: controller.signal,
      }),
    ])
      .then(([itemResponse, locationResponse, supplierResponse]) => {
        if (controller.signal.aborted) return;
        setItems(itemResponse.data.items);
        setLocations(
          locationResponse.data.filter(
            (location) =>
              location.status === 'ACTIVE' && location.capabilities.includes('STOCK_HOLDING'),
          ),
        );
        setSuppliers(supplierResponse.data.filter((supplier) => supplier.status === 'ACTIVE'));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : 'Reference data could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReferences(false);
      });
    return () => controller.abort();
  }, [open, policy, recommendation]);

  const destinationId = form.scope === 'LOCATION' ? form.locationId : '';
  const sourceLocations = useMemo(
    () => locations.filter((location) => location.id !== destinationId),
    [destinationId, locations],
  );

  function update<Key extends keyof PolicyFormState>(key: Key, value: PolicyFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.inventoryItemId) return setError('Choose an inventory item.');
    if (form.scope === 'LOCATION' && !form.locationId)
      return setError('Choose the destination location for this override.');
    if (Number(form.targetStock) < Number(form.reorderPoint))
      return setError('Target stock must be at least the reorder point.');
    if (Number(form.targetStock) < Number(form.safetyStock))
      return setError('Target stock must be at least the safety stock.');

    setSaving(true);
    try {
      const saved = await saveReplenishmentPolicy({
        inventoryItemId: form.inventoryItemId,
        locationId: form.scope === 'LOCATION' ? form.locationId : null,
        reorderPoint: form.reorderPoint,
        safetyStock: form.safetyStock,
        targetStock: form.targetStock,
        leadTimeDays: form.leadTimeDays === '' ? null : Number(form.leadTimeDays),
        preferredSourceLocationId: form.preferredSourceLocationId || null,
        preferredSupplierId: form.preferredSupplierId || null,
        expectedVersion: policy?.version ?? 0,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The policy could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] rounded-none p-4 sm:h-auto sm:max-h-[min(48rem,calc(100dvh-2rem))] sm:max-w-2xl sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{policy ? 'Edit replenishment policy' : 'Create replenishment policy'}</DialogTitle>
          <DialogDescription>
            Set when stock needs attention, the recovery target, and the preferred operational handoff.
          </DialogDescription>
        </DialogHeader>
        <form id="replenishment-policy-form" onSubmit={submit} className="min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-5 py-1 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="policy-item">Inventory item</FieldLabel>
              <NativeSelect
                id="policy-item"
                className="w-full"
                value={form.inventoryItemId}
                disabled={Boolean(policy) || loadingReferences}
                onChange={(event) => update('inventoryItemId', event.target.value)}
                required
              >
                <NativeSelectOption value="">Choose a SKU</NativeSelectOption>
                {items.map((item) => (
                  <NativeSelectOption key={item.inventoryItemId} value={item.inventoryItemId}>
                    {item.sku} · {item.productTitle}{item.optionSummary ? ` · ${item.optionSummary}` : ''}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="policy-scope">Policy scope</FieldLabel>
              <NativeSelect
                id="policy-scope"
                className="w-full"
                value={form.scope}
                disabled={Boolean(policy)}
                onChange={(event) => update('scope', event.target.value as 'ITEM' | 'LOCATION')}
              >
                <NativeSelectOption value="LOCATION">One location</NativeSelectOption>
                <NativeSelectOption value="ITEM">All locations without an override</NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="policy-location">Destination location</FieldLabel>
              <NativeSelect
                id="policy-location"
                className="w-full"
                value={form.locationId}
                disabled={form.scope === 'ITEM' || Boolean(policy) || loadingReferences}
                onChange={(event) => update('locationId', event.target.value)}
                required={form.scope === 'LOCATION'}
              >
                <NativeSelectOption value="">
                  {form.scope === 'ITEM' ? 'Inherited by all locations' : 'Choose a location'}
                </NativeSelectOption>
                {locations.map((location) => (
                  <NativeSelectOption key={location.id} value={location.id}>
                    {location.name} · {location.code}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="policy-reorder">Reorder point</FieldLabel>
              <Input id="policy-reorder" inputMode="decimal" min="0" step="0.000001" type="number" value={form.reorderPoint} onChange={(event) => update('reorderPoint', event.target.value)} required />
              <FieldDescription>Recommendations start below this projected quantity.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="policy-safety">Safety stock</FieldLabel>
              <Input id="policy-safety" inputMode="decimal" min="0" step="0.000001" type="number" value={form.safetyStock} onChange={(event) => update('safetyStock', event.target.value)} required />
              <FieldDescription>Protected buffer used when setting the target.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="policy-target">Target stock</FieldLabel>
              <Input id="policy-target" inputMode="decimal" min="0" step="0.000001" type="number" value={form.targetStock} onChange={(event) => update('targetStock', event.target.value)} required />
              <FieldDescription>The recommendation restores projected stock to this level.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="policy-lead">Lead time (days)</FieldLabel>
              <Input id="policy-lead" inputMode="numeric" min="0" step="1" type="number" value={form.leadTimeDays} onChange={(event) => update('leadTimeDays', event.target.value)} placeholder="Optional" />
              <FieldDescription>Operational context; it does not create an order automatically.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="policy-source">Preferred transfer source</FieldLabel>
              <NativeSelect id="policy-source" className="w-full" value={form.preferredSourceLocationId} onChange={(event) => update('preferredSourceLocationId', event.target.value)} disabled={loadingReferences}>
                <NativeSelectOption value="">No preferred source</NativeSelectOption>
                {sourceLocations.map((location) => (
                  <NativeSelectOption key={location.id} value={location.id}>{location.name} · {location.code}</NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>Suggested only when this location has genuine surplus.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="policy-supplier">Fallback supplier</FieldLabel>
              <NativeSelect id="policy-supplier" className="w-full" value={form.preferredSupplierId} onChange={(event) => update('preferredSupplierId', event.target.value)} disabled={loadingReferences}>
                <NativeSelectOption value="">No preferred supplier</NativeSelectOption>
                {suppliers.map((supplier) => (
                  <NativeSelectOption key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.code}</NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>Used when transfer surplus is insufficient.</FieldDescription>
            </Field>
          </div>
          {loadingReferences ? (
            <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading items, locations, and suppliers…</p>
          ) : null}
          <FieldError className="pt-2">{error}</FieldError>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="replenishment-policy-form" disabled={saving || loadingReferences}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {policy ? 'Save policy' : 'Create policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
