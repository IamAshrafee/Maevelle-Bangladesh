'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  ArrowRight,
  Package,
  AlertTriangle,
  Building2,
  Info,
} from 'lucide-react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { inventoryRequest } from '@/lib/inventory/api';
import type {
  WarehouseLocationDto,
  InventoryBalanceDto,
  PaginatedDto,
  WarehouseTransferDetailDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { OperationalFeedback } from '@/components/operational-worklist';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const lineSchema = z.object({
  variantId: z.string().min(1, 'Item selection is required'),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,6})?$/, 'Enter a valid positive number')
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
}: {
  transferId?: string | undefined;
  initialVariantId?: string | undefined;
  initialSourceLocationId?: string | undefined;
}) {
  const router = useRouter();
  const isEditing = Boolean(transferId);
  const commandKey = useRef(crypto.randomUUID());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);

  // Data fetching state
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [availableStock, setAvailableStock] = useState<InventoryBalanceDto[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sourceLocationId: '',
      destinationLocationId: '',
      notes: '',
      lines: [{ variantId: '', quantity: '1' }],
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

  const selectedSource = useMemo(
    () => locations.find((l) => l.id === sourceLocationId),
    [locations, sourceLocationId],
  );

  const selectedDestination = useMemo(
    () => locations.find((l) => l.id === destinationLocationId),
    [locations, destinationLocationId],
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
  }, [form, initialSourceLocationId, transferId]);

  // Fetch available transferable stock when source location changes
  useEffect(() => {
    let mounted = true;
    if (!sourceLocationId) {
      setAvailableStock([]);
      return;
    }

    const fetchStock = async () => {
      setIsLoadingStock(true);
      try {
        const response = await inventoryRequest<{ data: PaginatedDto<InventoryBalanceDto> }>(
          `/inventory/stock?locationId=${sourceLocationId}&availability=IN_STOCK&limit=100`,
        );
        if (mounted) {
          // Filter to items with strictly positive available-to-sell stock
          const transferableStock = (response.data?.items || []).filter(
            (item) => Number(item.availableToSell) > 0,
          );
          setAvailableStock(transferableStock);

          if (
            !transferId &&
            initialVariantId &&
            transferableStock.some((item) => item.variantId === initialVariantId) &&
            !form.getValues('lines.0.variantId')
          ) {
            form.setValue('lines.0.variantId', initialVariantId, { shouldValidate: true });
          }
          setIsLoadingStock(false);
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to fetch source stock:', err);
          setIsLoadingStock(false);
        }
      }
    };
    fetchStock();
    return () => {
      mounted = false;
    };
  }, [form, initialVariantId, sourceLocationId, transferId]);

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
  };

  const onSubmit = async (values: FormValues) => {
    setErrorMessage(null);

    // Dynamic stock ceiling check
    for (const [i, line] of values.lines.entries()) {
      if (!line) continue;
      const stockItem = availableStock.find((s) => s.variantId === line.variantId);
      if (stockItem && Number(line.quantity) > Number(stockItem.availableToSell)) {
        form.setError(`lines.${i}.quantity`, {
          type: 'manual',
          message: `Only ${stockItem.availableToSell} units available at source depot.`,
        });
        return;
      }
    }

    try {
      const result = await inventoryRequest<{ data: { transferId: string; version: number } }>(
        isEditing ? `/warehouse/transfers/${transferId}` : '/warehouse/transfers',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'idempotency-key': commandKey.current },
          body: JSON.stringify({
            ...(isEditing ? { version: draftVersion } : {}),
            sourceLocationId: values.sourceLocationId,
            destinationLocationId: values.destinationLocationId,
            notes: values.notes?.trim() || null,
            lines: values.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          }),
        },
      );

      router.push(`/inventory/transfers/${result.data.transferId}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
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
        <OperationalFeedback tone="danger">{errorMessage}</OperationalFeedback>
      ) : null}

      {/* Capability Warning if no facilities configured */}
      {!isLoadingLocations && (sourceLocations.length === 0 || destinationLocations.length === 0) ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
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
        {/* Transfer Details Card */}
        <Card className="shadow-xs">
          <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3">
            <CardTitle className="text-base font-semibold">Transfer Routing</CardTitle>
            <CardDescription className="text-xs">
              Select origin and destination depots. Dispatches must originate from a stock-holding
              source.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Source Facility */}
              <div className="space-y-1.5">
                <Label htmlFor="source-location" className="text-xs font-medium">
                  Source Location (Origin) <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={sourceLocationId}
                  onValueChange={handleSourceLocationChange}
                  disabled={isLoadingLocations}
                >
                  <SelectTrigger id="source-location" className="h-9 text-sm">
                    <SelectValue
                      placeholder={isLoadingLocations ? 'Loading locations…' : 'Select origin depot'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceLocations.map((loc) => (
                      <SelectItem
                        key={loc.id}
                        value={loc.id}
                        label={`${loc.name} (${loc.code})`}
                        description={`${loc.locationType.replace('_', ' ')} · ${loc.status}`}
                      >
                        {loc.name}{' '}
                        <span className="text-muted-foreground ml-1 font-mono text-xs">
                          ({loc.code})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.sourceLocationId ? (
                  <p className="text-[11px] font-medium text-destructive">
                    {form.formState.errors.sourceLocationId.message}
                  </p>
                ) : null}
              </div>

              {/* Destination Facility */}
              <div className="space-y-1.5">
                <Label htmlFor="destination-location" className="text-xs font-medium">
                  Destination Location <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={destinationLocationId}
                  onValueChange={(val) =>
                    form.setValue('destinationLocationId', val || '', { shouldValidate: true })
                  }
                  disabled={isLoadingLocations || !sourceLocationId}
                >
                  <SelectTrigger id="destination-location" className="h-9 text-sm">
                    <SelectValue
                      placeholder={
                        !sourceLocationId
                          ? 'Select source location first'
                          : isLoadingLocations
                            ? 'Loading locations…'
                            : 'Select receiving facility'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationLocations.map((loc) => (
                      <SelectItem
                        key={loc.id}
                        value={loc.id}
                        label={`${loc.name} (${loc.code})`}
                        description={`${loc.locationType.replace('_', ' ')} · ${loc.status}`}
                      >
                        {loc.name}{' '}
                        <span className="text-muted-foreground ml-1 font-mono text-xs">
                          ({loc.code})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.destinationLocationId ? (
                  <p className="text-[11px] font-medium text-destructive">
                    {form.formState.errors.destinationLocationId.message}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Route Summary Pill */}
            {selectedSource && selectedDestination ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2.5 text-xs">
                <div className="flex items-center gap-1.5 font-medium">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  <span>{selectedSource.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ({selectedSource.code})
                  </span>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground mx-1 shrink-0" />
                <div className="flex items-center gap-1.5 font-medium">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  <span>{selectedDestination.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ({selectedDestination.code})
                  </span>
                </div>
              </div>
            ) : null}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="transfer-notes" className="text-xs font-medium">
                Dispatch Notes & Instructions
              </Label>
              <Textarea
                id="transfer-notes"
                placeholder="Optional carrier instructions, reason for transfer, or consignment reference"
                rows={2}
                className="text-sm"
                {...form.register('notes')}
              />
              {form.formState.errors.notes ? (
                <p className="text-[11px] font-medium text-destructive">
                  {form.formState.errors.notes.message}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

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
              disabled={!sourceLocationId || isLoadingStock || availableStock.length === 0}
              className="h-8 text-xs shrink-0 self-start sm:self-auto"
            >
              <Plus className="mr-1.5 size-3.5" /> Add Line
            </Button>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
            {/* Global line items validation error */}
            {form.formState.errors.lines?.root?.message ||
            form.formState.errors.lines?.message ? (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs font-medium text-destructive">
                {form.formState.errors.lines?.root?.message ||
                  form.formState.errors.lines?.message}
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
            ) : isLoadingStock ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Loading transferable
                stock…
              </div>
            ) : availableStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
                <Package className="size-8 stroke-1 text-muted-foreground/60 mb-2" />
                <p className="font-medium text-foreground">No Stock Available for Transfer</p>
                <p className="mt-1 max-w-sm">
                  {selectedSource?.name} currently has zero items with positive available-to-sell
                  balance.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const lineVariantId = form.watch(`lines.${index}.variantId`);
                  const selectedStockItem = availableStock.find(
                    (s) => s.variantId === lineVariantId,
                  );
                  const isDuplicate =
                    Boolean(lineVariantId) &&
                    watchLines.filter((l) => l?.variantId === lineVariantId).length > 1;

                  return (
                    <div
                      key={field.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        isDuplicate ? 'border-destructive/40 bg-destructive/[0.02]' : 'bg-card'
                      }`}
                    >
                      {/* Desktop Layout */}
                      <div className="hidden sm:grid sm:grid-cols-12 sm:items-start sm:gap-3">
                        {/* Item Select (col-span-7) */}
                        <div className="sm:col-span-7 space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium">
                              Item #{index + 1} <span className="text-destructive">*</span>
                            </Label>
                            {selectedStockItem ? (
                              <span className="text-[11px] text-muted-foreground">
                                Stock: {selectedStockItem.availableToSell} avail.
                              </span>
                            ) : null}
                          </div>
                          <Select
                            value={lineVariantId}
                            onValueChange={(val) =>
                              form.setValue(`lines.${index}.variantId`, val || '', {
                                shouldValidate: true,
                              })
                            }
                            disabled={isLoadingStock}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select product variant to transfer" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableStock.map((stock) => {
                                const isAlreadyUsed =
                                  selectedVariantIds.has(stock.variantId) &&
                                  stock.variantId !== lineVariantId;
                                return (
                                  <SelectItem
                                    key={stock.variantId}
                                    value={stock.variantId}
                                    label={`${stock.productTitle} — ${stock.sku}`}
                                    description={`${stock.availableToSell} available at origin depot${
                                      isAlreadyUsed ? ' · (Already in transfer)' : ''
                                    }`}
                                    disabled={isAlreadyUsed}
                                  >
                                    {stock.productTitle}
                                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                                      {stock.sku}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {form.formState.errors.lines?.[index]?.variantId ? (
                            <p className="text-[11px] font-medium text-destructive">
                              {form.formState.errors.lines[index]?.variantId?.message}
                            </p>
                          ) : null}
                        </div>

                        {/* Quantity (col-span-4) */}
                        <div className="sm:col-span-4 space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium">
                              Qty <span className="text-destructive">*</span>
                            </Label>
                            {selectedStockItem ? (
                              <button
                                type="button"
                                onClick={() =>
                                  form.setValue(
                                    `lines.${index}.quantity`,
                                    String(selectedStockItem.availableToSell),
                                    { shouldValidate: true },
                                  )
                                }
                                className="text-[11px] text-primary hover:underline font-medium"
                                title="Set quantity to maximum available units"
                              >
                                Max ({selectedStockItem.availableToSell})
                              </button>
                            ) : null}
                          </div>
                          <Input
                            type="number"
                            min="1"
                            step="any"
                            placeholder="1"
                            disabled={!lineVariantId}
                            className="h-9 text-xs font-mono"
                            {...form.register(`lines.${index}.quantity`)}
                          />
                          {form.formState.errors.lines?.[index]?.quantity ? (
                            <p className="text-[11px] font-medium text-destructive">
                              {form.formState.errors.lines[index]?.quantity?.message}
                            </p>
                          ) : null}
                        </div>

                        {/* Remove Action (col-span-1) */}
                        <div className="sm:col-span-1 pt-6 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title={
                              fields.length === 1
                                ? 'A transfer requires at least one line'
                                : 'Remove line item'
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Mobile Layout */}
                      <div className="sm:hidden space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[11px] font-normal">
                            Line #{index + 1}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Remove line item"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium">
                            Product Variant <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={lineVariantId}
                            onValueChange={(val) =>
                              form.setValue(`lines.${index}.variantId`, val || '', {
                                shouldValidate: true,
                              })
                            }
                            disabled={isLoadingStock}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select product variant" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableStock.map((stock) => {
                                const isAlreadyUsed =
                                  selectedVariantIds.has(stock.variantId) &&
                                  stock.variantId !== lineVariantId;
                                return (
                                  <SelectItem
                                    key={stock.variantId}
                                    value={stock.variantId}
                                    label={`${stock.productTitle} — ${stock.sku}`}
                                    description={`${stock.availableToSell} available`}
                                    disabled={isAlreadyUsed}
                                  >
                                    {stock.productTitle}
                                    <span className="text-muted-foreground ml-1 font-mono text-[11px]">
                                      {stock.sku}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {form.formState.errors.lines?.[index]?.variantId ? (
                            <p className="text-[11px] font-medium text-destructive">
                              {form.formState.errors.lines[index]?.variantId?.message}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs font-medium">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              step="any"
                              placeholder="1"
                              disabled={!lineVariantId}
                              className="h-9 text-xs font-mono"
                              {...form.register(`lines.${index}.quantity`)}
                            />
                          </div>
                          {selectedStockItem ? (
                            <div className="flex flex-col items-end justify-center pt-5">
                              <button
                                type="button"
                                onClick={() =>
                                  form.setValue(
                                    `lines.${index}.quantity`,
                                    String(selectedStockItem.availableToSell),
                                    { shouldValidate: true },
                                  )
                                }
                                className="text-xs text-primary font-medium hover:underline"
                              >
                                Max ({selectedStockItem.availableToSell})
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {form.formState.errors.lines?.[index]?.quantity ? (
                          <p className="text-[11px] font-medium text-destructive">
                            {form.formState.errors.lines[index]?.quantity?.message}
                          </p>
                        ) : null}
                      </div>

                      {/* Duplicate error feedback */}
                      {isDuplicate ? (
                        <p className="mt-2 text-[11px] font-medium text-destructive">
                          Duplicate SKU: This item is already added in another line. Each variant may
                          only appear once in a transfer draft.
                        </p>
                      ) : null}
                    </div>
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
