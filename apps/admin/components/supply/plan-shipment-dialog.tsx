'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Box,
  Check,
  HelpCircle,
  Info,
  Loader2,
  PackageOpen,
  Plane,
  Plus,
  Ship,
  Sparkles,
  Train,
  Trash2,
  Truck,
  Warehouse,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  ApiEnvelope,
  InboundShipmentDto,
  PurchaseDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSupplyNumber, remainingSupplyQuantity, supplyRequest } from '@/lib/supply/api';
import { isShipmentReceivingLocation } from '@/lib/supply/location-options';

export type ShippableLineItem = PurchaseDto['lines'][number] & {
  readonly purchase: PurchaseDto;
};

export interface PlanShipmentDraftLine {
  readonly purchaseLineId: string;
  quantity: string;
}

export interface PlanShipmentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly locations: readonly WarehouseLocationDto[];
  readonly shippableLines: readonly ShippableLineItem[];
  readonly defaultPurchaseId?: string | undefined;
  readonly onSuccess?: (shipment?: InboundShipmentDto) => void;
}

function cleanUrlParams(...keys: string[]) {
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

export function PlanShipmentDialog({
  open,
  onOpenChange,
  locations,
  shippableLines,
  defaultPurchaseId,
  onSuccess,
}: PlanShipmentDialogProps) {
  // Form fields
  const [receivingLocationId, setReceivingLocationId] = useState('');
  const [transportMode, setTransportMode] = useState<'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER'>('SEA');
  const [originText, setOriginText] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');

  // Line allocations state
  const [lines, setLines] = useState<PlanShipmentDraftLine[]>([]);
  const [purchaseFilter, setPurchaseFilter] = useState<string>('');

  // Add individual line picker state
  const [selectedLineToAdd, setSelectedLineToAdd] = useState<string>('');
  const [quantityToAdd, setQuantityToAdd] = useState<string>('1');

  // Form submission state
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Filter locations with PURCHASE_RECEIVING capability
  const receivingLocations = useMemo(
    () => locations.filter(isShipmentReceivingLocation),
    [locations],
  );

  // Unique placed purchases that have shippable lines
  const purchasesWithShippable = useMemo(() => {
    return Array.from(
      new Map(shippableLines.map((line) => [line.purchase.id, line.purchase])).values(),
    );
  }, [shippableLines]);

  // Read URL search params on mount or when dialog opens
  useEffect(() => {
    if (!open) return;
    setErrorMessage('');

    let initialPurchaseId = defaultPurchaseId ?? '';
    if (!initialPurchaseId && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      initialPurchaseId = urlParams.get('purchase') ?? '';
    }

    if (initialPurchaseId && purchasesWithShippable.some((p) => p.id === initialPurchaseId)) {
      setPurchaseFilter(initialPurchaseId);

      // Pre-allocate all lines from this purchase if draft lines are currently empty
      const poLines = shippableLines.filter((l) => l.purchase.id === initialPurchaseId);
      setLines((prev) => {
        if (prev.length > 0) return prev;
        return poLines.map((l) => ({
          purchaseLineId: l.id,
          quantity: remainingSupplyQuantity(l.quantity, l.allocatedQuantity),
        }));
      });

      // Intelligent receiving warehouse selection based on purchase's destination
      const targetPurchase = purchasesWithShippable.find((p) => p.id === initialPurchaseId);
      if (
        targetPurchase?.destinationLocationId &&
        receivingLocations.some((loc) => loc.id === targetPurchase.destinationLocationId)
      ) {
        setReceivingLocationId(targetPurchase.destinationLocationId);
      }
    } else {
      setPurchaseFilter('');
      if (receivingLocations.length === 1 && receivingLocations[0]) {
        setReceivingLocationId(receivingLocations[0].id);
      }
    }
  }, [open, defaultPurchaseId, purchasesWithShippable, receivingLocations, shippableLines]);

  // Fallback receiving warehouse if not set
  useEffect(() => {
    if (!receivingLocationId && receivingLocations.length > 0 && receivingLocations[0]) {
      setReceivingLocationId(receivingLocations[0].id);
    }
  }, [receivingLocationId, receivingLocations]);

  // Determine active locked currency based on lines already in the draft
  const lockedCurrency = useMemo(() => {
    if (lines.length === 0) {
      if (purchaseFilter) {
        const po = purchasesWithShippable.find((p) => p.id === purchaseFilter);
        return po?.currencyCode ?? null;
      }
      return null;
    }
    const firstLine = shippableLines.find((l) => l.id === lines[0]?.purchaseLineId);
    return firstLine?.purchase.currencyCode ?? null;
  }, [lines, purchaseFilter, purchasesWithShippable, shippableLines]);

  // Lines eligible for addition (must not already be in draft, and must match locked currency if set)
  const availableLines = useMemo(() => {
    return shippableLines.filter((line) => {
      // Must not already be in the draft
      if (lines.some((l) => l.purchaseLineId === line.id)) return false;
      // Must match locked currency
      if (lockedCurrency && line.purchase.currencyCode !== lockedCurrency) return false;
      return true;
    });
  }, [shippableLines, lines, lockedCurrency]);

  // Filtered available lines for the individual line picker
  const displayedAvailableLines = useMemo(() => {
    if (!purchaseFilter) return availableLines;
    return availableLines.filter((l) => l.purchase.id === purchaseFilter);
  }, [availableLines, purchaseFilter]);

  // Target purchase when filter is chosen
  const activeFilterPurchase = useMemo(() => {
    return purchasesWithShippable.find((p) => p.id === purchaseFilter);
  }, [purchasesWithShippable, purchaseFilter]);

  // Unadded lines available for batch add from current filtered PO
  const unaddedLinesForFilter = useMemo(() => {
    if (!activeFilterPurchase) return [];
    return availableLines.filter((l) => l.purchase.id === activeFilterPurchase.id);
  }, [activeFilterPurchase, availableLines]);

  // Selected line object for the individual add row
  const activeLineToAdd = useMemo(() => {
    return shippableLines.find((line) => line.id === selectedLineToAdd);
  }, [shippableLines, selectedLineToAdd]);

  const activeLineToAddMax = useMemo(() => {
    if (!activeLineToAdd) return 0;
    return Number(remainingSupplyQuantity(activeLineToAdd.quantity, activeLineToAdd.allocatedQuantity));
  }, [activeLineToAdd]);

  const handleLineToAddChange = (newLineId: string) => {
    setSelectedLineToAdd(newLineId);
    const line = shippableLines.find((l) => l.id === newLineId);
    if (line) {
      const max = remainingSupplyQuantity(line.quantity, line.allocatedQuantity);
      setQuantityToAdd(max);
    } else {
      setQuantityToAdd('1');
    }
  };

  const parsedQtyToAdd = Number(quantityToAdd);
  const isQtyToAddInvalid =
    !activeLineToAdd || parsedQtyToAdd <= 0 || isNaN(parsedQtyToAdd) || parsedQtyToAdd > activeLineToAddMax;

  const handleAddSingleLine = () => {
    if (isQtyToAddInvalid || !selectedLineToAdd) return;
    setLines((prev) => [...prev, { purchaseLineId: selectedLineToAdd, quantity: String(parsedQtyToAdd) }]);
    setSelectedLineToAdd('');
    setQuantityToAdd('1');
  };

  const handleAddAllFromFilteredPO = () => {
    if (!unaddedLinesForFilter.length) return;
    const newDrafts = unaddedLinesForFilter.map((l) => ({
      purchaseLineId: l.id,
      quantity: remainingSupplyQuantity(l.quantity, l.allocatedQuantity),
    }));
    setLines((prev) => [...prev, ...newDrafts]);
  };

  const handleUpdateLineQty = (purchaseLineId: string, newQty: string) => {
    setLines((prev) =>
      prev.map((l) => (l.purchaseLineId === purchaseLineId ? { ...l, quantity: newQty } : l)),
    );
  };

  const handleSetLineMaxQty = (purchaseLineId: string) => {
    const orig = shippableLines.find((l) => l.id === purchaseLineId);
    if (!orig) return;
    const max = remainingSupplyQuantity(orig.quantity, orig.allocatedQuantity);
    handleUpdateLineQty(purchaseLineId, max);
  };

  const handleRemoveLine = (purchaseLineId: string) => {
    setLines((prev) => prev.filter((l) => l.purchaseLineId !== purchaseLineId));
  };

  // Check for line errors
  const hasLineErrors = useMemo(() => {
    return lines.some((line) => {
      const orig = shippableLines.find((l) => l.id === line.purchaseLineId);
      if (!orig) return true;
      const max = Number(remainingSupplyQuantity(orig.quantity, orig.allocatedQuantity));
      const qty = Number(line.quantity);
      return isNaN(qty) || qty <= 0 || qty > max;
    });
  }, [lines, shippableLines]);

  const totalUnitsPlanned = useMemo(() => {
    return lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
  }, [lines]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (!receivingLocationId) {
      setErrorMessage('Please choose an active receiving warehouse location.');
      return;
    }

    if (lines.length === 0) {
      setErrorMessage('Please add at least one purchase order line to this shipment.');
      return;
    }

    if (hasLineErrors) {
      setErrorMessage('Please correct the allocation quantities before planning the shipment.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        receivingLocationId,
        transportMode,
        originText: originText.trim() || undefined,
        trackingReference: trackingReference.trim() || undefined,
        expectedArrivalDate: expectedArrivalDate || undefined,
        allocations: lines.map((l) => ({
          purchaseLineId: l.purchaseLineId,
          quantity: l.quantity,
        })),
      };

      const result = await supplyRequest<ApiEnvelope<InboundShipmentDto>>('/admin/inbound-shipments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      cleanUrlParams('create', 'purchase');
      onSuccess?.(result.data);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create shipment.');
    } finally {
      setSaving(false);
    }
  }

  function handleDialogClose() {
    cleanUrlParams('create', 'purchase');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? handleDialogClose() : onOpenChange(val))}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Ship className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Plan Inbound Freight Shipment
              </DialogTitle>
              <DialogDescription className="text-xs">
                Consolidate placed purchase order items into an inbound freight consignment.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {shippableLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center sm:p-10">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <PackageOpen className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-3 font-heading text-base font-semibold">No open purchase lines to ship</h3>
            <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
              Inbound shipments group placed purchase orders. Purchases must be in <strong>PLACED</strong> status
              with unallocated items before they can be shipped.
            </p>
            <Button
              className="mt-4 gap-1.5"
              variant="outline"
              size="sm"
              render={<Link href="/purchases" />}
              onClick={handleDialogClose}
            >
              View Purchases
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMessage ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {/* Context Header Banner when target purchase is active */}
            {activeFilterPurchase ? (
              <div className="rounded-xl border bg-primary/5 p-3 text-xs flex flex-wrap items-center justify-between gap-2 border-primary/20">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {activeFilterPurchase.purchaseNumber}
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {activeFilterPurchase.currencyCode}
                    </Badge>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground font-medium truncate max-w-[200px]">
                      {activeFilterPurchase.supplierName}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {unaddedLinesForFilter.length > 0
                      ? `${unaddedLinesForFilter.length} unallocated lines available for this shipment.`
                      : 'All lines from this purchase order are currently allocated.'}
                  </p>
                </div>
                {unaddedLinesForFilter.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="gap-1 text-xs h-7"
                    onClick={handleAddAllFromFilteredPO}
                  >
                    <Sparkles className="size-3 text-amber-500" />
                    <span>Add all {unaddedLinesForFilter.length} lines</span>
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Section 1: Logistics & Routing */}
            <div className="rounded-xl border bg-card p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Warehouse className="size-3.5 text-primary" />
                  <span>Logistics & Route Configuration</span>
                </h3>
                {lockedCurrency ? (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    Currency Locked: {lockedCurrency}
                  </Badge>
                ) : null}
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                {/* Receiving Warehouse */}
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="shipment-warehouse">Receiving Warehouse Dock</FieldLabel>
                    <Tooltip>
                      <TooltipTrigger render={<span className="cursor-help text-muted-foreground inline-flex" />}>
                        <HelpCircle className="size-3" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-xs">
                        Only active warehouse facilities with "Purchase Receiving" capability are eligible.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <NativeSelect
                    id="shipment-warehouse"
                    name="receivingLocationId"
                    value={receivingLocationId}
                    required
                    className="w-full"
                    disabled={saving}
                    onChange={(e) => setReceivingLocationId(e.target.value)}
                  >
                    <NativeSelectOption value="" disabled>
                      Choose a receiving warehouse dock...
                    </NativeSelectOption>
                    {receivingLocations.map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.name} ({item.code})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {receivingLocations.length === 0 ? (
                    <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                      <AlertCircle className="size-3 shrink-0" />
                      No active warehouse location with "Purchase Receiving" capability found.
                    </p>
                  ) : null}
                </Field>

                {/* Transport Mode */}
                <Field>
                  <FieldLabel htmlFor="shipment-transport">Freight Transport Mode</FieldLabel>
                  <NativeSelect
                    id="shipment-transport"
                    name="transportMode"
                    value={transportMode}
                    required
                    className="w-full"
                    disabled={saving}
                    onChange={(e) =>
                      setTransportMode(e.target.value as 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER')
                    }
                  >
                    <NativeSelectOption value="SEA">Sea Freight (Ocean container / vessel)</NativeSelectOption>
                    <NativeSelectOption value="AIR">Air Freight (Express / Air cargo flight)</NativeSelectOption>
                    <NativeSelectOption value="ROAD">Road Freight (Truck / Lorry dispatch)</NativeSelectOption>
                    <NativeSelectOption value="RAIL">Rail Freight (Intermodal rail)</NativeSelectOption>
                    <NativeSelectOption value="OTHER">Other Freight Mode</NativeSelectOption>
                  </NativeSelect>
                </Field>

                {/* Origin Port / Dispatch City */}
                <Field>
                  <FieldLabel htmlFor="shipment-origin">Origin Dispatch Port / Facility</FieldLabel>
                  <Input
                    id="shipment-origin"
                    name="originText"
                    placeholder="e.g. Shenzhen Port, Guangzhou Forwarder Hub"
                    value={originText}
                    maxLength={200}
                    disabled={saving}
                    onChange={(e) => setOriginText(e.target.value)}
                  />
                  <FieldDescription>Port of departure, supplier warehouse, or forwarder hub.</FieldDescription>
                </Field>

                {/* Tracking Reference / Bill of Lading */}
                <Field>
                  <FieldLabel htmlFor="shipment-tracking">
                    Tracking / Bill of Lading Reference
                  </FieldLabel>
                  <Input
                    id="shipment-tracking"
                    name="trackingReference"
                    placeholder="e.g. Master B/L #, Container #, or AWB #"
                    value={trackingReference}
                    maxLength={200}
                    disabled={saving}
                    onChange={(e) => setTrackingReference(e.target.value)}
                  />
                  <FieldDescription>Master carrier B/L, ocean container code, or AWB tracking ID.</FieldDescription>
                </Field>

                {/* Expected Arrival Date */}
                <Field className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="shipment-arrival">Expected Arrival Date</FieldLabel>
                    <span className="text-[11px] text-muted-foreground">Dock ETA</span>
                  </div>
                  <Input
                    id="shipment-arrival"
                    name="expectedArrivalDate"
                    type="date"
                    min={todayStr}
                    value={expectedArrivalDate}
                    disabled={saving}
                    onChange={(e) => setExpectedArrivalDate(e.target.value)}
                  />
                  <FieldDescription>
                    Scheduled arrival date at the destination receiving warehouse dock.
                  </FieldDescription>
                </Field>
              </div>
            </div>

            {/* Section 2: Shipment Contents & Line Allocation */}
            <div className="rounded-xl border bg-card p-4 space-y-3.5 shadow-2xs">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Box className="size-3.5 text-primary" />
                    <span>Shipment Contents & Line Allocations</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Allocate items and quantities to be packed into this freight consignment.
                  </p>
                </div>

                {/* Purchase Order Filter Dropdown */}
                {purchasesWithShippable.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Filter PO:</span>
                    <NativeSelect
                      value={purchaseFilter}
                      className="h-8 text-xs w-auto min-w-[160px]"
                      onChange={(e) => {
                        setPurchaseFilter(e.target.value);
                        setSelectedLineToAdd('');
                      }}
                    >
                      <option value="">All Purchases ({availableLines.length} open)</option>
                      {purchasesWithShippable.map((p) => {
                        const count = availableLines.filter((l) => l.purchase.id === p.id).length;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.purchaseNumber} ({count} open)
                          </option>
                        );
                      })}
                    </NativeSelect>
                  </div>
                ) : null}
              </div>

              {/* Allocated Lines Table */}
              {lines.length > 0 ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-lg border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Item & Variant</TableHead>
                          <TableHead className="w-[140px]">Purchase Order</TableHead>
                          <TableHead className="text-right w-[90px]">Open Qty</TableHead>
                          <TableHead className="text-right w-[140px]">Ship Qty</TableHead>
                          <TableHead className="text-right w-[48px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((draftLine) => {
                          const orig = shippableLines.find((l) => l.id === draftLine.purchaseLineId);
                          const maxOpen = orig
                            ? Number(remainingSupplyQuantity(orig.quantity, orig.allocatedQuantity))
                            : 0;
                          const currentQty = Number(draftLine.quantity);
                          const isLineInvalid = isNaN(currentQty) || currentQty <= 0 || currentQty > maxOpen;

                          return (
                            <TableRow key={draftLine.purchaseLineId}>
                              {/* Item & Variant */}
                              <TableCell className="space-y-0.5">
                                <p className="font-medium text-xs text-foreground truncate max-w-[220px]">
                                  {orig?.productTitle ?? 'Product line'}
                                </p>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                                  <span>SKU: {orig?.sku}</span>
                                  {orig?.optionSummary ? (
                                    <Badge variant="outline" className="text-[10px] font-normal py-0 h-4">
                                      {orig.optionSummary}
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>

                              {/* Purchase Order & Supplier */}
                              <TableCell className="text-xs space-y-0.5">
                                <span className="font-mono font-semibold text-foreground block">
                                  {orig?.purchase.purchaseNumber}
                                </span>
                                <span className="text-[11px] text-muted-foreground truncate block max-w-[130px]">
                                  {orig?.purchase.supplierName}
                                </span>
                              </TableCell>

                              {/* Open Qty Available */}
                              <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                                {maxOpen}
                              </TableCell>

                              {/* Ship Quantity Input */}
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Input
                                    type="number"
                                    min="0.000001"
                                    max={maxOpen}
                                    step="any"
                                    value={draftLine.quantity}
                                    disabled={saving}
                                    onChange={(e) =>
                                      handleUpdateLineQty(draftLine.purchaseLineId, e.target.value)
                                    }
                                    className={`h-7 w-20 text-right text-xs font-mono tabular-nums ${
                                      isLineInvalid ? 'border-destructive ring-1 ring-destructive' : ''
                                    }`}
                                  />
                                  {currentQty !== maxOpen ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      className="h-7 px-1 text-[10px] font-semibold text-primary"
                                      onClick={() => handleSetLineMaxQty(draftLine.purchaseLineId)}
                                      title="Set to full open quantity"
                                    >
                                      MAX
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>

                              {/* Remove Button */}
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="icon-xs"
                                  variant="ghost"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  disabled={saving}
                                  onClick={() => handleRemoveLine(draftLine.purchaseLineId)}
                                  title="Remove line from shipment"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Summary Bar */}
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                    <span>
                      Allocating <strong className="text-foreground">{lines.length}</strong>{' '}
                      {lines.length === 1 ? 'line' : 'lines'} ·{' '}
                      <strong className="text-foreground font-mono">
                        {formatSupplyNumber(String(totalUnitsPlanned))}
                      </strong>{' '}
                      total units
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-xs h-6 text-muted-foreground hover:text-destructive"
                      onClick={() => setLines([])}
                    >
                      Clear all lines
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground space-y-1">
                  <Box className="size-6 mx-auto opacity-40 mb-1" />
                  <p className="font-medium text-foreground">No purchase lines added to this shipment yet</p>
                  <p className="text-[11px]">
                    Use the selector below to add lines individually, or click "Add all lines" above.
                  </p>
                </div>
              )}

              {/* Add Individual Line Picker (if more open lines exist) */}
              {displayedAvailableLines.length > 0 ? (
                <div className="pt-2 border-t space-y-2">
                  <span className="text-[11px] font-medium text-muted-foreground block">
                    Add additional line to shipment:
                  </span>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <NativeSelect
                      value={selectedLineToAdd}
                      className="flex-1 text-xs"
                      disabled={saving}
                      onChange={(e) => handleLineToAddChange(e.target.value)}
                    >
                      <option value="">Choose an open purchase line to add...</option>
                      {displayedAvailableLines.map((line) => {
                        const openQty = remainingSupplyQuantity(line.quantity, line.allocatedQuantity);
                        return (
                          <option key={line.id} value={line.id}>
                            {line.purchase.purchaseNumber} · {line.productTitle} (SKU: {line.sku}) — Open: {openQty}
                          </option>
                        );
                      })}
                    </NativeSelect>

                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <Input
                          type="number"
                          min="0.000001"
                          max={activeLineToAddMax > 0 ? activeLineToAddMax : undefined}
                          step="any"
                          placeholder="Qty"
                          value={quantityToAdd}
                          disabled={saving || !activeLineToAdd}
                          className="h-8 w-24 text-right text-xs pr-8"
                          onChange={(e) => setQuantityToAdd(e.target.value)}
                        />
                        {activeLineToAdd && activeLineToAddMax > 0 ? (
                          <button
                            type="button"
                            onClick={() => setQuantityToAdd(String(activeLineToAddMax))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary hover:underline"
                            title="Allocate full open quantity"
                          >
                            MAX
                          </button>
                        ) : null}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        disabled={saving || isQtyToAddInvalid}
                        onClick={handleAddSingleLine}
                      >
                        <Plus className="size-3.5" />
                        <span>Add</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="pt-2">
              <DialogClose render={<Button variant="outline" type="button" disabled={saving} />}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={saving || lines.length === 0 || hasLineErrors || !receivingLocationId}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Ship className="size-4" />}
                <span>
                  Plan shipment {lines.length > 0 ? `(${formatSupplyNumber(String(totalUnitsPlanned))} units)` : ''}
                </span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
