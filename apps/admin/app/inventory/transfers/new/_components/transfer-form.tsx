'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Save,
  ArrowLeft,
  Plus,
  Loader2,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { InventoryRequestError, inventoryRequest } from '@/lib/inventory/api';
import type {
  WarehouseLocationDto,
  InventoryBalanceDto,
  WarehouseTransferDetailDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { OperationalFeedback } from '@/components/operational-worklist';
import { TransferLineRow } from '@/components/inventory/transfer-line-row';
import { TransferRoutingCard } from '@/components/inventory/transfer-routing-card';

const lineSchema = z.object({
  variantId: z.string().min(1, 'Item selection is required'),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Enter a positive whole-unit quantity')
    .refine((val) => Number(val) > 0, 'Quantity must be greater than 0'),
});

const formSchema = z
  .object({
    sourceLocationId: z.string().min(1, 'Source location is required'),
    destinationLocationId: z.string().min(1, 'Destination location is required'),
    notes: z.string().optional(),
    lines: z.array(lineSchema).min(1, 'At least one line item is required'),
  })
  .refine((data) => data.sourceLocationId !== data.destinationLocationId, {
    message: 'Source and destination facilities must be different',
    path: ['destinationLocationId'],
  })
  .refine(
    (data) => {
      const ids = data.lines.map((l) => l.variantId).filter(Boolean);
      return new Set(ids).size === ids.length;
    },
    {
      message: 'Each product variant can only appear once in a transfer draft',
      path: ['lines'],
    },
  );

type FormValues = z.infer<typeof formSchema>;

export function TransferForm({
  transferId,
  initialVariantId,
  initialSourceLocationId,
  initialDestinationLocationId,
  initialQuantity,
}: {
  transferId?: string | undefined;
  initialVariantId?: string | undefined;
  initialSourceLocationId?: string | undefined;
  initialDestinationLocationId?: string | undefined;
  initialQuantity?: string | undefined;
}) {
  const router = useRouter();
  const isEditing = Boolean(transferId);
  const commandAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);

  // Data fetching state
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [selectedStockByVariant, setSelectedStockByVariant] = useState<
    Record<string, InventoryBalanceDto>
  >({});

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sourceLocationId: '',
      destinationLocationId: initialDestinationLocationId ?? '',
      notes: '',
      lines: [
        {
          variantId: '',
          quantity: initialQuantity && Number(initialQuantity) > 0 ? initialQuantity : '1',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const sourceLocationId = form.watch('sourceLocationId');
  const destinationLocationId = form.watch('destinationLocationId');
  const watchLines = form.watch('lines');

  // Filter facilities based on operational capabilities
  const sourceLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.status === 'ACTIVE' && location.capabilities.includes('TRANSFER_SEND'),
      ),
    [locations],
  );

  const destinationLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.status === 'ACTIVE' &&
          location.capabilities.includes('TRANSFER_RECEIVE') &&
          location.id !== sourceLocationId,
      ),
    [locations, sourceLocationId],
  );

  // Calculate totals
  const totalUnits = useMemo(() => {
    return watchLines.reduce((acc, line) => {
      const q = Number(line?.quantity);
      return acc + (Number.isFinite(q) && q > 0 ? q : 0);
    }, 0);
  }, [watchLines]);

  // Load existing draft if editing
  useEffect(() => {
    if (!transferId) return;
    let active = true;
    inventoryRequest<{ data: WarehouseTransferDetailDto }>(`/warehouse/transfers/${transferId}`)
      .then((response) => {
        if (!active) return;
        const transfer = response.data;
        if (transfer.status !== 'DRAFT') {
          setErrorMessage('Only a current draft can be edited.');
          return;
        }
        setDraftVersion(transfer.version);
        form.reset({
          sourceLocationId: transfer.sourceLocationId,
          destinationLocationId: transfer.destinationLocationId,
          notes: transfer.notes ?? '',
          lines: transfer.lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.requestedQuantity,
          })),
        });
      })
      .catch((err) => {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      active = false;
    };
  }, [form, transferId]);

  // Fetch locations on mount
  useEffect(() => {
    let mounted = true;
    const fetchLocations = async () => {
      try {
        const response = await inventoryRequest<{ data: WarehouseLocationDto[] }>(
          '/warehouse/locations',
        );
        if (mounted) {
          setLocations(response.data || []);
          if (
            !transferId &&
            initialSourceLocationId &&
            response.data.some((location) => location.id === initialSourceLocationId)
          ) {
            form.setValue('sourceLocationId', initialSourceLocationId);
            if (initialVariantId) {
              form.setValue('lines.0.variantId', initialVariantId, { shouldValidate: true });
            }
          }
          setIsLoadingLocations(false);
        }
      } catch (err) {
        if (mounted) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setIsLoadingLocations(false);
        }
      }
    };
    fetchLocations();
    return () => {
      mounted = false;
    };
  }, [form, initialSourceLocationId, initialVariantId, transferId]);

  // Handle source location change with safety check
  const handleSourceLocationChange = (newSourceId: string | null) => {
    if (!newSourceId) return;
    const hasConfiguredItems = watchLines.some((l) => Boolean(l.variantId));
    if (
      hasConfiguredItems &&
      sourceLocationId &&
      newSourceId !== sourceLocationId &&
      !window.confirm('Changing source warehouse will reset your selected items. Continue?')
    ) {
      return;
    }

    form.setValue('sourceLocationId', newSourceId, { shouldValidate: true });
    // If destination was set to same location, clear destination
    if (form.getValues('destinationLocationId') === newSourceId) {
      form.setValue('destinationLocationId', '');
    }
    // Reset lines to blank single row
    form.setValue('lines', [{ variantId: '', quantity: '1' }]);
    setSelectedStockByVariant({});
  };

  const onSubmit = async (values: FormValues) => {
    setErrorMessage(null);
    setIsConflict(false);

    // Dynamic stock ceiling check
    for (const [i, line] of values.lines.entries()) {
      if (!line) continue;
      const stockItem = selectedStockByVariant[line.variantId];
      if (!stockItem) {
        form.setError(`lines.${i}.variantId`, {
          type: 'manual',
          message: 'Wait for this item to be verified against current source stock.',
        });
        return;
      }
      if (stockItem && Number(line.quantity) > Number(stockItem.availableToSell)) {
        form.setError(`lines.${i}.quantity`, {
          type: 'manual',
          message: `Only ${stockItem.availableToSell} units available at source depot.`,
        });
        return;
      }
    }

    try {
      const payload = {
        ...(isEditing ? { version: draftVersion } : {}),
        sourceLocationId: values.sourceLocationId,
        destinationLocationId: values.destinationLocationId,
        notes: values.notes?.trim() || null,
        lines: values.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
        })),
      };
      const fingerprint = JSON.stringify(payload);
      if (commandAttempt.current?.fingerprint !== fingerprint) {
        commandAttempt.current = {
          fingerprint,
          key: `transfer-draft-${transferId ?? 'new'}-${draftVersion ?? 0}-${crypto.randomUUID()}`,
        };
      }
      const result = await inventoryRequest<{ data: { transferId: string; version: number } }>(
        isEditing ? `/warehouse/transfers/${transferId}` : '/warehouse/transfers',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'idempotency-key': commandAttempt.current.key },
          body: fingerprint,
        },
      );

      router.push(`/inventory/transfers/${result.data.transferId}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsConflict(err instanceof InventoryRequestError && err.status === 409);
    }
  };

  // Collect already selected variant IDs to prevent duplicates in other lines
  const selectedVariantIds = useMemo(
    () => new Set(watchLines.map((l) => l?.variantId).filter(Boolean)),
    [watchLines],
  );

  return (
    <main className="mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Transfers', href: '/inventory/transfers' },
          { label: isEditing ? 'Edit Transfer Draft' : 'Create Transfer', current: true },
        ]}
      />

      {/* Header Bar */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            type="button"
            className="size-8 shrink-0"
            render={<Link href="/inventory/transfers" />}
            title="Back to transfers"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isEditing ? 'Edit Transfer Draft' : 'Create Transfer'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Move inventory stock between warehouse and fulfillment facilities.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            type="button"
            render={<Link href="/inventory/transfers" />}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            form="transfer-form"
            disabled={
              form.formState.isSubmitting ||
              (isEditing && draftVersion === null) ||
              !sourceLocationId ||
              !destinationLocationId ||
              fields.length === 0
            }
            className="min-w-28"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="mr-1.5 size-3.5" />
                {isEditing ? 'Save Draft' : 'Create Transfer'}
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Error banner */}
      {errorMessage ? (
        <div className="space-y-2">
          <OperationalFeedback tone="danger">{errorMessage}</OperationalFeedback>
          {isConflict && isEditing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload current draft
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Capability Warning if no facilities configured */}
      {!isLoadingLocations &&
      (sourceLocations.length === 0 || destinationLocations.length === 0) ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/10 p-3.5 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold leading-none">Operational Capability Notice</p>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              Stock transfers require active facilities configured with{' '}
              <strong className="text-foreground font-mono text-[11px]">TRANSFER_SEND</strong> and{' '}
              <strong className="text-foreground font-mono text-[11px]">TRANSFER_RECEIVE</strong>{' '}
              capabilities. Check{' '}
              <Link href="/inventory/warehouses" className="text-primary underline font-medium">
                Warehouse Locations
              </Link>{' '}
              if a facility is missing from either list.
            </p>
          </div>
        </div>
      ) : null}

      <form
        id="transfer-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        <TransferRoutingCard
          sourceLocationId={sourceLocationId}
          destinationLocationId={destinationLocationId}
          sourceLocations={sourceLocations}
          destinationLocations={destinationLocations}
          loading={isLoadingLocations}
          sourceError={form.formState.errors.sourceLocationId?.message}
          destinationError={form.formState.errors.destinationLocationId?.message}
          notesError={form.formState.errors.notes?.message}
          notesInputProps={form.register('notes')}
          onSourceChange={handleSourceLocationChange}
          onDestinationChange={(value) =>
            form.setValue('destinationLocationId', value ?? '', { shouldValidate: true })
          }
        />

        {/* Line Items Card */}
        <Card className="shadow-xs">
          <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Stock Line Items</CardTitle>
                <Badge variant="secondary" className="text-[11px] font-normal px-2">
                  {fields.length} {fields.length === 1 ? 'line' : 'lines'} · {totalUnits} units
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                Select items physically present and available to sell at the origin depot.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ variantId: '', quantity: '1' })}
              disabled={!sourceLocationId}
              className="h-8 text-xs shrink-0 self-start sm:self-auto"
            >
              <Plus className="mr-1.5 size-3.5" /> Add Line
            </Button>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
            {/* Global line items validation error */}
            {form.formState.errors.lines?.root?.message || form.formState.errors.lines?.message ? (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs font-medium text-destructive">
                {form.formState.errors.lines?.root?.message || form.formState.errors.lines?.message}
              </p>
            ) : null}

            {!sourceLocationId ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
                <Package className="size-8 stroke-1 text-muted-foreground/60 mb-2" />
                <p className="font-medium text-foreground">No Source Location Selected</p>
                <p className="mt-1 max-w-sm">
                  Choose an origin facility above to browse available inventory stock ready for
                  dispatch.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const lineVariantId = form.watch(`lines.${index}.variantId`);
                  const selectedStockItem = selectedStockByVariant[lineVariantId];
                  const isDuplicate =
                    Boolean(lineVariantId) &&
                    watchLines.filter((l) => l?.variantId === lineVariantId).length > 1;

                  return (
                    <TransferLineRow
                      key={field.id}
                      index={index}
                      sourceLocationId={sourceLocationId}
                      variantId={lineVariantId}
                      selectedStockItem={selectedStockItem}
                      selectedVariantIds={selectedVariantIds}
                      quantityInputProps={form.register(`lines.${index}.quantity`)}
                      variantError={form.formState.errors.lines?.[index]?.variantId?.message}
                      quantityError={form.formState.errors.lines?.[index]?.quantity?.message}
                      duplicate={isDuplicate}
                      removable={fields.length > 1}
                      onVariantChange={(item) => {
                        form.setValue(`lines.${index}.variantId`, item?.variantId ?? '', {
                          shouldValidate: true,
                          shouldDirty: true,
                        });
                        if (item) {
                          setSelectedStockByVariant((current) => ({
                            ...current,
                            [item.variantId]: item,
                          }));
                        }
                      }}
                      onItemResolved={(item) => {
                        setSelectedStockByVariant((current) => ({
                          ...current,
                          [item.variantId]: item,
                        }));
                        form.clearErrors(`lines.${index}.variantId`);
                      }}
                      onResolutionError={(message) =>
                        form.setError(`lines.${index}.variantId`, { type: 'manual', message })
                      }
                      onSetMaximum={() => {
                        if (!selectedStockItem) return;
                        form.setValue(
                          `lines.${index}.quantity`,
                          selectedStockItem.availableToSell,
                          { shouldValidate: true, shouldDirty: true },
                        );
                      }}
                      onRemove={() => remove(index)}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom Submission Bar */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {watchLines.filter((l) => Boolean(l.variantId)).length} items ready for transfer (
            {totalUnits} units)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              render={<Link href="/inventory/transfers" />}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                form.formState.isSubmitting ||
                (isEditing && draftVersion === null) ||
                !sourceLocationId ||
                !destinationLocationId ||
                fields.length === 0
              }
              className="min-w-28"
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="mr-1.5 size-3.5" />
                  {isEditing ? 'Save Draft' : 'Create Transfer'}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
