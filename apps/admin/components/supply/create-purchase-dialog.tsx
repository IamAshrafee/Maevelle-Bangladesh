'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  Loader2,
  Package,
  Plus,
  Trash2,
} from 'lucide-react';

import type {
  ApiEnvelope,
  CatalogVariantChoiceDto,
  PurchaseDto,
  SupplierDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { PurchaseFormFields } from '@/components/supply/purchase-form-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSupplyMoney, supplyRequest } from '@/lib/supply/api';

export interface DraftPurchaseLine {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary: string;
  quantity: string;
  unitPrice: string;
}

export interface CreatePurchaseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly suppliers: readonly SupplierDto[];
  readonly locations: readonly WarehouseLocationDto[];
  readonly variants?: readonly CatalogVariantChoiceDto[];
  readonly defaultSupplierId?: string;
  readonly onSuccess?: (created: PurchaseDto) => void;
}

function removeUrlParams(...keys: string[]) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState({}, '', url.toString());
  }
}

export function CreatePurchaseDialog({
  open,
  onOpenChange,
  suppliers,
  locations,
  variants = [],
  defaultSupplierId = '',
  onSuccess,
}: CreatePurchaseDialogProps) {
  const router = useRouter();

  // Commercial & Header state
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [currencyCode, setCurrencyCode] = useState<'BDT' | 'CNY' | 'USD'>('CNY');
  const [orderDate, setOrderDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [expectedDate, setExpectedDate] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [supplierReference, setSupplierReference] = useState('');
  const [notes, setNotes] = useState('');

  // Inline Line Items state
  const [lines, setLines] = useState<DraftPurchaseLine[]>([]);
  const [addingVariantId, setAddingVariantId] = useState('');
  const [addingQuantity, setAddingQuantity] = useState('1');
  const [addingUnitPrice, setAddingUnitPrice] = useState('0');
  const [variantFilter, setVariantFilter] = useState('');

  // Workflow state
  const [openAfterCreate, setOpenAfterCreate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync default supplier when opened or when defaultSupplierId changes
  useEffect(() => {
    if (open) {
      const initialSupplierId =
        defaultSupplierId ||
        (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('supplier') || ''
          : '');
      if (initialSupplierId) {
        setSupplierId(initialSupplierId);
        const s = suppliers.find((item) => item.id === initialSupplierId);
        if (s?.preferredCurrencyCode) {
          setCurrencyCode(s.preferredCurrencyCode);
        }
        if (s?.leadTimeDays) {
          const date = new Date();
          date.setDate(date.getDate() + s.leadTimeDays);
          setExpectedDate(date.toISOString().slice(0, 10));
        }
      }
    }
  }, [open, defaultSupplierId, suppliers]);

  const activeVariants = useMemo(
    () => variants.filter((item) => item.status === 'ACTIVE'),
    [variants],
  );

  const filteredVariants = useMemo(() => {
    if (!variantFilter.trim()) return activeVariants;
    const q = variantFilter.trim().toLowerCase();
    return activeVariants.filter(
      (v) =>
        v.sku.toLowerCase().includes(q) ||
        v.productTitle.toLowerCase().includes(q) ||
        v.optionSummary?.toLowerCase().includes(q),
    );
  }, [activeVariants, variantFilter]);

  // Pending variant selection calculation
  const pendingVariant = useMemo(
    () => (addingVariantId ? activeVariants.find((v) => v.id === addingVariantId) : undefined),
    [addingVariantId, activeVariants],
  );

  const pendingAmount = useMemo(() => {
    if (!pendingVariant) return 0;
    const q = parseFloat(addingQuantity) || 0;
    const p = parseFloat(addingUnitPrice) || 0;
    return q * p;
  }, [pendingVariant, addingQuantity, addingUnitPrice]);

  // Running calculations (including both staged items and any pending item in inputs)
  const stagedAmount = useMemo(() => {
    return lines.reduce((acc, line) => {
      const q = parseFloat(line.quantity) || 0;
      const p = parseFloat(line.unitPrice) || 0;
      return acc + q * p;
    }, 0);
  }, [lines]);

  const totalAmount = stagedAmount + pendingAmount;
  const totalDraftCount = lines.length + (pendingVariant ? 1 : 0);

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      removeUrlParams('create', 'supplier');
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  function handleAddLine() {
    if (!addingVariantId) return;
    const variant = activeVariants.find((v) => v.id === addingVariantId);
    if (!variant) return;

    const parsedQty = parseFloat(addingQuantity);
    if (Number.isNaN(parsedQty) || parsedQty <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }

    const parsedPrice = parseFloat(addingUnitPrice);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Unit cost must be a non-negative number.');
      return;
    }

    // If already in lines, update quantity
    const existingIndex = lines.findIndex((l) => l.variantId === addingVariantId);
    if (existingIndex >= 0) {
      const updated = [...lines];
      const prevQty = parseFloat(updated[existingIndex]!.quantity) || 0;
      updated[existingIndex] = {
        ...updated[existingIndex]!,
        quantity: String(prevQty + parsedQty),
        unitPrice: addingUnitPrice,
      };
      setLines(updated);
    } else {
      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          variantId: variant.id,
          sku: variant.sku,
          productTitle: variant.productTitle,
          optionSummary: variant.optionSummary || '',
          quantity: addingQuantity,
          unitPrice: addingUnitPrice,
        },
      ]);
    }

    setAddingVariantId('');
    setAddingQuantity('1');
    setAddingUnitPrice('0');
    setError(null);
  }

  function handleRemoveLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateLine(index: number, updates: Partial<DraftPurchaseLine>) {
    setLines((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) {
      setError('Please select an active supplier.');
      return;
    }
    if (orderDate && expectedDate && expectedDate < orderDate) {
      setError('Expected delivery date cannot be before the order date.');
      return;
    }

    setSaving(true);
    setError(null);

    // Auto-commit any currently typed/selected variant in the inputs
    const allLinesToSubmit: DraftPurchaseLine[] = [...lines];
    if (addingVariantId) {
      const variant = activeVariants.find((v) => v.id === addingVariantId);
      if (variant) {
        const parsedQty = parseFloat(addingQuantity);
        const parsedPrice = parseFloat(addingUnitPrice);
        if (
          !Number.isNaN(parsedQty) &&
          parsedQty > 0 &&
          !Number.isNaN(parsedPrice) &&
          parsedPrice >= 0
        ) {
          const existingIndex = allLinesToSubmit.findIndex(
            (l) => l.variantId === addingVariantId,
          );
          if (existingIndex >= 0) {
            const prevQty =
              parseFloat(allLinesToSubmit[existingIndex]!.quantity) || 0;
            allLinesToSubmit[existingIndex] = {
              ...allLinesToSubmit[existingIndex]!,
              quantity: String(prevQty + parsedQty),
              unitPrice: addingUnitPrice,
            };
          } else {
            allLinesToSubmit.push({
              id: crypto.randomUUID(),
              variantId: variant.id,
              sku: variant.sku,
              productTitle: variant.productTitle,
              optionSummary: variant.optionSummary || '',
              quantity: addingQuantity,
              unitPrice: addingUnitPrice,
            });
          }
        }
      }
    }

    try {
      const payload = {
        supplierId,
        currencyCode,
        orderDate: orderDate || undefined,
        expectedDate: expectedDate || undefined,
        destinationLocationId: destinationLocationId || undefined,
        supplierReference: supplierReference.trim() || undefined,
        notes: notes.trim() || undefined,
        lines:
          allLinesToSubmit.length > 0
            ? allLinesToSubmit.map((l) => ({
                variantId: l.variantId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
              }))
            : undefined,
      };

      const result = await supplyRequest<ApiEnvelope<PurchaseDto>>(
        '/admin/purchases',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      removeUrlParams('create', 'supplier');
      handleClose(false);

      if (openAfterCreate && result?.data?.id) {
        router.push(`/purchases/${result.data.id}`);
      } else {
        onSuccess?.(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create purchase.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[92vh] w-full flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Package className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-lg font-semibold">
                Create purchase order
              </DialogTitle>
              <DialogDescription className="text-xs">
                Draft a supplier order, set expected dates, and optionally include initial product lines.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
          {/* Scrollable Form Body */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Section 1: Commercials & Vendor Context */}
            <PurchaseFormFields
              suppliers={suppliers}
              locations={locations}
              supplierId={supplierId}
              onSupplierChange={setSupplierId}
              currencyCode={currencyCode}
              onCurrencyChange={setCurrencyCode}
              orderDate={orderDate}
              onOrderDateChange={setOrderDate}
              expectedDate={expectedDate}
              onExpectedDateChange={setExpectedDate}
              destinationLocationId={destinationLocationId}
              onDestinationLocationChange={setDestinationLocationId}
              supplierReference={supplierReference}
              onSupplierReferenceChange={setSupplierReference}
              notes={notes}
              onNotesChange={setNotes}
              disabled={saving}
            />

            {/* Section 2: Inline Order Items (Optional & Fast) */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    Order items
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Add product lines now or save an empty draft and add them later.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {totalDraftCount} {totalDraftCount === 1 ? 'item' : 'items'}
                  </Badge>
                  {totalDraftCount > 0 && (
                    <Badge variant="outline" className="font-mono text-xs font-semibold text-primary">
                      Total: {formatSupplyMoney(totalAmount.toString(), currencyCode)}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Add item row */}
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <Field>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="line-variant" className="text-xs">
                        Product & Variant
                      </FieldLabel>
                      {activeVariants.length > 5 && (
                        <input
                          type="text"
                          placeholder="Filter variants..."
                          value={variantFilter}
                          onChange={(e) => setVariantFilter(e.target.value)}
                          className="h-5 w-28 rounded border border-input bg-transparent px-1.5 text-[11px] outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                        />
                      )}
                    </div>
                    <NativeSelect
                      id="line-variant"
                      value={addingVariantId}
                      disabled={saving || !activeVariants.length}
                      className="w-full text-xs"
                      onChange={(e) => setAddingVariantId(e.target.value)}
                    >
                      <NativeSelectOption value="" disabled>
                        {activeVariants.length
                          ? 'Select product SKU to add'
                          : 'No active catalog variants available'}
                      </NativeSelectOption>
                      {filteredVariants.map((item) => (
                        <NativeSelectOption key={item.id} value={item.id}>
                          {item.productTitle} · {item.sku}
                          {item.optionSummary ? ` (${item.optionSummary})` : ''}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <Field>
                    <FieldLabel htmlFor="line-quantity" className="text-xs">
                      Quantity
                    </FieldLabel>
                    <Input
                      id="line-quantity"
                      type="number"
                      min="0.000001"
                      step="any"
                      value={addingQuantity}
                      disabled={saving}
                      className="h-8 font-mono text-xs"
                      onChange={(e) => setAddingQuantity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLine();
                        }
                      }}
                    />
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <Field>
                    <FieldLabel htmlFor="line-price" className="text-xs">
                      Cost ({currencyCode})
                    </FieldLabel>
                    <Input
                      id="line-price"
                      type="number"
                      min="0"
                      step="any"
                      value={addingUnitPrice}
                      disabled={saving}
                      className="h-8 font-mono text-xs"
                      onChange={(e) => setAddingUnitPrice(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLine();
                        }
                      }}
                    />
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant={addingVariantId ? 'default' : 'secondary'}
                    size="sm"
                    disabled={!addingVariantId || saving}
                    onClick={handleAddLine}
                    className="w-full gap-1 text-xs"
                  >
                    <Plus className="size-3.5" />
                    Add item
                  </Button>
                </div>
              </div>

              {pendingVariant && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                  <span>
                    Selected: <strong>{pendingVariant.productTitle}</strong> ({pendingVariant.sku}) · {addingQuantity} units @ {formatSupplyMoney(addingUnitPrice, currencyCode)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">
                      = {formatSupplyMoney(pendingAmount.toString(), currencyCode)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddLine}
                      className="h-6 gap-1 px-2 text-[11px]"
                    >
                      <Plus className="size-3" /> Stage line
                    </Button>
                  </div>
                </div>
              )}

              {/* Items Table */}
              {lines.length > 0 ? (
                <div className="mt-4 rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Product / SKU</TableHead>
                        <TableHead className="w-24 text-right">Qty</TableHead>
                        <TableHead className="w-28 text-right">Unit cost</TableHead>
                        <TableHead className="w-28 text-right">Subtotal</TableHead>
                        <TableHead className="w-12 text-center" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, idx) => {
                        const lineSubtotal =
                          (parseFloat(line.quantity) || 0) *
                          (parseFloat(line.unitPrice) || 0);
                        return (
                          <TableRow key={line.id} className="text-xs">
                            <TableCell className="font-medium">
                              <div>{line.productTitle}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {line.sku}
                                {line.optionSummary ? ` · ${line.optionSummary}` : ''}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Input
                                type="number"
                                min="0.000001"
                                step="any"
                                value={line.quantity}
                                disabled={saving}
                                className="h-7 w-20 text-right font-mono text-xs ml-auto"
                                onChange={(e) =>
                                  handleUpdateLine(idx, { quantity: e.target.value })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={line.unitPrice}
                                disabled={saving}
                                className="h-7 w-24 text-right font-mono text-xs ml-auto"
                                onChange={(e) =>
                                  handleUpdateLine(idx, { unitPrice: e.target.value })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatSupplyMoney(lineSubtotal.toString(), currencyCode)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={saving}
                                onClick={() => handleRemoveLine(idx)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                                <span className="sr-only">Remove</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No items drafted yet. You can create an empty draft or add items above.
                </div>
              )}
            </div>
          </div>

          {/* Sticky Footer with Workflow Actions */}
          <DialogFooter className="mt-0 border-t bg-muted/40 px-6 py-3 sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Checkbox
                checked={openAfterCreate}
                onCheckedChange={(checked) => setOpenAfterCreate(Boolean(checked))}
                disabled={saving}
              />
              <span>Open purchase order after creation</span>
            </label>

            <div className="flex items-center gap-2">
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => handleClose(false)}
                  >
                    Cancel
                  </Button>
                }
              />
              <Button
                type="submit"
                disabled={saving || !supplierId}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : totalDraftCount > 0 ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {saving
                  ? 'Creating purchase...'
                  : totalDraftCount > 0
                    ? `Create purchase (${totalDraftCount} ${totalDraftCount === 1 ? 'item' : 'items'})`
                    : 'Create draft purchase'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
