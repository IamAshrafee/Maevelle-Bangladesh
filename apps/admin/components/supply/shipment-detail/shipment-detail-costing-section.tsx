'use client';

import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Copy,
  ExternalLink,
  HelpCircle,
  History,
  Info,
  PackageCheck,
  Plus,
  PlusCircle,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatSupplyDate, formatSupplyMoney, formatSupplyNumber } from '@/lib/supply/api';
import { percentage, shipmentQuantities } from '@/lib/supply/status';
import { CreateRevisionDialog } from './dialogs/create-revision-dialog';
import { DiscardRevisionDialog } from './dialogs/discard-revision-dialog';
import type { ShipmentDetailCostingSectionProps } from './types';

const COST_TYPE_LABELS: Record<string, string> = {
  INTERNATIONAL_FREIGHT: 'International Freight',
  LOCAL_FREIGHT: 'Local Transport',
  CUSTOMS_DUTY: 'Customs Duty',
  TAX_OR_IMPORT_FEE: 'Import Tax / VAT',
  FORWARDER_FEE: 'Forwarder / C&F Fee',
  HANDLING: 'Port & Handling',
  INSURANCE: 'Transit Insurance',
  OTHER_ACQUISITION_COST: 'Other Acquisition',
};

const METHOD_LABELS: Record<string, string> = {
  PURCHASE_VALUE: 'Value Pro-rata',
  QUANTITY: 'Per-unit Quantity',
  EQUAL: 'Equal Split',
  WEIGHT: 'Weight Pro-rata',
  VOLUME: 'Volume Pro-rata',
  DIRECT: 'Direct Item',
};

export function ShipmentDetailCostingSection({
  shipment,
  worksheet,
  canManageCost,
  onOpenStartWorksheet,
  onOpenAddComponent,
  onDeleteComponent,
  onOpenFinalize,
  onCreateRevision,
  onDiscardRevision,
  onOpenReceive,
  busy,
}: ShipmentDetailCostingSectionProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    worksheet?.current_revision_id ?? null,
  );
  const [createRevisionKind, setCreateRevisionKind] = useState<'ADJUSTMENT' | 'CREDIT' | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

  useEffect(() => {
    if (worksheet?.current_revision_id) {
      setSelectedRevisionId(worksheet.current_revision_id);
    }
  }, [worksheet?.current_revision_id]);

  const totals = shipmentQuantities(shipment);
  const isFullyReceived = shipment.receivingStatus === 'RECEIVED';
  const isArrived = shipment.status === 'ARRIVED';
  const receivedPct = percentage(totals.received, totals.expected);

  const currentRev =
    worksheet?.revisions.find((r) => r.id === (selectedRevisionId || worksheet?.current_revision_id)) ??
    worksheet?.revisions[0];

  const isHeadRevision = currentRev?.id === worksheet?.current_revision_id;
  const isViewingDraft = currentRev?.status === 'DRAFT';
  const isViewingFinalized = currentRev?.status === 'FINALIZED' || currentRev?.status === 'SUPERSEDED';

  const priorRev = currentRev?.supersedes_revision_id
    ? worksheet?.revisions.find((r) => r.id === currentRev.supersedes_revision_id)
    : undefined;

  const activeComponents = worksheet?.components.filter((c) => c.revision_id === currentRev?.id) ?? [];
  const activeResults = worksheet?.results.filter((r) => (r.revision_id ? r.revision_id === currentRev?.id : true)) ?? [];

  const additionalCostTotal = activeResults.length
    ? activeResults.reduce((sum, res) => sum + Number(res.additional_cost), 0)
    : activeComponents.reduce((sum, comp) => sum + Number(comp.original_amount), 0);

  const totalAcquisitionValue = activeResults.reduce(
    (sum, res) => sum + Number(res.total_acquisition_cost),
    0,
  );

  const handleDelete = async (componentId: string) => {
    setDeletingId(componentId);
    try {
      await onDeleteComponent(componentId);
    } finally {
      setDeletingId(null);
    }
  };

  // -------------------------------------------------------------
  // STATE 1: Receiving Not Complete
  // -------------------------------------------------------------
  if (!isFullyReceived) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-semibold">
                Landed Cost & Stock Valuation
              </h3>
              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
                Awaiting Full Receipt
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Freight, duties, and port clearance are allocated across verified physical units to establish true inventory asset value.
            </p>
          </div>
        </div>

        <Card className="border-dashed p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-3 max-w-md mx-auto">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <CircleDollarSign className="size-6 text-muted-foreground" />
            </div>

            <h4 className="font-heading text-base font-semibold">
              Complete Physical Receiving First
            </h4>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Landed cost calculates the exact unit acquisition cost layer in the warehouse ledger.
              It requires every item to be verified at the dock first so expenses are distributed
              against actual counted inventory.
            </p>

            {/* Receiving Progress Bar */}
            <div className="w-full rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Received to date:</span>
                <strong className="font-semibold text-foreground">
                  {formatSupplyNumber(String(totals.received))} / {formatSupplyNumber(String(totals.expected))} units ({receivedPct}%)
                </strong>
              </div>
              <Progress value={receivedPct} className="h-2" />
              <p className="text-[11px] text-muted-foreground text-left">
                {totals.expected - totals.received} units remain to be counted.
              </p>
            </div>

            {isArrived ? (
              <Button onClick={onOpenReceive} className="mt-2 gap-1.5 shadow-sm" size="sm">
                <PackageCheck className="size-4" />
                <span>Receive Remaining Goods</span>
              </Button>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                Dock arrival has not been recorded yet.
              </p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 2: Fully Received, but Worksheet Not Started
  // -------------------------------------------------------------
  if (!worksheet) {
    const receivedItems = shipment.allocations.filter((a) => Number(a.receivedQuantity) > 0);

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-base font-semibold">
                Landed Cost & Stock Valuation
              </h3>
              <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200">
                <CheckCircle2 className="size-3" />
                <span>Ready for Landed Cost</span>
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              All physical shipment items have been counted into on-hand stock. You can now start the landed cost worksheet.
            </p>
          </div>

          {canManageCost ? (
            <Button onClick={onOpenStartWorksheet} className="gap-1.5 shadow-sm" size="sm" disabled={busy}>
              <CircleDollarSign className="size-4" />
              <span>Start Landed Cost Worksheet</span>
            </Button>
          ) : null}
        </div>

        <Card className="p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CircleDollarSign className="size-7" />
            </div>

            <div className="space-y-1">
              <h4 className="font-heading text-lg font-semibold">
                Ready to Establish Landed Unit Costs
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All <strong>{formatSupplyNumber(String(totals.received))} units</strong> across{' '}
                <strong>{receivedItems.length} items</strong> have arrived at {shipment.receivingLocationName}.
                Initializing a landed cost worksheet will lock these received quantities as cost targets
                so you can record freight, duties, and port clearance.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full rounded-lg border bg-muted/20 p-3 text-xs text-left">
              <div>
                <span className="text-muted-foreground">Destination:</span>
                <p className="font-semibold text-foreground">{shipment.receivingLocationName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Base Currency:</span>
                <p className="font-mono font-bold text-foreground">{shipment.currencyCode}</p>
              </div>
            </div>

            {canManageCost ? (
              <Button onClick={onOpenStartWorksheet} className="gap-2 px-6" disabled={busy}>
                <CircleDollarSign className="size-4" />
                <span>Start Landed Cost Worksheet</span>
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 3 & 4: Worksheet Exists (DRAFT or FINALIZED)
  // -------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header and Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-semibold">
              Landed Cost & Stock Valuation
            </h3>
            <StatusBadge status={currentRev?.status ?? worksheet.status} />
            <span className="font-mono text-xs text-muted-foreground">{worksheet.worksheet_number}</span>
            {currentRev ? (
              <Badge variant="outline" className="text-[11px] font-medium">
                Rev #{currentRev.revision_number} ({currentRev.revision_kind})
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {isViewingFinalized
              ? 'Landed costs are permanently booked into inventory cost layers and COGS accounting.'
              : 'Add freight and duty charges, inspect the allocation preview, then finalize.'}
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {isViewingDraft && isHeadRevision && canManageCost ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenAddComponent}
                disabled={busy}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>Add Cost Component</span>
              </Button>

              <Button
                size="sm"
                onClick={onOpenFinalize}
                disabled={busy || !activeComponents.length}
                className="gap-1.5 shadow-sm"
              >
                <CheckCircle className="size-3.5" />
                <span>Finalize {Number(currentRev?.revision_number) > 1 ? 'Adjustment' : 'Landed Cost'}</span>
              </Button>

              {Number(currentRev?.revision_number) > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDiscardDialogOpen(true)}
                  disabled={busy}
                  className="text-xs text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <Undo2 className="size-3.5" />
                  <span>Discard Draft</span>
                </Button>
              ) : null}
            </>
          ) : null}

          {isViewingFinalized && isHeadRevision && canManageCost ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateRevisionKind('ADJUSTMENT')}
                disabled={busy}
                className="text-xs"
              >
                + Adjustment Revision
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateRevisionKind('CREDIT')}
                disabled={busy}
                className="text-xs"
              >
                + Credit Revision
              </Button>
            </>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            render={<Link href={`/landed-cost?shipment=${shipment.id}`} />}
            className="text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <span>Full Console</span>
            <ExternalLink className="size-3" />
          </Button>
        </div>
      </div>

      {/* Multi-Revision Switcher Bar */}
      {(worksheet.revisions?.length ?? 0) > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 px-2 text-xs font-semibold text-muted-foreground">
              <History className="size-3.5" />
              <span>Revisions:</span>
            </div>
            {worksheet.revisions.map((rev) => {
              const isSelected = rev.id === currentRev?.id;
              const isHead = rev.id === worksheet.current_revision_id;
              const isRevDraft = rev.status === 'DRAFT';
              const kindLabel =
                rev.revision_kind === 'INITIAL'
                  ? 'Original'
                  : rev.revision_kind === 'ADJUSTMENT'
                  ? 'Adjustment'
                  : 'Credit';

              return (
                <button
                  key={rev.id}
                  type="button"
                  onClick={() => setSelectedRevisionId(rev.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-background text-foreground shadow-xs ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  }`}
                >
                  <span>Rev #{rev.revision_number}</span>
                  <span className="text-[10px] text-muted-foreground">({kindLabel})</span>
                  <Badge
                    variant={rev.status === 'FINALIZED' ? 'default' : isRevDraft ? 'secondary' : 'outline'}
                    className="h-4 px-1 text-[9px] font-normal"
                  >
                    {rev.status}
                  </Badge>
                  {isHead ? <span className="size-1.5 rounded-full bg-primary" title="Current Active Version" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Historical Revision Banner */}
      {isViewingFinalized && worksheet.status === 'DRAFT' ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-primary shrink-0" />
            <p className="text-muted-foreground">
              Viewing <strong className="text-foreground">Finalized Revision #{currentRev?.revision_number}</strong>.
              Worksheet currently has an open draft (Rev #{worksheet.revisions[0]?.revision_number}) in progress.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0 self-start sm:self-auto"
            onClick={() => setSelectedRevisionId(worksheet.current_revision_id)}
          >
            Switch to Open Draft (Rev #{worksheet.revisions[0]?.revision_number})
          </Button>
        </div>
      ) : null}

      {/* Draft Adjustment Banner */}
      {isViewingDraft && Number(currentRev?.revision_number) > 1 ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-950/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold">
                Revision #{currentRev?.revision_number} ({currentRev?.revision_kind}): Post-Finalization Draft
              </p>
              <p className="text-[11px] opacity-90 leading-relaxed">
                Record delayed logistics charges (e.g. demurrage, late duties) or vendor credits on top of Finalized Revision #{priorRev?.revision_number ?? '1'}.
                All prior finalized numbers remain safely intact.
              </p>
            </div>
          </div>

          {canManageCost ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs gap-1.5 shrink-0 self-start sm:self-auto"
              onClick={() => setDiscardDialogOpen(true)}
              disabled={busy}
            >
              <Undo2 className="size-3.5" />
              <span>Discard Draft Revision</span>
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <span className="text-[11px] text-muted-foreground">Revision Status</span>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {isViewingFinalized ? 'Finalized & Locked' : 'Draft / Editable'}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {currentRev?.finalized_at
              ? `Finalized ${formatSupplyDate(currentRev.finalized_at)}`
              : 'Provisional allocation'}
          </span>
        </div>

        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <span className="text-[11px] text-muted-foreground">Components Recorded</span>
          <p className="mt-1 font-semibold text-foreground text-sm">
            {activeComponents.length} {activeComponents.length === 1 ? 'charge' : 'charges'}
          </p>
          <span className="text-[10px] text-muted-foreground">Freight, duty, and fees</span>
        </div>

        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <span className="text-[11px] text-muted-foreground">Total Additional Cost</span>
          <p className="mt-1 font-bold text-foreground text-sm font-mono">
            {formatSupplyMoney(String(additionalCostTotal), worksheet.base_currency_code)}
          </p>
          <span className="text-[10px] text-muted-foreground">Added to purchase value</span>
        </div>

        <div className="rounded-xl border bg-card p-3 shadow-xs">
          <span className="text-[11px] text-muted-foreground">Base Currency</span>
          <p className="mt-1 font-bold text-foreground text-sm font-mono">
            {worksheet.base_currency_code}
          </p>
          <span className="text-[10px] text-muted-foreground">Accounting valuation</span>
        </div>
      </div>

      {/* Recorded Cost Components Card */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Coins className="size-4 text-primary" />
                <span>Recorded Cost Components ({activeComponents.length})</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Freight invoices, customs tariffs, handling fees, and taxes allocated on Revision #{currentRev?.revision_number}.
              </CardDescription>
            </div>

            {isViewingDraft && isHeadRevision && canManageCost ? (
              <Button size="sm" variant="outline" onClick={onOpenAddComponent} disabled={busy} className="h-7 text-xs gap-1">
                <Plus className="size-3" />
                <span>Add Component</span>
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {activeComponents.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground space-y-2">
              <p>No cost components added to this revision yet.</p>
              {isViewingDraft && isHeadRevision && canManageCost ? (
                <Button size="sm" variant="outline" onClick={onOpenAddComponent} disabled={busy} className="gap-1.5">
                  <PlusCircle className="size-3.5" />
                  <span>Add Expense (e.g. Freight, Duties)</span>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {activeComponents.map((comp) => {
                const typeLabel = COST_TYPE_LABELS[comp.cost_type] ?? comp.cost_type;
                const methodLabel = METHOD_LABELS[comp.allocation_method] ?? comp.allocation_method;
                const isDeleting = deletingId === comp.id;

                return (
                  <div
                    key={comp.id}
                    className="flex items-start justify-between gap-2 rounded-lg border bg-muted/20 p-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-foreground">{typeLabel}</span>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {methodLabel}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-sm font-bold text-foreground">
                        <span>
                          {formatSupplyMoney(comp.original_amount, comp.original_currency_code)}
                        </span>
                        {comp.fx_rate ? (
                          <span className="text-[11px] font-normal text-muted-foreground">
                            (FX: {comp.fx_rate})
                          </span>
                        ) : null}
                      </div>

                      {comp.reference ? (
                        <p className="text-[11px] text-muted-foreground">Ref: {comp.reference}</p>
                      ) : null}
                    </div>

                    {isViewingDraft && isHeadRevision && canManageCost ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                              disabled={isDeleting || busy}
                              onClick={() => void handleDelete(comp.id)}
                            />
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="top">Remove component</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Unit Acquisition Cost Table */}
      <Card className="shadow-xs overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <span>Unit Acquisition Cost Breakdown (Rev #{currentRev?.revision_number})</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Comparison of original commercial purchase price vs allocated landed expenses = final inventory valuation.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-xs">
                <TableHead>Product / Variant</TableHead>
                <TableHead className="text-right">Received Units</TableHead>
                <TableHead className="text-right">Baseline Unit Price</TableHead>
                <TableHead className="text-right">Landed Cost / Unit</TableHead>
                <TableHead className="text-right">Final Acquisition Cost</TableHead>
                <TableHead className="text-right">Total Line Value</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {activeResults.map((result) => {
                const unitAdded = Number(result.quantity) > 0
                  ? Number(result.additional_cost) / Number(result.quantity)
                  : 0;

                const basePrice = Number(result.quantity) > 0
                  ? Number(result.purchase_cost) / Number(result.quantity)
                  : 0;

                return (
                  <TableRow key={result.allocation_target_id} className="text-xs">
                    <TableCell>
                      <p className="font-medium text-foreground">{result.product_title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{result.sku}</p>
                    </TableCell>

                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {formatSupplyNumber(result.quantity)}
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatSupplyMoney(String(basePrice), result.currency_code)}
                    </TableCell>

                    <TableCell className="text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                      +{formatSupplyMoney(String(unitAdded), result.currency_code)}
                    </TableCell>

                    <TableCell className="text-right tabular-nums font-bold text-foreground">
                      {formatSupplyMoney(result.unit_acquisition_cost, result.currency_code)}
                    </TableCell>

                    <TableCell className="text-right tabular-nums font-semibold text-foreground">
                      {formatSupplyMoney(result.total_acquisition_cost, result.currency_code)}
                    </TableCell>
                  </TableRow>
                );
              })}

              {!activeResults.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-xs">
                    {isViewingDraft
                      ? 'Add cost components above and finalize to compute permanent unit acquisition costs.'
                      : 'No unit acquisition cost breakdown recorded for this revision.'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>

            {activeResults.length > 0 ? (
              <TableFooter>
                <TableRow className="bg-muted/50 font-semibold text-xs">
                  <TableCell colSpan={3}>Grand Totals</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                    +{formatSupplyMoney(String(additionalCostTotal), worksheet.base_currency_code)}
                  </TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSupplyMoney(String(totalAcquisitionValue), worksheet.base_currency_code)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      {createRevisionKind ? (
        <CreateRevisionDialog
          open={Boolean(createRevisionKind)}
          onOpenChange={(open) => !open && setCreateRevisionKind(null)}
          kind={createRevisionKind}
          worksheetNumber={worksheet.worksheet_number}
          currentRevisionNumber={currentRev?.revision_number ?? '1'}
          onConfirm={async () => {
            if (!createRevisionKind) return;
            const kind = createRevisionKind;
            setCreateRevisionKind(null);
            await onCreateRevision(kind);
          }}
          busy={busy}
        />
      ) : null}

      {discardDialogOpen && currentRev ? (
        <DiscardRevisionDialog
          open={discardDialogOpen}
          onOpenChange={setDiscardDialogOpen}
          worksheetNumber={worksheet.worksheet_number}
          revisionNumber={currentRev.revision_number}
          priorRevisionNumber={priorRev?.revision_number ?? String(Number(currentRev.revision_number) - 1)}
          onConfirm={async () => {
            setDiscardDialogOpen(false);
            await onDiscardRevision(currentRev.id);
          }}
          busy={busy}
        />
      ) : null}
    </div>
  );
}
