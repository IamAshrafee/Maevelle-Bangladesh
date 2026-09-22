'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Boxes,
  CircleDollarSign,
  HelpCircle,
  Layers3,
  PackageCheck,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { ApiEnvelope, InboundShipmentDto } from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supplyRequest } from '@/lib/supply/api';
import type { Worksheet } from '@/lib/supply/costing-types';
import type { PagedEnvelope } from '@/lib/supply/types';
import { LandedCostHelpDialog } from '../costing-page-ui';
import { AddCostComponentDialog } from '../shipment-detail/dialogs/add-cost-component-dialog';
import { FinalizeCostingDialog } from '../shipment-detail/dialogs/finalize-costing-dialog';
import type { AddCostComponentInput } from '../shipment-detail/types';
import { LandedCostStartDialog } from './landed-cost-start-dialog';
import { LandedCostStats } from './landed-cost-stats';
import { LandedCostUnstartedShipments } from './landed-cost-unstarted-shipments';
import { LandedCostWorksheetDetail } from './landed-cost-worksheet-detail';
import { LandedCostWorksheetsTable } from './landed-cost-worksheets-table';

export function LandedCostConsole() {
  const searchParams = useSearchParams();
  const requestedShipmentId = searchParams.get('shipment') ?? '';
  const requestedWorksheetId = searchParams.get('worksheet') ?? '';

  const canViewCost = useAdminCapability('landed_cost.view');
  const canManageCost = useAdminCapability('landed_cost.manage');
  const canFinalizeCost = useAdminCapability('landed_cost.finalize');

  const [worksheets, setWorksheets] = useState<readonly Worksheet[]>([]);
  const [shipments, setShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [selectedWorksheetId, setSelectedWorksheetId] = useState<string>(requestedWorksheetId);
  const [activeTab, setActiveTab] = useState<string>('worksheets');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'FINALIZED'>('ALL');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  // Dialogs
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [targetShipmentIdForStart, setTargetShipmentIdForStart] = useState<string | undefined>();

  async function loadData() {
    setLoading(true);
    setMessage('');
    try {
      const [shipmentRes, worksheetRes] = await Promise.all([
        supplyRequest<PagedEnvelope<InboundShipmentDto>>('/admin/inbound-shipments?pageSize=100'),
        supplyRequest<ApiEnvelope<readonly Worksheet[]>>('/admin/landed-cost/worksheets'),
      ]);

      const wsList: readonly Worksheet[] = worksheetRes.data;
      const shpList: readonly InboundShipmentDto[] = shipmentRes.data;

      setWorksheets(wsList);
      setShipments(shpList);

      // Auto-select worksheet if specified in URL or default to first
      if (requestedWorksheetId && wsList.some((w: Worksheet) => w.id === requestedWorksheetId)) {
        setSelectedWorksheetId(requestedWorksheetId);
      } else if (requestedShipmentId) {
        const matching = wsList.find((w: Worksheet) => w.shipment_id === requestedShipmentId);
        if (matching) {
          setSelectedWorksheetId(matching.id);
        } else {
          // If shipment has no worksheet yet, set target for start and switch tab
          setTargetShipmentIdForStart(requestedShipmentId);
          setActiveTab('unstarted');
        }
      } else if (!selectedWorksheetId && wsList[0]) {
        setSelectedWorksheetId(wsList[0].id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load landed cost worksheets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [requestedShipmentId, requestedWorksheetId]);

  async function runAction(action: () => Promise<unknown>, confirmation: string, close?: () => void) {
    setBusy(true);
    setMessage('');
    setSuccess('');
    try {
      await action();
      close?.();
      setSuccess(confirmation);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  // Eligible shipments awaiting landed cost: ARRIVED + RECEIVED and no existing worksheet
  const unstartedShipments = useMemo(() => {
    const existingShipmentIds = new Set(worksheets.map((w) => w.shipment_id));
    return shipments.filter(
      (s) =>
        s.status === 'ARRIVED' &&
        s.receivingStatus === 'RECEIVED' &&
        !existingShipmentIds.has(s.id),
    );
  }, [shipments, worksheets]);

  const selectedWorksheet = useMemo(
    () => worksheets.find((w) => w.id === selectedWorksheetId),
    [worksheets, selectedWorksheetId],
  );

  const selectedShipment = useMemo(
    () => shipments.find((s) => s.id === selectedWorksheet?.shipment_id),
    [shipments, selectedWorksheet?.shipment_id],
  );

  // Mutation Handlers
  const handleStartWorksheet = async (
    shipmentId: string,
    baseCurrencyCode: string,
    notes?: string,
  ) => {
    await runAction(
      async () => {
        const result = await supplyRequest<ApiEnvelope<{ id: string }>>(
          '/admin/landed-cost/worksheets',
          {
            method: 'POST',
            headers: { 'idempotency-key': crypto.randomUUID() },
            body: JSON.stringify({
              shipmentId,
              baseCurrencyCode,
              notes: notes?.trim() || undefined,
            }),
          },
        );
        setSelectedWorksheetId(result.data.id);
        setActiveTab('worksheets');
      },
      'Landed cost worksheet initialized successfully.',
      () => {
        setStartDialogOpen(false);
        setTargetShipmentIdForStart(undefined);
      },
    );
  };

  const handleAddComponent = async (data: AddCostComponentInput) => {
    if (!selectedWorksheet?.current_revision_id) return;
    await runAction(
      () =>
        supplyRequest(
          `/admin/landed-cost/revisions/${selectedWorksheet.current_revision_id}/components`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          },
        ),
      'Cost component added to draft worksheet.',
      () => setAddComponentOpen(false),
    );
  };

  const handleDeleteComponent = async (componentId: string) => {
    await runAction(
      () =>
        supplyRequest(`/admin/landed-cost/components/${componentId}`, {
          method: 'DELETE',
        }),
      'Cost component removed from draft worksheet.',
    );
  };

  const handleFinalizeCosting = async () => {
    if (!selectedWorksheet?.current_revision_id) return;
    await runAction(
      () =>
        supplyRequest(
          `/admin/landed-cost/revisions/${selectedWorksheet.current_revision_id}/finalize`,
          {
            method: 'POST',
          },
        ),
      'Landed cost finalized! Accurate unit acquisition costs have been applied to warehouse inventory layers.',
      () => setFinalizeOpen(false),
    );
  };

  const handleCreateRevision = async (kind: 'ADJUSTMENT' | 'CREDIT') => {
    if (!selectedWorksheet) return;
    await runAction(
      () =>
        supplyRequest(`/admin/landed-cost/worksheets/${selectedWorksheet.id}/revisions`, {
          method: 'POST',
          body: JSON.stringify({ kind }),
        }),
      `New landed cost ${kind.toLowerCase()} revision created. You can now record cost adjustments.`,
    );
  };

  const handleDiscardRevision = async (revisionId: string) => {
    if (!selectedWorksheet) return;
    await runAction(
      () =>
        supplyRequest(`/admin/landed-cost/worksheets/${selectedWorksheet.id}/revisions/${revisionId}/discard`, {
          method: 'POST',
        }),
      'Draft revision discarded. Worksheet safely restored to prior finalized valuation.',
    );
  };

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Landed Cost', current: true },
        ]}
      />

      {/* Header Bar */}
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Landed Cost & Valuation
            </h1>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setHelpOpen(true)}
                  />
                }
              >
                <HelpCircle className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="top">Landed cost calculation principles</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Distribute international freight, customs tariffs, import taxes, and terminal handling charges across verified cargo units to establish accurate FIFO inventory asset values.
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading || busy}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          {canManageCost ? (
            <Button
              size="sm"
              onClick={() => {
                setTargetShipmentIdForStart(undefined);
                setStartDialogOpen(true);
              }}
              disabled={busy || unstartedShipments.length === 0}
              className="gap-1.5 shadow-xs"
            >
              <CircleDollarSign className="size-4" />
              <span>Start Landed Cost</span>
            </Button>
          ) : null}
        </div>
      </header>

      {/* Operational Feedback Alerts */}
      {message ? <OperationalFeedback tone="danger">{message}</OperationalFeedback> : null}
      {success ? <OperationalFeedback>{success}</OperationalFeedback> : null}

      {/* 4-Card Executive KPI Strip */}
      <LandedCostStats worksheets={worksheets} unstartedShipments={unstartedShipments} />

      {/* Tabbed Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList variant="line" className="w-full justify-start border-b rounded-none px-0">
          <TabsTrigger value="worksheets" className="gap-1.5">
            <Layers3 className="size-3.5" />
            <span>Active Worksheets ({worksheets.length})</span>
          </TabsTrigger>
          <TabsTrigger value="unstarted" className="gap-1.5">
            <PackageCheck className="size-3.5" />
            <span>Awaiting Costing ({unstartedShipments.length})</span>
            {unstartedShipments.length > 0 ? (
              <span className="ml-1 inline-flex size-2 rounded-full bg-amber-500" />
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Worksheets Explorer & Master-Detail */}
        <TabsContent value="worksheets" className="space-y-4 pt-1">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left/Main Column: Worksheets Table */}
            <div className={selectedWorksheet ? 'lg:col-span-7' : 'lg:col-span-12'}>
              <LandedCostWorksheetsTable
                worksheets={worksheets}
                selectedWorksheetId={selectedWorksheetId}
                onSelectWorksheet={setSelectedWorksheetId}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            </div>

            {/* Right Column: Selected Worksheet Detail Inspector */}
            {selectedWorksheet ? (
              <div className="lg:col-span-5">
                <LandedCostWorksheetDetail
                  worksheet={selectedWorksheet}
                  shipment={selectedShipment}
                  canManageCost={canManageCost}
                  canFinalizeCost={canFinalizeCost}
                  busy={busy}
                  onOpenAddComponent={() => setAddComponentOpen(true)}
                  onDeleteComponent={handleDeleteComponent}
                  onOpenFinalize={() => setFinalizeOpen(true)}
                  onCreateRevision={handleCreateRevision}
                  onDiscardRevision={handleDiscardRevision}
                  onClose={() => setSelectedWorksheetId('')}
                />
              </div>
            ) : null}
          </div>
        </TabsContent>

        {/* Tab 2: Arrived & Received Shipments Awaiting Costing */}
        <TabsContent value="unstarted" className="pt-1">
          <LandedCostUnstartedShipments
            shipments={unstartedShipments}
            canManageCost={canManageCost}
            busy={busy}
            onStartLandedCost={(shp) => {
              setTargetShipmentIdForStart(shp.id);
              setStartDialogOpen(true);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Start Landed Cost Modal */}
      <LandedCostStartDialog
        open={startDialogOpen}
        onOpenChange={(open) => {
          setStartDialogOpen(open);
          if (!open) setTargetShipmentIdForStart(undefined);
        }}
        eligibleShipments={unstartedShipments}
        initialShipmentId={targetShipmentIdForStart}
        onStartWorksheet={handleStartWorksheet}
        saving={busy}
      />

      {/* Add Cost Component Modal */}
      {selectedWorksheet && selectedShipment ? (
        <AddCostComponentDialog
          open={addComponentOpen}
          onOpenChange={setAddComponentOpen}
          worksheet={selectedWorksheet}
          shipment={selectedShipment}
          onAddComponent={handleAddComponent}
          saving={busy}
        />
      ) : null}

      {/* Finalize Costing Modal */}
      {selectedWorksheet ? (
        <FinalizeCostingDialog
          open={finalizeOpen}
          onOpenChange={setFinalizeOpen}
          worksheet={selectedWorksheet}
          onFinalize={handleFinalizeCosting}
          saving={busy}
        />
      ) : null}

      {/* Landed Cost Help Guide Dialog */}
      <LandedCostHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  );
}
