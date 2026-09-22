'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CircleDollarSign, Package, PackageCheck, Truck } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope, InboundReceiptDto, InboundShipmentDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { DetailSkeleton } from '@/components/supply/supply-entity-ui';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supplyRequest } from '@/lib/supply/api';
import type { Worksheet } from '@/lib/supply/costing-types';
import type { PagedEnvelope, ReceiptDraftLine } from '@/lib/supply/types';

import { AddCostComponentDialog } from './shipment-detail/dialogs/add-cost-component-dialog';
import { CancelShipmentDialog } from './shipment-detail/dialogs/cancel-shipment-dialog';
import { EditShipmentDialog } from './shipment-detail/dialogs/edit-shipment-dialog';
import { FinalizeCostingDialog } from './shipment-detail/dialogs/finalize-costing-dialog';
import { ReceiveGoodsDialog } from './shipment-detail/dialogs/receive-goods-dialog';
import { StartLandedCostDialog } from './shipment-detail/dialogs/start-landed-cost-dialog';
import { ShipmentDetailCostingSection } from './shipment-detail/shipment-detail-costing-section';
import { ShipmentDetailHeader } from './shipment-detail/shipment-detail-header';
import { ShipmentDetailItemsTable } from './shipment-detail/shipment-detail-items-table';
import { ShipmentDetailLogisticsCard } from './shipment-detail/shipment-detail-logistics-card';
import { ShipmentDetailReceiptsSection } from './shipment-detail/shipment-detail-receipts-section';
import { ShipmentDetailStats } from './shipment-detail/shipment-detail-stats';
import type { AddCostComponentInput, ShipmentDetailProps } from './shipment-detail/types';

export function ShipmentDetail({ shipmentId }: ShipmentDetailProps) {
  const searchParams = useSearchParams();
  const canManage = useAdminCapability('inbound_shipment.manage');
  const canViewReceiving = useAdminCapability('receiving.view');
  const canReceive = useAdminCapability('receiving.post');
  const canViewCost = useAdminCapability('landed_cost.view');
  const canManageCost = useAdminCapability('landed_cost.manage');

  const [shipment, setShipment] = useState<InboundShipmentDto>();
  const [receipts, setReceipts] = useState<readonly InboundReceiptDto[]>([]);
  const [worksheets, setWorksheets] = useState<readonly Worksheet[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  // Dialog visibility states
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [startWorksheetOpen, setStartWorksheetOpen] = useState(false);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [receiptLines, setReceiptLines] = useState<ReceiptDraftLine[]>([]);

  async function load(signal?: AbortSignal) {
    setState('loading');
    try {
      const init = signal ? { signal } : undefined;
      const [shipmentResult, receiptResult, worksheetResult] = await Promise.all([
        supplyRequest<ApiEnvelope<InboundShipmentDto>>(
          `/admin/inbound-shipments/${shipmentId}`,
          init,
        ),
        canViewReceiving
          ? supplyRequest<PagedEnvelope<InboundReceiptDto>>(
              `/admin/inbound-receipts?shipmentId=${encodeURIComponent(shipmentId)}&pageSize=100`,
              init,
            )
          : Promise.resolve({ data: [] as readonly InboundReceiptDto[] }),
        canViewCost
          ? supplyRequest<ApiEnvelope<readonly Worksheet[]>>(
              `/admin/landed-cost/worksheets?shipmentId=${encodeURIComponent(shipmentId)}`,
              init,
            )
          : Promise.resolve({ data: [] as readonly Worksheet[] }),
      ]);
      setShipment(shipmentResult.data);
      setReceipts(receiptResult.data);
      setWorksheets(worksheetResult.data);
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Shipment could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [canViewCost, canViewReceiving, shipmentId]);

  useEffect(() => {
    if (searchParams.get('receive') === '1') setReceiveOpen(true);
    if (searchParams.get('startCosting') === '1') setStartWorksheetOpen(true);
  }, [searchParams]);

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
      setMessage(error instanceof Error ? error.message : 'The shipment could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  // Action Handlers
  const handleDepart = () => {
    if (!shipment) return;
    void run(
      () =>
        supplyRequest(`/admin/inbound-shipments/${shipment.id}/depart`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({ version: shipment.version }),
        }),
      'Departure recorded. This shipment is now marked as in transit.',
    );
  };

  const handleArrive = () => {
    if (!shipment) return;
    void run(
      () =>
        supplyRequest(`/admin/inbound-shipments/${shipment.id}/arrive`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({ version: shipment.version }),
        }),
      'Arrival recorded at dock. Inventory remains unchanged until physical count receipt is posted.',
    );
  };

  const handleSaveEdit = async (data: {
    trackingReference?: string | undefined;
    expectedArrivalDate?: string | undefined;
    originText?: string | undefined;
    transportMode: 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER';
  }) => {
    if (!shipment) return;
    await run(
      () =>
        supplyRequest(`/admin/inbound-shipments/${shipment.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: shipment.version,
            ...data,
          }),
        }),
      'Shipment logistics details updated successfully.',
      () => setEditOpen(false),
    );
  };

  const handleConfirmCancel = async (reason: string) => {
    if (!shipment) return;
    await run(
      () =>
        supplyRequest(`/admin/inbound-shipments/${shipment.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ version: shipment.version, reason }),
        }),
      'Shipment cancelled. Purchase line quantities returned to unallocated pool.',
      () => setCancelOpen(false),
    );
  };

  const handlePostReceipt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shipment || !receiptLines.length) return;
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        supplyRequest(`/admin/inbound-shipments/${shipment.id}/receipts`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            packingSlipReference: form.get('packingSlipReference') || undefined,
            notes: form.get('notes') || undefined,
            lines: receiptLines,
          }),
        }),
      'Receiving voucher posted. Inventory quantities and provisional cost layers were updated atomically.',
      () => {
        setReceiveOpen(false);
        setReceiptLines([]);
      },
    );
  };

  const handleStartWorksheet = async (notes?: string) => {
    if (!shipment) return;
    await run(
      () =>
        supplyRequest('/admin/landed-cost/worksheets', {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            shipmentId: shipment.id,
            baseCurrencyCode: shipment.currencyCode,
            notes: notes?.trim() || undefined,
          }),
        }),
      'Landed cost worksheet initialized successfully.',
      () => setStartWorksheetOpen(false),
    );
  };

  const handleAddComponent = async (data: AddCostComponentInput) => {
    if (!worksheet?.current_revision_id) return;
    await run(
      () =>
        supplyRequest(`/admin/landed-cost/revisions/${worksheet.current_revision_id}/components`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      'Cost component added to draft worksheet.',
      () => setAddComponentOpen(false),
    );
  };

  const handleDeleteComponent = async (componentId: string) => {
    await run(
      () =>
        supplyRequest(`/admin/landed-cost/components/${componentId}`, {
          method: 'DELETE',
        }),
      'Cost component removed from draft worksheet.',
    );
  };

  const handleFinalizeCosting = async () => {
    if (!worksheet?.current_revision_id) return;
    await run(
      () =>
        supplyRequest(`/admin/landed-cost/revisions/${worksheet.current_revision_id}/finalize`, {
          method: 'POST',
        }),
      'Landed cost finalized! Accurate unit acquisition costs have been applied to warehouse inventory layers.',
      () => setFinalizeOpen(false),
    );
  };

  const handleCreateRevision = async (kind: 'ADJUSTMENT' | 'CREDIT') => {
    if (!worksheet) return;
    await run(
      () =>
        supplyRequest(`/admin/landed-cost/worksheets/${worksheet.id}/revisions`, {
          method: 'POST',
          body: JSON.stringify({ kind }),
        }),
      `New landed cost ${kind.toLowerCase()} revision created. You can now add cost adjustments.`,
    );
  };

  const handleDiscardRevision = async (revisionId: string) => {
    if (!worksheet) return;
    await run(
      () =>
        supplyRequest(`/admin/landed-cost/worksheets/${worksheet.id}/revisions/${revisionId}/discard`, {
          method: 'POST',
        }),
      'Draft revision discarded. Worksheet safely restored to prior finalized valuation.',
    );
  };

  if (state === 'loading' && !shipment) return <DetailSkeleton />;

  if (!shipment) {
    return (
      <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Shipment was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/inbound-shipments" />}>
          <ArrowLeft className="size-4" />
          <span>Back to shipments</span>
        </Button>
      </main>
    );
  }

  const worksheet = worksheets[0];
  const initialTab = searchParams.get('tab') || 'items';

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header, Stepper, and Actions */}
      <ShipmentDetailHeader
        shipment={shipment}
        canManage={canManage}
        canReceive={canReceive}
        canManageCost={canManageCost}
        busy={busy}
        worksheet={worksheet}
        onDepart={handleDepart}
        onArrive={handleArrive}
        onOpenReceive={() => setReceiveOpen(true)}
        onOpenEdit={() => setEditOpen(true)}
        onOpenCancel={() => setCancelOpen(true)}
        onOpenStartWorksheet={() => setStartWorksheetOpen(true)}
      />

      {/* Operational Alerts */}
      {message ? <OperationalFeedback tone="danger">{message}</OperationalFeedback> : null}
      {success ? <OperationalFeedback>{success}</OperationalFeedback> : null}

      {/* 4-Card Executive KPI Strip */}
      <ShipmentDetailStats shipment={shipment} worksheet={worksheet} />

      {/* Tabbed Content Navigation */}
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList variant="line" className="w-full justify-start border-b rounded-none px-0">
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="size-3.5" />
            <span>Items & Cargo ({shipment.allocations.length})</span>
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-1.5">
            <PackageCheck className="size-3.5" />
            <span>Receiving Sessions ({receipts.length})</span>
          </TabsTrigger>
          <TabsTrigger value="costing" className="gap-1.5">
            <CircleDollarSign className="size-3.5" />
            <span>Landed Cost & Valuation</span>
          </TabsTrigger>
          <TabsTrigger value="logistics" className="gap-1.5">
            <Truck className="size-3.5" />
            <span>Logistics & Route</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Cargo Allocations */}
        <TabsContent value="items" className="pt-2">
          <ShipmentDetailItemsTable shipment={shipment} />
        </TabsContent>

        {/* Tab 2: Warehouse Receiving Sessions */}
        <TabsContent value="receipts" className="pt-2">
          <ShipmentDetailReceiptsSection
            shipment={shipment}
            receipts={receipts}
            canReceive={canReceive}
            onOpenReceive={() => setReceiveOpen(true)}
          />
        </TabsContent>

        {/* Tab 3: Landed Cost Valuation */}
        <TabsContent value="costing" className="pt-2">
          <ShipmentDetailCostingSection
            shipment={shipment}
            worksheet={worksheet}
            canManageCost={canManageCost}
            onOpenStartWorksheet={() => setStartWorksheetOpen(true)}
            onOpenAddComponent={() => setAddComponentOpen(true)}
            onDeleteComponent={handleDeleteComponent}
            onOpenFinalize={() => setFinalizeOpen(true)}
            onCreateRevision={handleCreateRevision}
            onDiscardRevision={handleDiscardRevision}
            onOpenReceive={() => setReceiveOpen(true)}
            busy={busy}
          />
        </TabsContent>

        {/* Tab 4: Logistics & Timeline */}
        <TabsContent value="logistics" className="pt-2">
          <ShipmentDetailLogisticsCard
            shipment={shipment}
            canManage={canManage}
            onOpenEdit={() => setEditOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Modals & Dialogs */}
      <ReceiveGoodsDialog
        open={receiveOpen}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setReceiptLines([]);
        }}
        shipment={shipment}
        lines={receiptLines}
        setLines={setReceiptLines}
        onSubmit={handlePostReceipt}
        saving={busy}
      />

      <EditShipmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        shipment={shipment}
        onSave={handleSaveEdit}
        saving={busy}
      />

      <CancelShipmentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        shipment={shipment}
        onConfirmCancel={handleConfirmCancel}
        saving={busy}
      />

      <StartLandedCostDialog
        open={startWorksheetOpen}
        onOpenChange={setStartWorksheetOpen}
        shipment={shipment}
        onStartWorksheet={handleStartWorksheet}
        saving={busy}
      />

      {worksheet ? (
        <>
          <AddCostComponentDialog
            open={addComponentOpen}
            onOpenChange={setAddComponentOpen}
            worksheet={worksheet}
            shipment={shipment}
            onAddComponent={handleAddComponent}
            saving={busy}
          />

          <FinalizeCostingDialog
            open={finalizeOpen}
            onOpenChange={setFinalizeOpen}
            worksheet={worksheet}
            onFinalize={handleFinalizeCosting}
            saving={busy}
          />
        </>
      ) : null}
    </main>
  );
}
