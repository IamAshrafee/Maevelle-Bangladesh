'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CreditCard,
  Edit3,
  Loader2,
  PackagePlus,
  Plus,
  ReceiptText,
  Ship,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type {
  ApiEnvelope,
  CatalogVariantChoiceDto,
  InboundShipmentDto,
  PaginatedResultDto,
  PurchaseDto,
  SupplierDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalEmptyState, OperationalFeedback } from '@/components/operational-worklist';
import {
  DetailMetric,
  DetailSection,
  DetailSkeleton,
  QuantityProgress,
} from '@/components/supply/supply-entity-ui';
import { SupplyField, supplySelectClassName } from '@/components/supply/supply-field';
import { PurchaseForm } from '@/components/supply/supply-forms';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
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
import {
  formatSupplyDate,
  formatSupplyMoney,
  formatSupplyNumber,
  supplyRequest,
} from '@/lib/supply/api';
import {
  nextPurchaseAction,
  purchaseQuantities,
  purchaseWorkflowStatus,
} from '@/lib/supply/status';
import type { PagedEnvelope } from '@/lib/supply/types';

type SupplierInvoice = {
  id: string;
  expense_number: string;
  description: string;
  amount: string;
  currency_code: string;
  expense_date: string;
  status: string;
  category_name: string;
  paid: string;
  adjustments: string;
  outstanding: string;
  source_domain: string | null;
  source_id: string | null;
};
type ExpenseCategory = { id: string; name: string; status: string };
type FinancialAccount = {
  id: string;
  name: string;
  currency_code: string;
  status: string;
  ledger_balance: string;
};

export function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
  const canManage = useAdminCapability('procurement.manage');
  const canViewShipments = useAdminCapability('inbound_shipment.view');
  const canManageShipments = useAdminCapability('inbound_shipment.manage');
  const canViewFinance = useAdminCapability('finance.expenses.view');
  const canCreateInvoiceCapability = useAdminCapability('finance.expenses.create');
  const canPayInvoice = useAdminCapability('finance.expenses.pay');
  const canViewAccounts = useAdminCapability('finance.accounts.view');
  const [purchase, setPurchase] = useState<PurchaseDto>();
  const [shipments, setShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [variants, setVariants] = useState<readonly CatalogVariantChoiceDto[]>([]);
  const [suppliers, setSuppliers] = useState<readonly SupplierDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [invoices, setInvoices] = useState<readonly SupplierInvoice[]>([]);
  const [categories, setCategories] = useState<readonly ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<readonly FinancialAccount[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<PurchaseDto['lines'][number]>();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoice>();
  const canCreateInvoice = canCreateInvoiceCapability && purchase?.status === 'PLACED';

  async function load(signal?: AbortSignal) {
    setState('loading');
    try {
      const init = signal ? { signal } : undefined;
      const [
        purchaseResult,
        shipmentResult,
        variantResult,
        expenseResult,
        categoryResult,
        accountResult,
        supplierResult,
        locationResult,
      ] = await Promise.all([
        supplyRequest<ApiEnvelope<PurchaseDto>>(`/admin/purchases/${purchaseId}`, init),
        canViewShipments
          ? supplyRequest<PagedEnvelope<InboundShipmentDto>>(
              `/admin/inbound-shipments?purchaseId=${encodeURIComponent(purchaseId)}&pageSize=100`,
              init,
            )
          : Promise.resolve({ data: [] as readonly InboundShipmentDto[] }),
        canManage
          ? supplyRequest<ApiEnvelope<readonly CatalogVariantChoiceDto[]>>(
              '/admin/catalog/variants',
              init,
            )
          : Promise.resolve({ data: [] as readonly CatalogVariantChoiceDto[] }),
        canViewFinance
          ? supplyRequest<ApiEnvelope<PaginatedResultDto<SupplierInvoice>>>(
              `/admin/finance/expenses?sourceDomain=procurement.purchase&sourceId=${encodeURIComponent(purchaseId)}&pageSize=100`,
              init,
            )
          : Promise.resolve({
              data: {
                items: [] as readonly SupplierInvoice[],
                pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
              },
            }),
        canViewFinance
          ? supplyRequest<ApiEnvelope<readonly ExpenseCategory[]>>(
              '/admin/finance/categories',
              init,
            )
          : Promise.resolve({ data: [] as readonly ExpenseCategory[] }),
        canViewAccounts
          ? supplyRequest<ApiEnvelope<readonly FinancialAccount[]>>('/admin/finance/accounts', init)
          : Promise.resolve({ data: [] as readonly FinancialAccount[] }),
        canManage
          ? supplyRequest<PagedEnvelope<SupplierDto>>('/admin/suppliers?pageSize=100', init)
          : Promise.resolve({ data: [] as readonly SupplierDto[] }),
        canManage
          ? supplyRequest<ApiEnvelope<readonly WarehouseLocationDto[]>>(
              '/admin/warehouse/locations',
              init,
            )
          : Promise.resolve({ data: [] as readonly WarehouseLocationDto[] }),
      ]);
      setPurchase(purchaseResult.data);
      setShipments(shipmentResult.data);
      setVariants(variantResult.data);
      setInvoices(
        expenseResult.data.items.filter(
          (invoice) =>
            invoice.source_domain === 'procurement.purchase' && invoice.source_id === purchaseId,
        ),
      );
      setCategories(categoryResult.data);
      setAccounts(accountResult.data);
      setSuppliers(supplierResult.data);
      setLocations(locationResult.data);
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Purchase could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [canManage, canViewAccounts, canViewFinance, canViewShipments, purchaseId]);

  async function run(action: () => Promise<unknown>, confirmation: string, close?: () => void) {
    setBusy(true);
    setMessage('');
    setSuccess('');
    try {
      await action();
      close?.();
      setSuccess(confirmation);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The purchase could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  function addLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchaseId}/lines`, {
          method: 'POST',
          body: JSON.stringify({
            variantId: form.get('variantId'),
            quantity: form.get('quantity'),
            unitPrice: form.get('unitPrice'),
          }),
        }),
      'Purchase item added.',
      () => setAddLineOpen(false),
    );
  }

  function savePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purchase) return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: purchase.version,
            supplierId: form.get('supplierId'),
            currencyCode: form.get('currencyCode'),
            supplierReference: form.get('supplierReference') || null,
            orderDate: form.get('orderDate'),
            expectedDate: form.get('expectedDate') || null,
            destinationLocationId: form.get('destinationLocationId') || null,
            notes: form.get('notes') || null,
          }),
        }),
      'Purchase details saved.',
      () => setEditOpen(false),
    );
  }

  function saveLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purchase || !editingLine) return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}/lines/${editingLine.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            quantity: form.get('quantity'),
            unitPrice: form.get('unitPrice'),
          }),
        }),
      'Purchase item updated.',
      () => setEditingLine(undefined),
    );
  }

  function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        supplyRequest('/admin/finance/expenses', {
          method: 'POST',
          body: JSON.stringify({
            categoryId: form.get('categoryId'),
            amount: form.get('amount'),
            currencyCode: purchase?.currencyCode,
            description: form.get('description'),
            expenseDate: form.get('expenseDate'),
            sourceDomain: 'procurement.purchase',
            sourceId: purchaseId,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      'Supplier invoice recorded. It is now visible in both Supply and Finance.',
      () => setInvoiceOpen(false),
    );
  }

  function payInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingInvoice) return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        supplyRequest(`/admin/finance/expenses/${payingInvoice.id}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            accountId: form.get('accountId'),
            amount: form.get('amount'),
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      'Supplier payment posted to the Finance cash ledger.',
      () => setPayingInvoice(undefined),
    );
  }

  if (state === 'loading' && !purchase) return <DetailSkeleton />;
  if (!purchase) {
    return (
      <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Purchase was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/purchases" />}>
          <ArrowLeft /> Back to purchases
        </Button>
      </main>
    );
  }

  const totals = purchaseQuantities(purchase);
  const workflowStatus = purchaseWorkflowStatus(purchase);
  const activeVariants = variants.filter((variant) => variant.status === 'ACTIVE');
  const invoiceTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  const paidTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.paid), 0);
  const outstandingTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding), 0);

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Purchases', href: '/purchases' },
          { label: purchase.purchaseNumber, current: true },
        ]}
      />
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-pretty text-2xl font-semibold tracking-tight">
              {purchase.purchaseNumber}
            </h1>
            <StatusBadge status={workflowStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Ordered from{' '}
            <Link
              href={`/suppliers/${purchase.supplierId}`}
              className="font-medium text-foreground hover:underline"
            >
              {purchase.supplierName}
            </Link>{' '}
            · {nextPurchaseAction(purchase)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {purchase.status === 'DRAFT' && canManage ? (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Edit3 /> Edit details
              </Button>
              <Button variant="outline" onClick={() => setAddLineOpen(true)}>
                <Plus /> Add item
              </Button>
              <Button
                disabled={busy || !purchase.lines.length}
                onClick={() =>
                  void run(
                    () =>
                      supplyRequest(`/admin/purchases/${purchase.id}/place`, {
                        method: 'POST',
                        body: JSON.stringify({ version: purchase.version }),
                      }),
                    'Purchase placed. Its items are ready for shipment planning.',
                  )
                }
              >
                <Check /> Place order
              </Button>
            </>
          ) : null}
          {purchase.status === 'PLACED' &&
          canManageShipments &&
          totals.allocated < totals.ordered ? (
            <Button
              render={<Link href={`/inbound-shipments?create=shipment&purchase=${purchase.id}`} />}
            >
              <Ship /> Plan shipment
            </Button>
          ) : null}
          {purchase.status !== 'CANCELLED' && totals.allocated === 0 && canManage ? (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </header>

      {message ? <OperationalFeedback tone="danger">{message}</OperationalFeedback> : null}
      {success ? <OperationalFeedback>{success}</OperationalFeedback> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailMetric
          label="Supplier"
          value={
            <Link href={`/suppliers/${purchase.supplierId}`} className="hover:underline">
              {purchase.supplierName}
            </Link>
          }
          hint={purchase.supplierReference ?? 'No supplier reference'}
        />
        <DetailMetric
          label="Purchase value"
          value={formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
          hint={`${purchase.lines.length} item line${purchase.lines.length === 1 ? '' : 's'}`}
        />
        <DetailMetric
          label="Order date"
          value={formatSupplyDate(purchase.orderDate)}
          hint={`Expected ${formatSupplyDate(purchase.expectedDate)}`}
        />
        <DetailMetric
          label="Destination"
          value={purchase.destinationLocationName ?? 'Not assigned'}
          hint="Shipment destination can be selected later"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection
          title="Shipment progress"
          description="How much of the order has been assigned to inbound freight."
        >
          <div className="p-4">
            <QuantityProgress
              label="Allocated"
              complete={totals.allocated}
              total={totals.ordered}
              detail={`${formatSupplyNumber(String(totals.ordered - totals.allocated))} units still need a shipment`}
            />
          </div>
        </DetailSection>
        <DetailSection
          title="Receiving progress"
          description="Physical counts posted to Inventory."
        >
          <div className="p-4">
            <QuantityProgress
              label="Received"
              complete={totals.received}
              total={totals.ordered}
              detail={`${formatSupplyNumber(String(totals.ordered - totals.received))} units not yet received`}
            />
          </div>
        </DetailSection>
      </div>

      {canViewFinance ? (
        <DetailSection
          title="Supplier invoices & payments"
          description="Payables are linked to this purchase; cash movement remains authoritative in Finance."
          action={
            canCreateInvoice ? (
              <Button size="sm" variant="outline" onClick={() => setInvoiceOpen(true)}>
                <ReceiptText /> Record invoice
              </Button>
            ) : undefined
          }
        >
          <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
            <DetailMetric
              label="Invoiced"
              value={formatSupplyMoney(String(invoiceTotal), purchase.currencyCode)}
            />
            <DetailMetric
              label="Paid"
              value={formatSupplyMoney(String(paidTotal), purchase.currencyCode)}
            />
            <DetailMetric
              label="Outstanding"
              value={formatSupplyMoney(String(outstandingTotal), purchase.currencyCode)}
            />
          </div>
          {!invoices.length ? (
            <OperationalEmptyState
              title="No supplier invoice recorded"
              description="Record the supplier's invoice to track paid and outstanding amounts without duplicating the Finance ledger."
              action={
                canCreateInvoice ? (
                  <Button onClick={() => setInvoiceOpen(true)}>
                    <ReceiptText /> Record supplier invoice
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y">
              {invoices.map((invoice) => (
                <div
                  className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                  key={invoice.id}
                >
                  <div>
                    <p className="font-medium">
                      {invoice.expense_number} · {invoice.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.category_name} · {formatSupplyDate(invoice.expense_date)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Paid </span>
                      <strong>{formatSupplyMoney(invoice.paid, invoice.currency_code)}</strong>
                      <span className="text-muted-foreground"> · Due </span>
                      <strong>
                        {formatSupplyMoney(invoice.outstanding, invoice.currency_code)}
                      </strong>
                    </div>
                    {canPayInvoice && Number(invoice.outstanding) > 0 ? (
                      <Button size="sm" onClick={() => setPayingInvoice(invoice)}>
                        <CreditCard /> Record payment
                      </Button>
                    ) : (
                      <StatusBadge
                        status={Number(invoice.outstanding) <= 0 ? 'PAID' : 'OUTSTANDING'}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DetailSection>
      ) : null}

      <DetailSection
        title="Purchase items"
        description="Supplier quantities and prices are editable only while this purchase is a draft."
        action={
          purchase.status === 'DRAFT' && canManage ? (
            <Button size="sm" variant="outline" onClick={() => setAddLineOpen(true)}>
              <PackagePlus /> Add item
            </Button>
          ) : undefined
        }
      >
        {!purchase.lines.length ? (
          <OperationalEmptyState
            title="No purchase items yet"
            description="Add at least one catalog variant before placing this order."
            action={
              canManage ? (
                <Button onClick={() => setAddLineOpen(true)}>
                  <Plus /> Add first item
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y">
            {purchase.lines.map((line) => (
              <div
                className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(6rem,0.6fr))_auto] lg:items-center"
                key={line.id}
              >
                <div className="min-w-0">
                  <Link
                    className="truncate font-medium hover:underline"
                    href={`/products/${line.productId}`}
                  >
                    {line.productTitle}
                  </Link>
                  <p className="truncate font-mono text-xs text-muted-foreground">{line.sku}</p>
                  <Link
                    className="text-xs text-primary hover:underline"
                    href={`/inventory/adjustments?variantId=${encodeURIComponent(line.variantId)}`}
                  >
                    View inventory
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ordered</p>
                  <p className="font-medium tabular-nums">{formatSupplyNumber(line.quantity)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Shipped</p>
                  <p className="font-medium tabular-nums">
                    {formatSupplyNumber(line.allocatedQuantity)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Received</p>
                  <p className="font-medium tabular-nums">
                    {formatSupplyNumber(line.receivedQuantity)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unit cost</p>
                  <p className="font-medium tabular-nums">
                    {formatSupplyMoney(line.unitPrice, purchase.currencyCode)}
                  </p>
                </div>
                {purchase.status === 'DRAFT' && canManage ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      title={`Edit ${line.sku}`}
                      onClick={() => setEditingLine(line)}
                    >
                      <Edit3 />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      title={`Remove ${line.sku}`}
                      onClick={() =>
                        void run(
                          () =>
                            supplyRequest(`/admin/purchases/${purchase.id}/lines/${line.id}`, {
                              method: 'DELETE',
                            }),
                          'Purchase item removed.',
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection
        title="Inbound shipments"
        description="Every shipment carrying an item from this purchase."
      >
        {!shipments.length ? (
          <OperationalEmptyState
            title="No shipments yet"
            description={
              purchase.status === 'DRAFT'
                ? 'Place the purchase before planning inbound freight.'
                : 'Plan a shipment when the supplier dispatch is known.'
            }
            action={
              purchase.status === 'PLACED' && canManageShipments ? (
                <Button
                  render={
                    <Link href={`/inbound-shipments?create=shipment&purchase=${purchase.id}`} />
                  }
                >
                  <Ship /> Plan shipment
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y">
            {shipments.map((shipment) => (
              <Link
                href={`/inbound-shipments/${shipment.id}`}
                className="flex flex-col gap-2 p-4 no-underline hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                key={shipment.id}
              >
                <div>
                  <p className="font-medium">{shipment.shipmentNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {shipment.transportMode} · {shipment.receivingLocationName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={shipment.status} />
                  <StatusBadge status={shipment.receivingStatus} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </DetailSection>

      {purchase.notes ? (
        <DetailSection title="Notes">
          <p className="whitespace-pre-wrap p-4 text-sm text-muted-foreground">{purchase.notes}</p>
        </DetailSection>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {purchase.purchaseNumber}</DialogTitle>
            <DialogDescription>
              Update the supplier reference, dates, expected destination, or internal notes while
              this purchase is still a draft.
            </DialogDescription>
          </DialogHeader>
          <PurchaseForm
            suppliers={suppliers}
            locations={locations}
            purchase={purchase}
            onSubmit={savePurchase}
            saving={busy}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add purchase item</DialogTitle>
            <DialogDescription>
              Choose an active catalog variant and enter the supplier quantity and unit price.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={addLine}>
            <SupplyField label="Product and SKU">
              <select className={supplySelectClassName} name="variantId" required defaultValue="">
                <option value="" disabled>
                  {activeVariants.length
                    ? 'Choose a product variant'
                    : 'No active catalog variants'}
                </option>
                {activeVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.productTitle} · {variant.sku}
                    {variant.optionSummary ? ` · ${variant.optionSummary}` : ''}
                  </option>
                ))}
              </select>
            </SupplyField>
            <div className="grid gap-4 sm:grid-cols-2">
              <SupplyField label="Quantity">
                <Input
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  defaultValue="1"
                  required
                />
              </SupplyField>
              <SupplyField label={`Unit cost (${purchase.currencyCode})`}>
                <Input
                  name="unitPrice"
                  type="number"
                  min="0"
                  step="0.0001"
                  defaultValue="0"
                  required
                />
              </SupplyField>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={busy || !activeVariants.length}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add item
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingLine)}
        onOpenChange={(open) => !open && setEditingLine(undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editingLine?.sku}</DialogTitle>
            <DialogDescription>
              Change the supplier quantity or unit cost before placing this purchase.
            </DialogDescription>
          </DialogHeader>
          {editingLine ? (
            <form className="grid gap-4" onSubmit={saveLine}>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="font-medium">{editingLine.productTitle}</p>
                <p className="font-mono text-xs text-muted-foreground">{editingLine.sku}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SupplyField label="Quantity">
                  <Input
                    name="quantity"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    defaultValue={editingLine.quantity}
                    required
                  />
                </SupplyField>
                <SupplyField label={`Unit cost (${purchase.currencyCode})`}>
                  <Input
                    name="unitPrice"
                    type="number"
                    min="0"
                    step="0.0001"
                    defaultValue={editingLine.unitPrice}
                    required
                  />
                </SupplyField>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" type="button" />}>
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />} Save item
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {purchase.purchaseNumber}?</DialogTitle>
            <DialogDescription>
              This keeps the purchase in history. Purchases already allocated to shipments cannot be
              cancelled here.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(new FormData(event.currentTarget).get('reason'));
              void run(
                () =>
                  supplyRequest(`/admin/purchases/${purchase.id}/cancel`, {
                    method: 'POST',
                    body: JSON.stringify({ version: purchase.version, reason }),
                  }),
                'Purchase cancelled.',
                () => setCancelOpen(false),
              );
            }}
          >
            <SupplyField label="Reason">
              <Textarea name="reason" required placeholder="Why is this order being cancelled?" />
            </SupplyField>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Keep order
              </DialogClose>
              <Button variant="destructive" type="submit" disabled={busy}>
                Cancel purchase
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record supplier invoice</DialogTitle>
            <DialogDescription>
              Creates a Finance payable linked to {purchase.purchaseNumber}. Payments will reduce a
              real financial account.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={createInvoice}>
            <SupplyField label="Expense category">
              <select className={supplySelectClassName} name="categoryId" required defaultValue="">
                <option value="" disabled>
                  {categories.length
                    ? 'Choose a category'
                    : 'Create a Finance expense category first'}
                </option>
                {categories
                  .filter((category) => category.status === 'ACTIVE')
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </SupplyField>
            <SupplyField label="Description">
              <Input
                name="description"
                required
                defaultValue={`Supplier invoice for ${purchase.purchaseNumber}`}
              />
            </SupplyField>
            <div className="grid gap-4 sm:grid-cols-2">
              <SupplyField label={`Invoice amount (${purchase.currencyCode})`}>
                <Input
                  name="amount"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  defaultValue={purchase.totalAmount}
                  required
                />
              </SupplyField>
              <SupplyField label="Invoice date">
                <Input
                  name="expenseDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </SupplyField>
            </div>
            {!categories.length ? (
              <p className="text-sm text-amber-700">
                Set up an expense category in{' '}
                <Link className="underline" href="/finance/expenses">
                  Finance → Expenses
                </Link>{' '}
                before recording this invoice.
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={busy || !categories.length}>
                {busy ? <Loader2 className="animate-spin" /> : <ReceiptText />} Record invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(payingInvoice)}
        onOpenChange={(open) => !open && setPayingInvoice(undefined)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record supplier payment</DialogTitle>
            <DialogDescription>
              This posts an immutable cash movement and reduces the invoice outstanding balance.
            </DialogDescription>
          </DialogHeader>
          {payingInvoice ? (
            <form className="grid gap-4" onSubmit={payInvoice}>
              <SupplyField label="Pay from account">
                <select className={supplySelectClassName} name="accountId" required defaultValue="">
                  <option value="" disabled>
                    Choose an active {payingInvoice.currency_code} account
                  </option>
                  {accounts
                    .filter(
                      (account) =>
                        account.status === 'ACTIVE' &&
                        account.currency_code === payingInvoice.currency_code,
                    )
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · balance{' '}
                        {formatSupplyMoney(account.ledger_balance, account.currency_code)}
                      </option>
                    ))}
                </select>
              </SupplyField>
              <SupplyField label={`Payment amount (${payingInvoice.currency_code})`}>
                <Input
                  name="amount"
                  type="number"
                  min="0.0001"
                  max={payingInvoice.outstanding}
                  step="0.0001"
                  defaultValue={payingInvoice.outstanding}
                  required
                />
              </SupplyField>
              {!accounts.some(
                (account) =>
                  account.status === 'ACTIVE' &&
                  account.currency_code === payingInvoice.currency_code,
              ) ? (
                <p className="text-sm text-amber-700">
                  No active account uses this currency. Set one up in{' '}
                  <Link className="underline" href="/finance/accounts">
                    Finance → Accounts
                  </Link>
                  .
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" type="button" />}>
                  Cancel
                </DialogClose>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !accounts.some(
                      (account) =>
                        account.status === 'ACTIVE' &&
                        account.currency_code === payingInvoice.currency_code,
                    )
                  }
                >
                  {busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Post payment
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
