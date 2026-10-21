'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
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
import { useCatalogVariantChoices } from '@/components/supply/use-catalog-variant-choices';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SupplyTaskDialogContent } from '@/components/supply/supply-task-dialog-content';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
  readonly primaryImageUrl?: string | null;
  quantity: string;
  unitPrice: string;
}

export interface CreatePurchaseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly suppliers?: readonly SupplierDto[] | undefined;
  readonly locations?: readonly WarehouseLocationDto[] | undefined;
  readonly variants?: readonly CatalogVariantChoiceDto[] | undefined;
  readonly defaultSupplierId?: string | undefined;
  readonly onSuccess?: ((created: PurchaseDto) => void) | undefined;
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
  suppliers: propSuppliers,
  locations: propLocations,
  variants: propVariants,
  defaultSupplierId = '',
  onSuccess,
}: CreatePurchaseDialogProps) {
  const router = useRouter();
  const replenishmentPrefillApplied = useRef(false);

  const [loadedSuppliers, setLoadedSuppliers] = useState<readonly SupplierDto[]>(
    propSuppliers ?? [],
  );
  const [loadedLocations, setLoadedLocations] = useState<readonly WarehouseLocationDto[]>(
    propLocations ?? [],
  );
  const [referenceLoading, setReferenceLoading] = useState(false);

  useEffect(() => {
    if (propSuppliers) setLoadedSuppliers(propSuppliers);
  }, [propSuppliers]);

  useEffect(() => {
    if (propLocations) setLoadedLocations(propLocations);
  }, [propLocations]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const tasks: Promise<unknown>[] = [];

    if (!propSuppliers || propSuppliers.length === 0) {
      tasks.push(
        supplyRequest<{ data: readonly SupplierDto[] }>('/admin/suppliers?pageSize=100', {
          signal: controller.signal,
        }).then((res) => setLoadedSuppliers(res.data)),
      );
    }
    if (!propLocations || propLocations.length === 0) {
      tasks.push(
        supplyRequest<{ data: readonly WarehouseLocationDto[] }>('/admin/warehouse/locations', {
          signal: controller.signal,
        }).then((res) => setLoadedLocations(res.data)),
      );
    }
    if (tasks.length === 0) {
      setReferenceLoading(false);
      return () => controller.abort();
    }

    setReferenceLoading(true);
    void Promise.allSettled(tasks).then((results) => {
      if (controller.signal.aborted) return;
      setReferenceLoading(false);
      if (results.some((result) => result.status === 'rejected')) {
        setError(
          'Some supplier or warehouse choices could not be loaded. Close and reopen the form to retry.',
        );
      }
    });

    return () => controller.abort();
  }, [open, propSuppliers, propLocations]);

  const suppliers = loadedSuppliers;
  const locations = loadedLocations;
  const variantChoices = useCatalogVariantChoices({ open, initialItems: propVariants });

  // Commercial & Header state
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [currencyCode, setCurrencyCode] = useState<'BDT' | 'CNY' | 'USD'>('CNY');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [supplierReference, setSupplierReference] = useState('');
  const [notes, setNotes] = useState('');

  // Inline Line Items state
  const [lines, setLines] = useState<DraftPurchaseLine[]>([]);
  const [addingVariantId, setAddingVariantId] = useState('');
  const [addingVariant, setAddingVariant] = useState<CatalogVariantChoiceDto>();
  const [addingQuantity, setAddingQuantity] = useState('1');
  const [addingUnitPrice, setAddingUnitPrice] = useState('0');

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

  const activeVariants = variantChoices.items;
  const pendingVariant = addingVariant;

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

  function selectVariant(variant: CatalogVariantChoiceDto) {
    setAddingVariantId(variant.id);
    setAddingVariant(variant);
    setAddingUnitPrice(
      variant.estimatedCostAmount && Number(variant.estimatedCostAmount) > 0
        ? variant.estimatedCostAmount
        : '0',
    );
  }

  useEffect(() => {
    if (!open) {
      replenishmentPrefillApplied.current = false;
      return;
    }
    if (replenishmentPrefillApplied.current || activeVariants.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const variantId = params.get('variantId');
    if (!variantId) return;
    const variant = activeVariants.find((item) => item.id === variantId);
    if (!variant) {
      const sku = params.get('sku');
      if (sku && variantChoices.query !== sku) variantChoices.setQuery(sku);
      return;
    }
    replenishmentPrefillApplied.current = true;
    setAddingVariantId(variant.id);
    setAddingVariant(variant);
    setAddingUnitPrice(
      variant.estimatedCostAmount && Number(variant.estimatedCostAmount) > 0
        ? variant.estimatedCostAmount
        : '0',
    );
    const quantity = params.get('quantity');
    if (quantity && Number(quantity) > 0) setAddingQuantity(quantity);
    const destination = params.get('destinationLocationId');
    if (destination) setDestinationLocationId(destination);
  }, [activeVariants, open, variantChoices]);

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      removeUrlParams(
        'create',
        'supplier',
        'inventoryItemId',
        'variantId',
        'sku',
        'quantity',
        'destinationLocationId',
      );
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  function handleAddLine() {
    if (!addingVariantId) return;
    const variant = addingVariant;
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
          primaryImageUrl: variant.primaryImageUrl ?? null,
          quantity: addingQuantity,
          unitPrice: addingUnitPrice,
        },
      ]);
    }

    setAddingVariantId('');
    setAddingVariant(undefined);
    setAddingQuantity('1');
    setAddingUnitPrice('0');
    setError(null);
  }

  function handleRemoveLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateLine(index: number, updates: Partial<DraftPurchaseLine>) {
    setLines((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
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
      const variant = addingVariant;
      if (variant) {
        const parsedQty = parseFloat(addingQuantity);
        const parsedPrice = parseFloat(addingUnitPrice);
        if (
          !Number.isNaN(parsedQty) &&
          parsedQty > 0 &&
          !Number.isNaN(parsedPrice) &&
          parsedPrice >= 0
        ) {
          const existingIndex = allLinesToSubmit.findIndex((l) => l.variantId === addingVariantId);
          if (existingIndex >= 0) {
            const prevQty = parseFloat(allLinesToSubmit[existingIndex]!.quantity) || 0;
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
              primaryImageUrl: variant.primaryImageUrl ?? null,
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

      const result = await supplyRequest<ApiEnvelope<PurchaseDto>>('/admin/purchases', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

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
      <SupplyTaskDialogContent className="flex max-h-[92vh] w-full flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Package className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-lg font-semibold">Create purchase order</DialogTitle>
              <DialogDescription className="text-xs">
                Draft a supplier order, set expected dates, and optionally include initial product
                lines.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
          {/* Scrollable Form Body */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {referenceLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground"
              >
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                <span>Loading suppliers and warehouses…</span>
              </div>
            ) : null}

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
              disabled={saving || referenceLoading}
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
                    <Badge
                      variant="outline"
                      className="font-mono text-xs font-semibold text-primary"
                    >
                      Total: {formatSupplyMoney(totalAmount.toString(), currencyCode)}
                    </Badge>
                  )}
                </div>
              </div>

              <Field>
                <FieldLabel htmlFor="variant-search" className="text-xs">
                  Find product & variant
                </FieldLabel>
                <Input
                  id="variant-search"
                  name="variantSearch"
                  type="search"
                  autoComplete="off"
                  value={variantChoices.query}
                  onChange={(event) => variantChoices.setQuery(event.target.value)}
                  placeholder="Search title, SKU, color, or size…"
                  disabled={saving || referenceLoading}
                />
              </Field>

              <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {activeVariants.length ? (
                  activeVariants.map((item) => {
                    const isSelected = addingVariantId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectVariant(item)}
                        disabled={saving || referenceLoading}
                        className={`flex min-h-24 items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary-subtle'
                            : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'
                        }`}
                      >
                        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
                          {item.primaryImageUrl ? (
                            <img
                              src={item.primaryImageUrl}
                              alt={`${item.productTitle} ${item.optionSummary || item.sku}`}
                              width={80}
                              height={80}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="size-6 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-xs font-medium text-foreground">
                            {item.productTitle}
                          </span>
                          <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                            {item.sku}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-[11px] text-muted-foreground">
                            {item.optionSummary || 'Default variant'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                    {variantChoices.loading
                      ? 'Searching Catalog variants…'
                      : variantChoices.query
                        ? 'No variants match this search.'
                        : 'No active Catalog variants are available.'}
                  </div>
                )}
              </div>

              {variantChoices.error ? (
                <div
                  role="alert"
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
                >
                  <span>{variantChoices.error}</span>
                  <Button type="button" variant="outline" size="sm" onClick={variantChoices.retry}>
                    Retry
                  </Button>
                </div>
              ) : null}

              {variantChoices.hasMore ? (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={variantChoices.loading}
                    onClick={variantChoices.loadMore}
                  >
                    {variantChoices.loading ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : null}
                    Load more variants ({activeVariants.length} of {variantChoices.totalItems})
                  </Button>
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Field>
                    <FieldLabel htmlFor="line-quantity" className="text-xs">
                      Quantity
                    </FieldLabel>
                    <Input
                      id="line-quantity"
                      name="newLineQuantity"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={addingQuantity}
                      disabled={saving || referenceLoading}
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
                      name="newLineUnitPrice"
                      type="number"
                      min="0"
                      inputMode="decimal"
                      step="0.01"
                      value={addingUnitPrice}
                      disabled={saving || referenceLoading}
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
                    disabled={!addingVariantId || saving || referenceLoading}
                    onClick={handleAddLine}
                    className="w-full gap-1 text-xs"
                  >
                    <Plus className="size-3.5" />
                    Add item
                  </Button>
                </div>
              </div>

              {pendingVariant && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary-subtle p-3 text-xs">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
                      {pendingVariant.primaryImageUrl ? (
                        <img
                          src={pendingVariant.primaryImageUrl}
                          alt={`${pendingVariant.productTitle} ${pendingVariant.optionSummary || pendingVariant.sku}`}
                          width={64}
                          height={64}
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <strong className="line-clamp-2 text-foreground">
                        {pendingVariant.productTitle}
                      </strong>
                      <span className="block truncate text-muted-foreground">
                        {pendingVariant.sku} · {pendingVariant.optionSummary || 'Default variant'}
                      </span>
                      <span className="mt-1 block font-mono text-primary">
                        {addingQuantity} units @ {formatSupplyMoney(addingUnitPrice, currencyCode)}
                      </span>
                    </span>
                  </div>
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
                          (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
                        return (
                          <TableRow key={line.id} className="text-xs">
                            <TableCell className="font-medium">
                              <div className="flex min-w-56 items-center gap-2.5">
                                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
                                  {line.primaryImageUrl ? (
                                    <img
                                      src={line.primaryImageUrl}
                                      alt={`${line.productTitle} ${line.optionSummary || line.sku}`}
                                      width={48}
                                      height={48}
                                      loading="lazy"
                                      className="size-full object-cover"
                                    />
                                  ) : (
                                    <ImageIcon className="size-4 text-muted-foreground" />
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className="line-clamp-2 block">{line.productTitle}</span>
                                  <span className="block text-[11px] text-muted-foreground">
                                    {line.sku}
                                    {line.optionSummary ? ` · ${line.optionSummary}` : ''}
                                  </span>
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Input
                                name={`line-${idx}-quantity`}
                                aria-label={`Quantity for ${line.productTitle} ${line.optionSummary ?? line.sku}`}
                                type="number"
                                inputMode="numeric"
                                min="1"
                                step="1"
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
                                name={`line-${idx}-unit-price`}
                                aria-label={`Unit cost for ${line.productTitle} ${line.optionSummary ?? line.sku}`}
                                type="number"
                                min="0"
                                inputMode="decimal"
                                step="0.01"
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
              <Button type="submit" disabled={saving || !supplierId} className="gap-1.5">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : totalDraftCount > 0 ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {saving
                  ? 'Creating purchase…'
                  : totalDraftCount > 0
                    ? `Create purchase (${totalDraftCount} ${totalDraftCount === 1 ? 'item' : 'items'})`
                    : 'Create draft purchase'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </SupplyTaskDialogContent>
    </Dialog>
  );
}
