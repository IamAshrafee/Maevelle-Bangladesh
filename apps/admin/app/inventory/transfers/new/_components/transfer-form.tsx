'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const lineSchema = z.object({
  variantId: z.string().min(1, 'Item is required'),
  quantity: z.string().regex(/^\d+$/, 'Enter a whole number of units'),
});

const formSchema = z
  .object({
    sourceLocationId: z.string().min(1, 'Source location is required'),
    destinationLocationId: z.string().min(1, 'Destination location is required'),
    notes: z.string().optional(),
    lines: z.array(lineSchema).min(1, 'At least one line item is required'),
  })
  .refine((data) => data.sourceLocationId !== data.destinationLocationId, {
    message: 'Source and destination locations cannot be the same',
    path: ['destinationLocationId'],
  });

type FormValues = z.infer<typeof formSchema>;

export function TransferForm({
  transferId,
  initialVariantId,
  initialSourceLocationId,
}: {
  transferId?: string;
  initialVariantId?: string | undefined;
  initialSourceLocationId?: string | undefined;
}) {
  const router = useRouter();
  const isEditing = Boolean(transferId);
  const commandKey = useRef(crypto.randomUUID());
  const [error, setError] = useState<Error | null>(null);
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
  const sourceLocations = locations.filter(
    (location) => location.status === 'ACTIVE' && location.capabilities.includes('TRANSFER_SEND'),
  );
  const destinationLocations = locations.filter(
    (location) =>
      location.status === 'ACTIVE' &&
      location.capabilities.includes('TRANSFER_RECEIVE') &&
      location.id !== sourceLocationId,
  );

  useEffect(() => {
    if (!transferId) return;
    let active = true;
    inventoryRequest<{ data: WarehouseTransferDetailDto }>(`/warehouse/transfers/${transferId}`)
      .then((response) => {
        if (!active) return;
        const transfer = response.data;
        if (transfer.status !== 'DRAFT') {
          setError(new Error('Only a current draft can be edited.'));
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
      .catch((err) => active && setError(err instanceof Error ? err : new Error(String(err))));
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
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoadingLocations(false);
        }
      }
    };
    fetchLocations();
    return () => {
      mounted = false;
    };
  }, [form, initialSourceLocationId, transferId]);

  // Fetch available stock when source location changes
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
          `/inventory/stock?locationId=${sourceLocationId}&limit=100`,
        );
        if (mounted) {
          // Only show items that actually have physical stock available to transfer
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

  const onSubmit = async (values: FormValues) => {
    setError(null);

    // Validate quantities against available stock dynamically
    for (const [i, line] of values.lines.entries()) {
      if (!line) continue;
      const stockItem = availableStock.find((s) => s.variantId === line.variantId);
      if (stockItem && Number(line.quantity) > Number(stockItem.availableToSell)) {
        form.setError(`lines.${i}.quantity`, {
          type: 'manual',
          message: `Only ${stockItem.availableToSell} available at source.`,
        });
        return;
      }
    }

    try {
      // Create new transfer
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
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          type="button"
          onClick={() => router.push('/inventory/transfers')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">
            {isEditing ? 'Edit Transfer Draft' : 'Create Transfer'}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Move stock between warehouse locations.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
          {error.message}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Transfer Details</CardTitle>
            <CardDescription>Select the source and destination for this transfer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="source">
                  Source Location <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={sourceLocationId}
                  onValueChange={(val) => {
                    form.setValue('sourceLocationId', val || '', { shouldValidate: true });
                    // Reset lines when source changes
                    form.setValue('lines', [{ variantId: '', quantity: '1' }]);
                  }}
                  disabled={isLoadingLocations}
                >
                  <SelectTrigger id="source">
                    <SelectValue
                      placeholder={isLoadingLocations ? 'Loading...' : 'Select source location'}
                    >
                      {sourceLocationId
                        ? locations.find((l) => l.id === sourceLocationId)?.name
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sourceLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.sourceLocationId && (
                  <p className="text-sm font-medium text-destructive">
                    {form.formState.errors.sourceLocationId.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destination">
                  Destination Location <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={destinationLocationId}
                  onValueChange={(val) =>
                    form.setValue('destinationLocationId', val || '', { shouldValidate: true })
                  }
                  disabled={isLoadingLocations}
                >
                  <SelectTrigger id="destination">
                    <SelectValue
                      placeholder={
                        isLoadingLocations ? 'Loading...' : 'Select destination location'
                      }
                    >
                      {destinationLocationId
                        ? locations.find((l) => l.id === destinationLocationId)?.name
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {destinationLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.destinationLocationId && (
                  <p className="text-sm font-medium text-destructive">
                    {form.formState.errors.destinationLocationId.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2 pt-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes for this transfer"
                rows={3}
                {...form.register('notes')}
              />
              {form.formState.errors.notes && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.notes.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Line Items</CardTitle>
              <CardDescription className="mt-1">
                Select items currently available at the source location.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ variantId: '', quantity: '1' })}
              disabled={!sourceLocationId || isLoadingStock}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Line
            </Button>
          </CardHeader>
          <CardContent>
            {!sourceLocationId ? (
              <div className="text-center py-6 text-muted-foreground border border-dashed rounded-md">
                Please select a source location first to view available stock.
              </div>
            ) : (
              <div className="space-y-4">
                {fields.map((field, index) => {
                  const lineVariantId = form.watch(`lines.${index}.variantId`);
                  const selectedStockItem = availableStock.find(
                    (s) => s.variantId === lineVariantId,
                  );

                  return (
                    <div key={field.id} className="flex gap-4 items-start">
                      <div className="flex-1 grid gap-2">
                        {index === 0 && (
                          <Label>
                            Item <span className="text-destructive">*</span>
                          </Label>
                        )}
                        <Select
                          value={lineVariantId}
                          onValueChange={(val) =>
                            form.setValue(`lines.${index}.variantId`, val || '', {
                              shouldValidate: true,
                            })
                          }
                          disabled={isLoadingStock}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                isLoadingStock ? 'Loading stock…' : 'Select item to transfer'
                              }
                            >
                              {lineVariantId
                                ? `${selectedStockItem?.productTitle ?? 'Item'} — ${selectedStockItem?.sku ?? ''}`
                                : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {availableStock.length === 0 ? (
                              <SelectItem value="empty" disabled>
                                No transferable stock at source
                              </SelectItem>
                            ) : (
                              availableStock.map((stock) => (
                                <SelectItem key={stock.variantId} value={stock.variantId}>
                                  {stock.productTitle}
                                  <span className="text-muted-foreground ml-2 font-mono text-xs">
                                    {stock.sku} · {stock.availableToSell} avail.
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {form.formState.errors.lines?.[index]?.variantId && (
                          <p className="text-sm font-medium text-destructive">
                            {form.formState.errors.lines[index]?.variantId?.message}
                          </p>
                        )}
                      </div>
                      <div className="w-32 grid gap-2">
                        {index === 0 && (
                          <Label>
                            Quantity <span className="text-destructive">*</span>
                          </Label>
                        )}
                        <Input
                          type="number"
                          min="1"
                          max={selectedStockItem ? selectedStockItem.availableToSell : undefined}
                          disabled={!lineVariantId}
                          {...form.register(`lines.${index}.quantity`)}
                        />
                        {form.formState.errors.lines?.[index]?.quantity && (
                          <p className="text-sm font-medium text-destructive">
                            {form.formState.errors.lines[index]?.quantity?.message}
                          </p>
                        )}
                      </div>
                      <div className={`pt-${index === 0 ? '7' : '0'}`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-8 flex justify-end">
              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  (isEditing && draftVersion === null) ||
                  !sourceLocationId ||
                  !destinationLocationId ||
                  fields.length === 0
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {form.formState.isSubmitting
                  ? isEditing
                    ? 'Saving…'
                    : 'Creating…'
                  : isEditing
                    ? 'Save Draft'
                    : 'Create Transfer'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
