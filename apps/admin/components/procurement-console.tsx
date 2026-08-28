'use client';

import { BookOpen, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type {
  ApiEnvelope,
  CatalogVariantChoiceDto,
  InboundReceiptDto,
  InboundShipmentDto,
  PurchaseDto,
  SupplierDto,
  SupplyOverviewDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { OperationalEmptyState, OperationalFeedback } from '@/components/operational-worklist';
import {
  PurchaseForm,
  ReceiptForm,
  ShipmentForm,
  SupplierForm,
} from '@/components/supply/supply-forms';
import { SupplyField as Field } from '@/components/supply/supply-field';
import {
  HowToDialog,
  PAGE_SIZE,
  Pager,
  screenCopy,
  StatCards,
} from '@/components/supply/supply-page-ui';
import {
  PurchasesTable,
  ReceiptsTable,
  ShipmentsTable,
  SuppliersTable,
} from '@/components/supply/supply-tables';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supplyRequest as request } from '@/lib/supply/api';
import type {
  ConfirmSupplyAction,
  PagedEnvelope,
  ReceiptDraftLine,
  ShipmentDraftLine,
  SupplyNotice,
  SupplyScreen,
} from '@/lib/supply/types';

export function ProcurementConsole({ screen }: { readonly screen: SupplyScreen }) {
  const [suppliers, setSuppliers] = useState<readonly SupplierDto[]>([]);
  const [purchases, setPurchases] = useState<readonly PurchaseDto[]>([]);
  const [shipments, setShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [receipts, setReceipts] = useState<readonly InboundReceiptDto[]>([]);
  const [variants, setVariants] = useState<readonly CatalogVariantChoiceDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [overview, setOverview] = useState<SupplyOverviewDto>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<SupplyNotice>();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDto>();
  const [linePurchase, setLinePurchase] = useState<PurchaseDto>();
  const [expandedPurchase, setExpandedPurchase] = useState<string>();
  const [expandedShipment, setExpandedShipment] = useState<string>();
  const [confirmAction, setConfirmAction] = useState<ConfirmSupplyAction>();
  const [shipmentLines, setShipmentLines] = useState<ShipmentDraftLine[]>([]);
  const [receiptShipmentId, setReceiptShipmentId] = useState('');
  const [receiptLines, setReceiptLines] = useState<ReceiptDraftLine[]>([]);

  async function reload() {
    setLoading(true);
    try {
      const summary = request<ApiEnvelope<SupplyOverviewDto>>('/admin/supply/overview');
      if (screen === 'suppliers') {
        const [a, b, c] = await Promise.all([
          summary,
          request<PagedEnvelope<SupplierDto>>('/admin/suppliers?pageSize=100'),
          request<PagedEnvelope<PurchaseDto>>('/admin/purchases?pageSize=100'),
        ]);
        setOverview(a.data);
        setSuppliers(b.data);
        setPurchases(c.data);
      } else if (screen === 'purchases') {
        const [a, b, c, d, e] = await Promise.all([
          summary,
          request<PagedEnvelope<SupplierDto>>('/admin/suppliers?pageSize=100'),
          request<PagedEnvelope<PurchaseDto>>('/admin/purchases?pageSize=100'),
          request<ApiEnvelope<readonly CatalogVariantChoiceDto[]>>('/admin/catalog/variants'),
          request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations'),
        ]);
        setOverview(a.data);
        setSuppliers(b.data);
        setPurchases(c.data);
        setVariants(d.data);
        setLocations(e.data);
      } else if (screen === 'shipments') {
        const [a, b, c, d] = await Promise.all([
          summary,
          request<PagedEnvelope<PurchaseDto>>('/admin/purchases?pageSize=100'),
          request<PagedEnvelope<InboundShipmentDto>>('/admin/inbound-shipments?pageSize=100'),
          request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations'),
        ]);
        setOverview(a.data);
        setPurchases(b.data);
        setShipments(c.data);
        setLocations(d.data);
      } else {
        const [a, b, c] = await Promise.all([
          summary,
          request<PagedEnvelope<InboundShipmentDto>>('/admin/inbound-shipments?pageSize=100'),
          request<PagedEnvelope<InboundReceiptDto>>('/admin/inbound-receipts?pageSize=100'),
        ]);
        setOverview(a.data);
        setShipments(b.data);
        setReceipts(c.data);
      }
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Supply data could not be loaded.',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const params = new URLSearchParams(window.location.search);
    if (params.has('create')) setCreateOpen(true);
  }, [screen]);

  const allItems =
    screen === 'suppliers'
      ? suppliers
      : screen === 'purchases'
        ? purchases
        : screen === 'shipments'
          ? shipments
          : receipts;
  const statuses = [...new Set(allItems.map((item) => item.status))];
  const filtered = allItems.filter((item) => {
    const text =
      screen === 'suppliers'
        ? `${(item as SupplierDto).name} ${(item as SupplierDto).code} ${(item as SupplierDto).contactName ?? ''}`
        : screen === 'purchases'
          ? `${(item as PurchaseDto).purchaseNumber} ${(item as PurchaseDto).supplierName} ${(item as PurchaseDto).lines.map((line) => `${line.productTitle} ${line.sku}`).join(' ')}`
          : screen === 'shipments'
            ? `${(item as InboundShipmentDto).shipmentNumber} ${(item as InboundShipmentDto).trackingReference ?? ''} ${(item as InboundShipmentDto).receivingLocationName}`
            : `${(item as InboundReceiptDto).receiptNumber} ${shipments.find((shipment) => shipment.id === (item as InboundReceiptDto).shipmentId)?.shipmentNumber ?? ''}`;
    return (
      (!query.trim() || text.toLowerCase().includes(query.trim().toLowerCase())) &&
      (status === 'ALL' || item.status === status)
    );
  });
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const shippableLines = purchases.flatMap((purchase) =>
    purchase.status === 'PLACED'
      ? purchase.lines
          .filter((line) => Number(line.allocatedQuantity) < Number(line.quantity))
          .map((line) => ({ ...line, purchase }))
      : [],
  );
  const receivableShipments = shipments.filter(
    (shipment) => shipment.status === 'ARRIVED' && shipment.receivingStatus !== 'RECEIVED',
  );
  const receivableAllocations = receivableShipments
    .filter((shipment) => !receiptShipmentId || shipment.id === receiptShipmentId)
    .flatMap((shipment) =>
      shipment.allocations
        .filter((line) => Number(line.receivedQuantity) < Number(line.allocatedQuantity))
        .map((line) => ({ ...line, shipment })),
    );

  async function run(action: () => Promise<unknown>, success: string, close?: () => void) {
    setSaving(true);
    setNotice(undefined);
    try {
      await action();
      close?.();
      setNotice({ tone: 'success', message: success });
      await reload();
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'This action could not be completed.',
      });
    } finally {
      setSaving(false);
    }
  }

  function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        request('/admin/suppliers', {
          method: 'POST',
          body: JSON.stringify({
            code: form.get('code'),
            name: form.get('name'),
            supplierType: form.get('supplierType'),
            countryCode: form.get('countryCode') || undefined,
            preferredCurrencyCode: form.get('preferredCurrencyCode') || undefined,
            leadTimeDays: form.get('leadTimeDays') ? Number(form.get('leadTimeDays')) : undefined,
            paymentTerms: form.get('paymentTerms') || undefined,
            websiteUrl: form.get('websiteUrl') || undefined,
            contactName: form.get('contactName') || undefined,
            contactEmail: form.get('contactEmail') || undefined,
            contactPhone: form.get('contactPhone') || undefined,
            notes: form.get('notes') || undefined,
          }),
        }),
      'Supplier added. It is ready for new purchases.',
      () => setCreateOpen(false),
    );
  }

  function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSupplier) return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        request(`/admin/suppliers/${editingSupplier.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: editingSupplier.version,
            name: form.get('name'),
            status: form.get('status'),
            supplierType: form.get('supplierType'),
            countryCode: form.get('countryCode') || null,
            preferredCurrencyCode: form.get('preferredCurrencyCode') || null,
            leadTimeDays: form.get('leadTimeDays') ? Number(form.get('leadTimeDays')) : null,
            paymentTerms: form.get('paymentTerms') || null,
            websiteUrl: form.get('websiteUrl') || null,
            contactName: form.get('contactName') || null,
            contactEmail: form.get('contactEmail') || null,
            contactPhone: form.get('contactPhone') || null,
            notes: form.get('notes') || null,
          }),
        }),
      'Supplier details saved.',
      () => setEditingSupplier(undefined),
    );
  }

  function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        request('/admin/purchases', {
          method: 'POST',
          body: JSON.stringify({
            supplierId: form.get('supplierId'),
            currencyCode: form.get('currencyCode'),
            supplierReference: form.get('supplierReference') || undefined,
            orderDate: form.get('orderDate') || undefined,
            expectedDate: form.get('expectedDate') || undefined,
            destinationLocationId: form.get('destinationLocationId') || undefined,
            notes: form.get('notes') || undefined,
          }),
        }),
      'Draft purchase created. Add its product lines next.',
      () => setCreateOpen(false),
    );
  }

  function addPurchaseLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linePurchase) return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        request(`/admin/purchases/${linePurchase.id}/lines`, {
          method: 'POST',
          body: JSON.stringify({
            variantId: form.get('variantId'),
            quantity: form.get('quantity'),
            unitPrice: form.get('unitPrice'),
          }),
        }),
      'Purchase line added.',
      () => setLinePurchase(undefined),
    );
  }

  function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!shipmentLines.length) {
      setNotice({ tone: 'warning', message: 'Add at least one purchase line.' });
      return;
    }
    void run(
      () =>
        request('/admin/inbound-shipments', {
          method: 'POST',
          body: JSON.stringify({
            receivingLocationId: form.get('receivingLocationId'),
            transportMode: form.get('transportMode'),
            originText: form.get('originText') || undefined,
            trackingReference: form.get('trackingReference') || undefined,
            expectedArrivalDate: form.get('expectedArrivalDate') || undefined,
            allocations: shipmentLines,
          }),
        }),
      'Shipment planned. Record departure when the goods start moving.',
      () => {
        setCreateOpen(false);
        setShipmentLines([]);
      },
    );
  }

  function postReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!receiptShipmentId || !receiptLines.length) {
      setNotice({
        tone: 'warning',
        message: 'Choose a shipment and add at least one counted line.',
      });
      return;
    }
    void run(
      () =>
        request(`/admin/inbound-shipments/${receiptShipmentId}/receipts`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            packingSlipReference: form.get('packingSlipReference') || undefined,
            notes: form.get('notes') || undefined,
            lines: receiptLines,
          }),
        }),
      'Receipt posted. Inventory and provisional cost evidence match the physical count.',
      () => {
        setCreateOpen(false);
        setReceiptShipmentId('');
        setReceiptLines([]);
      },
    );
  }

  function transition(path: string, version: number, success: string, idempotent = false) {
    void run(
      () =>
        request(path, {
          method: 'POST',
          ...(idempotent ? { headers: { 'idempotency-key': crypto.randomUUID() } } : {}),
          body: JSON.stringify({ version }),
        }),
      success,
    );
  }

  const [title, description, actionLabel] = screenCopy[screen];
  return (
    <main className="min-h-screen bg-muted/30 p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Supply / {title}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setHelpOpen(true)}
              title={`Learn how ${title.toLowerCase()} works`}
            >
              <BookOpen /> How it works
            </Button>
            <Button
              variant="outline"
              onClick={() => void reload()}
              disabled={loading}
              title="Reload current records"
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)} title={actionLabel}>
              <Plus /> {actionLabel}
            </Button>
          </div>
        </header>
        <StatCards overview={overview} screen={screen} />
        {notice ? (
          <OperationalFeedback tone={notice.tone}>{notice.message}</OperationalFeedback>
        ) : null}
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <span className="sr-only">Search {title.toLowerCase()}</span>
              <Input
                className="pl-9"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={`Search ${title.toLowerCase()}…`}
                title={`Search ${title.toLowerCase()}`}
              />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                className="h-8 rounded-lg border bg-background px-3 text-sm"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                title="Filter by status"
              >
                <option value="ALL">All statuses</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-sm text-muted-foreground">
              {filtered.length} result{filtered.length === 1 ? '' : 's'}
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading supply records…
            </div>
          ) : !visible.length ? (
            <OperationalEmptyState
              title={
                query || status !== 'ALL' ? 'No matching records' : `No ${title.toLowerCase()} yet`
              }
              description={
                query || status !== 'ALL'
                  ? 'Clear the search or status filter.'
                  : `Use “${actionLabel}” to begin this workflow.`
              }
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus /> {actionLabel}
                </Button>
              }
            />
          ) : screen === 'suppliers' ? (
            <SuppliersTable
              items={visible as SupplierDto[]}
              purchases={purchases}
              onEdit={setEditingSupplier}
            />
          ) : screen === 'purchases' ? (
            <PurchasesTable
              items={visible as PurchaseDto[]}
              expanded={expandedPurchase}
              setExpanded={setExpandedPurchase}
              onLine={setLinePurchase}
              onCancel={(purchase) => setConfirmAction({ kind: 'cancel-purchase', purchase })}
              transition={transition}
              run={run}
            />
          ) : screen === 'shipments' ? (
            <ShipmentsTable
              items={visible as InboundShipmentDto[]}
              expanded={expandedShipment}
              setExpanded={setExpandedShipment}
              onCancel={(shipment) => setConfirmAction({ kind: 'cancel-shipment', shipment })}
              transition={transition}
            />
          ) : (
            <ReceiptsTable items={visible as InboundReceiptDto[]} shipments={shipments} />
          )}
          {!loading && filtered.length ? (
            <Pager page={page} total={filtered.length} onChange={setPage} />
          ) : null}
        </section>
      </div>

      <HowToDialog screen={screen} open={helpOpen} onOpenChange={setHelpOpen} />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{actionLabel}</DialogTitle>
            <DialogDescription>
              {screen === 'receiving'
                ? 'Record the physical count. Expected quantity is only a guide.'
                : 'Only useful details are shown here.'}
            </DialogDescription>
          </DialogHeader>
          {screen === 'suppliers' ? (
            <SupplierForm onSubmit={createSupplier} saving={saving} />
          ) : null}
          {screen === 'purchases' ? (
            <PurchaseForm
              suppliers={suppliers}
              locations={locations}
              onSubmit={createPurchase}
              saving={saving}
            />
          ) : null}
          {screen === 'shipments' ? (
            <ShipmentForm
              locations={locations}
              shippableLines={shippableLines}
              lines={shipmentLines}
              setLines={setShipmentLines}
              onSubmit={createShipment}
              saving={saving}
            />
          ) : null}
          {screen === 'receiving' ? (
            <ReceiptForm
              shipments={receivableShipments}
              allocations={receivableAllocations}
              shipmentId={receiptShipmentId}
              setShipmentId={setReceiptShipmentId}
              lines={receiptLines}
              setLines={setReceiptLines}
              onSubmit={postReceipt}
              saving={saving}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editingSupplier)}
        onOpenChange={(open) => !open && setEditingSupplier(undefined)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {editingSupplier ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit {editingSupplier.name}</DialogTitle>
                <DialogDescription>
                  Changes keep every purchase and shipment in history.
                </DialogDescription>
              </DialogHeader>
              <SupplierForm supplier={editingSupplier} onSubmit={saveSupplier} saving={saving} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(linePurchase)}
        onOpenChange={(open) => !open && setLinePurchase(undefined)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a purchase line</DialogTitle>
            <DialogDescription>
              {linePurchase?.purchaseNumber} · choose the SKU and enter supplier quantity and unit
              cost.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={addPurchaseLine}>
            <Field label="Product and SKU" hint="Only active catalog variants appear.">
              <select
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                name="variantId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a product variant
                </option>
                {variants
                  .filter((variant) => variant.status === 'ACTIVE')
                  .map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.productTitle} · {variant.sku}
                      {variant.optionSummary ? ` · ${variant.optionSummary}` : ''}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity">
                <Input
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  defaultValue="1"
                  required
                />
              </Field>
              <Field
                label={`Unit cost (${linePurchase?.currencyCode ?? ''})`}
                hint="Supplier cost for one unit, before shared shipment costs."
              >
                <Input
                  name="unitPrice"
                  type="number"
                  min="0"
                  step="0.0001"
                  defaultValue="0"
                  required
                />
              </Field>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Plus />} Add line
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Cancel this {confirmAction?.kind === 'cancel-purchase' ? 'purchase' : 'shipment'}?
            </DialogTitle>
            <DialogDescription>
              History stays visible. Add a reason so another operator understands what happened.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirmAction) return;
              const reason = String(new FormData(event.currentTarget).get('reason'));
              const path =
                confirmAction.kind === 'cancel-purchase'
                  ? `/admin/purchases/${confirmAction.purchase.id}/cancel`
                  : `/admin/inbound-shipments/${confirmAction.shipment.id}/cancel`;
              const version =
                confirmAction.kind === 'cancel-purchase'
                  ? confirmAction.purchase.version
                  : confirmAction.shipment.version;
              void run(
                () => request(path, { method: 'POST', body: JSON.stringify({ version, reason }) }),
                'Cancellation recorded. History remains available.',
                () => setConfirmAction(undefined),
              );
            }}
          >
            <Field label="Reason">
              <Textarea
                name="reason"
                required
                placeholder="Example: Supplier could not fulfill the order"
              />
            </Field>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Keep it</DialogClose>
              <Button variant="destructive" type="submit" disabled={saving}>
                Cancel and keep history
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
