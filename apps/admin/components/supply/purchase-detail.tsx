'use client';

import Link from 'next/link';
import { ArrowLeft, Box, DollarSign, FileText, Package, Ship } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { OperationalFeedback } from '@/components/operational-worklist';
import { DetailSkeleton } from '@/components/supply/supply-entity-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { supplyRequest } from '@/lib/supply/api';
import type { PagedEnvelope } from '@/lib/supply/types';

import { PurchaseDetailFinanceTab } from './purchase-detail/purchase-detail-finance-tab';
import { PurchaseDetailHeader } from './purchase-detail/purchase-detail-header';
import { PurchaseDetailItemsTable } from './purchase-detail/purchase-detail-items-table';
import { PurchaseDetailOverviewTab } from './purchase-detail/purchase-detail-overview-tab';
import { PurchaseDetailShipmentsTab } from './purchase-detail/purchase-detail-shipments-tab';
import { PurchaseDetailStats } from './purchase-detail/purchase-detail-stats';
import { PurchaseAddLineDialog } from './purchase-detail/dialogs/purchase-add-line-dialog';
import { PurchaseAdjustInvoiceDialog } from './purchase-detail/dialogs/purchase-adjust-invoice-dialog';
import { PurchaseCancelDialog } from './purchase-detail/dialogs/purchase-cancel-dialog';
import { PurchaseCancelInvoiceDialog } from './purchase-detail/dialogs/purchase-cancel-invoice-dialog';
import { PurchaseCloseDialog } from './purchase-detail/dialogs/purchase-close-dialog';
import { PurchaseEditDialog } from './purchase-detail/dialogs/purchase-edit-dialog';
import { PurchaseEditLineDialog } from './purchase-detail/dialogs/purchase-edit-line-dialog';
import { PurchaseInvoiceDialog } from './purchase-detail/dialogs/purchase-invoice-dialog';
import { PurchasePayDialog } from './purchase-detail/dialogs/purchase-pay-dialog';
import { PurchaseInvoiceDetailSheet } from './purchase-detail/sheets/purchase-invoice-detail-sheet';
import { PlanShipmentDialog } from './plan-shipment-dialog';
import type { ExpenseCategory, FinancialAccount, PurchaseLine, SupplierInvoice } from './purchase-detail/types';

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

  // Dialog states
  const [editOpen, setEditOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<PurchaseLine>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoice>();
  const [cancellingInvoice, setCancellingInvoice] = useState<SupplierInvoice>();
  const [adjustingInvoice, setAdjustingInvoice] = useState<SupplierInvoice>();
  const [inspectingInvoiceId, setInspectingInvoiceId] = useState<string>();
  const [planShipmentOpen, setPlanShipmentOpen] = useState(false);

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

  // --- Handlers ---
  function handleSaveHeader(data: {
    supplierId: string;
    currencyCode: 'BDT' | 'CNY' | 'USD';
    orderDate: string;
    expectedDate: string | null;
    destinationLocationId: string | null;
    supplierReference: string | null;
    notes: string | null;
  }) {
    if (!purchase) return;
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: purchase.version,
            ...data,
          }),
        }),
      'Purchase details saved successfully.',
      () => setEditOpen(false),
    );
  }

  function handleAddLine(data: { variantId: string; quantity: string; unitPrice: string }) {
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchaseId}/lines`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      'Purchase item added.',
      () => setAddLineOpen(false),
    );
  }

  function handleSaveLine(lineId: string, quantity: string, unitPrice: string) {
    if (!purchase) return;
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}/lines/${lineId}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity, unitPrice }),
        }),
      'Purchase item updated.',
      () => setEditingLine(undefined),
    );
  }

  function handleDeleteLine(lineId: string) {
    if (!purchase) return;
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}/lines/${lineId}`, {
          method: 'DELETE',
        }),
      'Purchase item removed.',
    );
  }

  function handlePlaceOrder() {
    if (!purchase) return;
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}/place`, {
          method: 'POST',
          body: JSON.stringify({ version: purchase.version }),
        }),
      'Purchase order placed. Lines are ready for inbound freight allocation.',
    );
  }

  function handleCancelOrder(reason: string) {
    if (!purchase) return;
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ version: purchase.version, reason }),
        }),
      'Purchase order cancelled.',
      () => setCancelOpen(false),
    );
  }

  function handleCloseOrder(reason?: string) {
    if (!purchase) return;
    void run(
      () =>
        supplyRequest(`/admin/purchases/${purchase.id}/close`, {
          method: 'POST',
          body: JSON.stringify({
            version: purchase.version,
            ...(reason ? { reason } : {}),
          }),
        }),
      'Purchase order closed.',
      () => setCloseOpen(false),
    );
  }

  function handleCreateInvoice(data: {
    categoryId: string;
    description: string;
    amount: string;
    expenseDate: string;
    payeeName?: string | undefined;
    externalReference?: string | undefined;
    notes?: string | undefined;
    accountId?: string | undefined;
    paymentReference?: string | undefined;
  }) {
    void run(
      () =>
        supplyRequest('/admin/finance/expenses', {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            currencyCode: purchase?.currencyCode,
            sourceDomain: 'procurement.purchase',
            sourceId: purchaseId,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      data.accountId
        ? 'Supplier invoice recorded and payment posted to Finance cash ledger.'
        : 'Supplier invoice recorded in Finance.',
      () => setInvoiceOpen(false),
    );
  }

  function handlePostPayment(data: {
    accountId: string;
    amount: string;
    reference?: string | undefined;
  }) {
    if (!payingInvoice) return;
    void run(
      () =>
        supplyRequest(`/admin/finance/expenses/${payingInvoice.id}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      'Payment posted to Finance ledger.',
      () => setPayingInvoice(undefined),
    );
  }

  function handleCancelInvoice(invoiceId: string, expectedVersion: number, reason: string) {
    void run(
      () =>
        supplyRequest(`/admin/finance/expenses/${invoiceId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion,
            reason,
          }),
        }),
      'Supplier invoice cancelled.',
      () => {
        setCancellingInvoice(undefined);
        if (inspectingInvoiceId === invoiceId) {
          setInspectingInvoiceId(undefined);
        }
      },
    );
  }

  function handleAdjustInvoice(data: {
    invoiceId: string;
    expectedVersion: number;
    adjustmentType: 'CREDIT' | 'CORRECTION' | 'REVERSAL';
    amount: string;
    reason: string;
  }) {
    void run(
      () =>
        supplyRequest(`/admin/finance/expenses/${data.invoiceId}/adjustments`, {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: data.expectedVersion,
            adjustmentType: data.adjustmentType,
            amount: data.amount,
            reason: data.reason,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      'Invoice adjustment recorded.',
      () => setAdjustingInvoice(undefined),
    );
  }

  const purchaseShippableLines = useMemo(() => {
    if (!purchase || purchase.status !== 'PLACED') return [];
    return purchase.lines
      .filter((line) => Number(line.allocatedQuantity) < Number(line.quantity))
      .map((line) => ({ ...line, purchase }));
  }, [purchase]);

  if (state === 'loading' && !purchase) return <DetailSkeleton />;

  if (!purchase) {
    return (
      <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Purchase order was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/purchases" />}>
          <ArrowLeft className="size-4" /> Back to purchases
        </Button>
      </main>
    );
  }

  return (
    <TooltipProvider delay={150}>
      <main className="min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        {/* Header with Title, Status Badge with Tooltip, and Action Toolbar */}
        <PurchaseDetailHeader
          purchase={purchase}
          canManage={canManage}
          canManageShipments={canManageShipments}
          busy={busy}
          onEditClick={() => setEditOpen(true)}
          onAddLineClick={() => setAddLineOpen(true)}
          onPlaceOrderClick={handlePlaceOrder}
          onCancelClick={() => setCancelOpen(true)}
          onCloseClick={() => setCloseOpen(true)}
          onPlanShipmentClick={() => setPlanShipmentOpen(true)}
        />

        {/* Operational Feedback */}
        {message ? <OperationalFeedback tone="danger">{message}</OperationalFeedback> : null}
        {success ? <OperationalFeedback>{success}</OperationalFeedback> : null}

        {/* High-Impact Executive Stats Cards */}
        <PurchaseDetailStats
          purchase={purchase}
          invoices={invoices}
          canViewFinance={canViewFinance}
        />

        {/* Tabbed Focused Workspaces */}
        <Tabs defaultValue="items" className="space-y-4">
          <TabsList variant="default" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="items" className="gap-2">
              <Package className="size-4" />
              <span>Purchase Items</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {purchase.lines.length}
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="shipments" className="gap-2">
              <Ship className="size-4" />
              <span>Inbound Shipments</span>
              {shipments.length > 0 ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {shipments.length}
                </Badge>
              ) : null}
            </TabsTrigger>

            {canViewFinance ? (
              <TabsTrigger value="finance" className="gap-2">
                <DollarSign className="size-4" />
                <span>Invoices & Payments</span>
                {invoices.length > 0 ? (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {invoices.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ) : null}

            <TabsTrigger value="overview" className="gap-2">
              <FileText className="size-4" />
              <span>Overview & Details</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Purchase Items */}
          <TabsContent value="items" className="space-y-4 pt-1 outline-none">
            <PurchaseDetailItemsTable
              purchase={purchase}
              variants={variants}
              canManage={canManage}
              busy={busy}
              onAddLineClick={() => setAddLineOpen(true)}
              onEditLine={setEditingLine}
              onDeleteLine={handleDeleteLine}
            />
          </TabsContent>

          {/* Tab 2: Inbound Shipments */}
          <TabsContent value="shipments" className="space-y-4 pt-1 outline-none">
            <PurchaseDetailShipmentsTab
              purchase={purchase}
              shipments={shipments}
              canManageShipments={canManageShipments}
              onPlanShipmentClick={() => setPlanShipmentOpen(true)}
            />
          </TabsContent>

          {/* Tab 3: Finance & Invoices */}
          {canViewFinance ? (
            <TabsContent value="finance" className="space-y-4 pt-1 outline-none">
              <PurchaseDetailFinanceTab
                purchase={purchase}
                invoices={invoices}
                canCreateInvoice={canCreateInvoice}
                canPayInvoice={canPayInvoice}
                busy={busy}
                onRecordInvoiceClick={() => setInvoiceOpen(true)}
                onPayInvoiceClick={setPayingInvoice}
                onCancelInvoiceClick={setCancellingInvoice}
                onAdjustInvoiceClick={setAdjustingInvoice}
                onInspectInvoiceClick={setInspectingInvoiceId}
              />
            </TabsContent>
          ) : null}

          {/* Tab 4: Overview & Details */}
          <TabsContent value="overview" className="space-y-4 pt-1 outline-none">
            <PurchaseDetailOverviewTab
              purchase={purchase}
              suppliers={suppliers}
              locations={locations}
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <PurchaseEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          purchase={purchase}
          suppliers={suppliers}
          locations={locations}
          busy={busy}
          onSave={handleSaveHeader}
        />

        <PurchaseAddLineDialog
          open={addLineOpen}
          onOpenChange={setAddLineOpen}
          purchase={purchase}
          variants={variants}
          busy={busy}
          onAddLine={handleAddLine}
        />

        <PurchaseEditLineDialog
          line={editingLine}
          purchase={purchase}
          busy={busy}
          onClose={() => setEditingLine(undefined)}
          onSaveLine={handleSaveLine}
        />

        <PurchaseCancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          purchase={purchase}
          busy={busy}
          onConfirmCancel={handleCancelOrder}
        />

        <PurchaseCloseDialog
          open={closeOpen}
          onOpenChange={setCloseOpen}
          purchase={purchase}
          busy={busy}
          onConfirmClose={handleCloseOrder}
        />

        <PurchaseInvoiceDialog
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          purchase={purchase}
          categories={categories}
          accounts={accounts}
          existingInvoices={invoices}
          canPayInvoice={canPayInvoice}
          busy={busy}
          onCreateInvoice={handleCreateInvoice}
        />

        <PurchasePayDialog
          invoice={payingInvoice}
          accounts={accounts}
          busy={busy}
          onClose={() => setPayingInvoice(undefined)}
          onPostPayment={handlePostPayment}
        />

        <PurchaseCancelInvoiceDialog
          invoice={cancellingInvoice}
          busy={busy}
          onClose={() => setCancellingInvoice(undefined)}
          onConfirmCancel={handleCancelInvoice}
        />

        <PurchaseAdjustInvoiceDialog
          invoice={adjustingInvoice}
          busy={busy}
          onClose={() => setAdjustingInvoice(undefined)}
          onAdjustInvoice={handleAdjustInvoice}
        />

        <PurchaseInvoiceDetailSheet
          invoiceId={inspectingInvoiceId}
          open={Boolean(inspectingInvoiceId)}
          canPayInvoice={canPayInvoice}
          canCreateInvoice={canCreateInvoice}
          onClose={() => setInspectingInvoiceId(undefined)}
          onPayClick={(inv) => {
            setPayingInvoice(inv);
          }}
          onAdjustClick={(inv) => {
            setAdjustingInvoice(inv);
          }}
          onCancelClick={(inv) => {
            setCancellingInvoice(inv);
          }}
        />

        <PlanShipmentDialog
          open={planShipmentOpen}
          onOpenChange={setPlanShipmentOpen}
          locations={locations}
          shippableLines={purchaseShippableLines}
          defaultPurchaseId={purchase.id}
          onSuccess={() => {
            void load();
            setSuccess('Inbound freight shipment planned successfully.');
          }}
        />
      </main>
    </TooltipProvider>
  );
}
