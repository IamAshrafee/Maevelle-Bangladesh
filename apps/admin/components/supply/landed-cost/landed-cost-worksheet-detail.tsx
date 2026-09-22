'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  Copy,
  ExternalLink,
  History,
  Info,
  Layers3,
  Loader2,
  PackageCheck,
  Plus,
  Receipt,
  ShieldCheck,
  Trash2,
  Truck,
  Undo2,
  X,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { CreateRevisionDialog } from '../shipment-detail/dialogs/create-revision-dialog';
import { DiscardRevisionDialog } from '../shipment-detail/dialogs/discard-revision-dialog';
import type { LandedCostWorksheetDetailProps } from './types';

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

export function LandedCostWorksheetDetail({
  worksheet,
  shipment,
  canManageCost,
  canFinalizeCost,
  busy,
  onOpenAddComponent,
  onDeleteComponent,
  onOpenFinalize,
  onCreateRevision,
  onDiscardRevision,
  onClose,
}: LandedCostWorksheetDetailProps) {
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

  const currentRev =
    worksheet.revisions.find((r) => r.id === (selectedRevisionId || worksheet.current_revision_id)) ??
    worksheet.revisions[0];

  const isHeadRevision = currentRev?.id === worksheet.current_revision_id;
  const isViewingDraft = currentRev?.status === 'DRAFT';
  const isViewingFinalized = currentRev?.status === 'FINALIZED' || currentRev?.status === 'SUPERSEDED';

  const priorRev = currentRev?.supersedes_revision_id
    ? worksheet.revisions.find((r) => r.id === currentRev.supersedes_revision_id)
    : undefined;

  const activeComponents = worksheet.components.filter((c) => c.revision_id === currentRev?.id);
  const activeResults = worksheet.results.filter((r) => (r.revision_id ? r.revision_id === currentRev?.id : true));

  const totalAdditionalCost =
    activeResults.reduce((sum, res) => sum + Number(res.additional_cost), 0) ||
    activeComponents.reduce((sum, comp) => sum + Number(comp.original_amount), 0);

  const totalAcquisitionValue =
    activeResults.reduce((sum, res) => sum + Number(res.total_acquisition_cost), 0);

  const handleDelete = async (componentId: string) => {
    setDeletingId(componentId);
    try {
      await onDeleteComponent(componentId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      {/* Header and Inspector Toolbar */}
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg font-bold tracking-tight sm:text-xl">
              {worksheet.worksheet_number}
            </h2>
            <StatusBadge status={currentRev?.status ?? worksheet.status} />
            <Badge variant="outline" className="font-mono text-xs">
              {worksheet.base_currency_code}
            </Badge>
            {currentRev ? (
              <Badge variant="outline" className="text-[11px] font-medium">
                Rev #{currentRev.revision_number} ({currentRev.revision_kind})
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Inbound Shipment:</span>
            {worksheet.shipment_number ? (
              <Link
                href={`/inbound-shipments/${worksheet.shipment_id}`}
                className="inline-flex items-center gap-1 font-mono font-medium text-primary hover:underline"
              >
                <Truck className="size-3" />
                <span>{worksheet.shipment_number}</span>
                <ArrowUpRight className="size-2.5 opacity-60" />
              </Link>
            ) : (
              <Link
                href={`/inbound-shipments/${worksheet.shipment_id}`}
                className="inline-flex items-center gap-1 font-mono font-medium text-primary hover:underline"
              >
                <Truck className="size-3" />
                <span>Open Shipment</span>
                <ArrowUpRight className="size-2.5 opacity-60" />
              </Link>
            )}
            {worksheet.receiving_location_name ? (
              <>
                <span>·</span>
                <span>Dock: {worksheet.receiving_location_name}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isViewingDraft && isHeadRevision && canManageCost ? (
            <>
              <Button size="sm" variant="outline" onClick={onOpenAddComponent} disabled={busy} className="gap-1">
                <Plus className="size-3.5" />
                <span>Add Component</span>
              </Button>
              {canFinalizeCost ? (
                <Button
                  size="sm"
                  onClick={onOpenFinalize}
                  disabled={busy || activeComponents.length === 0}
                  className="gap-1 shadow-xs"
                >
                  <ShieldCheck className="size-3.5" />
                  <span>Finalize {Number(currentRev?.revision_number) > 1 ? 'Adjustment' : 'Costing'}</span>
                </Button>
              ) : null}

              {Number(currentRev?.revision_number) > 1 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDiscardDialogOpen(true)}
                  disabled={busy}
                  className="gap-1 text-xs text-destructive hover:bg-destructive/10"
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
                size="sm"
                variant="outline"
                onClick={() => setCreateRevisionKind('ADJUSTMENT')}
                disabled={busy}
                className="gap-1 text-xs"
              >
                <Plus className="size-3" />
                <span>Adjustment</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateRevisionKind('CREDIT')}
                disabled={busy}
                className="gap-1 text-xs text-amber-600 dark:text-amber-400"
              >
                <span>Credit</span>
              </Button>
            </>
          ) : null}

          {onClose ? (
            <Button size="icon" variant="ghost" className="size-8" onClick={onClose} aria-label="Close details">
              <X className="size-4" />
            </Button>
          ) : null}
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
            Switch to Open Draft
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
                Record delayed logistics charges or credits on top of Finalized Revision #{priorRev?.revision_number ?? '1'}.
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

      {/* Mini Executive Metric Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <span className="text-[11px] font-medium text-muted-foreground">Additional Expenses</span>
          <p className="mt-0.5 font-mono text-sm font-semibold">
            {formatSupplyMoney(totalAdditionalCost.toString(), worksheet.base_currency_code)}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <span className="text-[11px] font-medium text-muted-foreground">Recorded Components</span>
          <p className="mt-0.5 font-mono text-sm font-semibold">
            {activeComponents.length} expense items
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <span className="text-[11px] font-medium text-muted-foreground">Final Cargo Valuation</span>
          <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            {totalAcquisitionValue > 0
              ? formatSupplyMoney(totalAcquisitionValue.toString(), worksheet.base_currency_code)
              : 'Pending Finalization'}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <span className="text-[11px] font-medium text-muted-foreground">Active Revision</span>
          <p className="mt-0.5 font-mono text-sm font-semibold">
            Rev {currentRev?.revision_number ?? '1'} ({currentRev?.revision_kind ?? 'INITIAL'})
          </p>
        </div>
      </div>

      {/* Cost Components Breakdown */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cost Components ({activeComponents.length})
          </h3>
          {isViewingDraft && isHeadRevision && canManageCost ? (
            <Button size="xs" variant="ghost" onClick={onOpenAddComponent} disabled={busy} className="h-6 gap-1 text-xs text-primary">
              <Plus className="size-3" />
              <span>Add</span>
            </Button>
          ) : null}
        </div>

        {activeComponents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
            <Receipt className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-xs font-medium">No cost components recorded on this revision.</p>
            <p className="text-[11px] text-muted-foreground">
              Add freight bills, import tariffs, customs broker fees, or port terminal handling.
            </p>
            {isViewingDraft && isHeadRevision && canManageCost ? (
              <Button size="sm" variant="outline" onClick={onOpenAddComponent} className="mt-3 gap-1">
                <Plus className="size-3.5" />
                <span>Add First Component</span>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {activeComponents.map((comp) => {
              const isDeleting = deletingId === comp.id;
              const isForeignCurrency =
                comp.original_currency_code.toUpperCase() !== worksheet.base_currency_code.toUpperCase();

              return (
                <div
                  key={comp.id}
                  className="relative flex flex-col justify-between rounded-lg border bg-card p-3 shadow-2xs transition-shadow hover:shadow-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary" className="text-[11px] font-medium">
                        {COST_TYPE_LABELS[comp.cost_type] ?? comp.cost_type}
                      </Badge>

                      {isViewingDraft && isHeadRevision && canManageCost ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => void handleDelete(comp.id)}
                                disabled={isDeleting || busy}
                              />
                            }
                          >
                            {isDeleting ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Trash2 className="size-3" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="top">Remove component</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-base font-bold tracking-tight">
                        {formatSupplyMoney(comp.original_amount, comp.original_currency_code)}
                      </span>
                      {isForeignCurrency && comp.fx_rate ? (
                        <span className="text-[11px] text-muted-foreground">
                          (FX {comp.fx_rate} → {worksheet.base_currency_code})
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                        {METHOD_LABELS[comp.allocation_method] ?? comp.allocation_method}
                      </span>
                      {comp.reference ? (
                        <span className="font-mono">Ref: {comp.reference}</span>
                      ) : null}
                      <span className="capitalize text-foreground/70">{comp.value_status.toLowerCase()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SKU Unit Acquisition Cost Breakdown */}
      {activeResults.length > 0 ? (
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Inventory Acquisition Cost Results (Rev #{currentRev?.revision_number})
          </h3>

          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead className="font-semibold">Product & SKU</TableHead>
                  <TableHead className="text-right font-semibold">Verified Units</TableHead>
                  <TableHead className="text-right font-semibold">PO Cost / Unit</TableHead>
                  <TableHead className="text-right font-semibold">Landed Cost / Unit</TableHead>
                  <TableHead className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                    Final Unit Acquisition Cost
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeResults.map((res) => {
                  const qty = Number(res.quantity);
                  const poUnit = qty > 0 ? Number(res.purchase_cost) / qty : 0;
                  const addedUnit = qty > 0 ? Number(res.additional_cost) / qty : 0;

                  return (
                    <TableRow key={res.allocation_target_id} className="text-xs">
                      <TableCell className="font-medium">
                        <div className="font-semibold text-foreground">{res.product_title}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{res.sku}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatSupplyNumber(res.quantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatSupplyMoney(poUnit.toString(), res.currency_code)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                        +{formatSupplyMoney(addedUnit.toString(), res.currency_code)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatSupplyMoney(res.unit_acquisition_cost, res.currency_code)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted/60 text-xs font-semibold">
                  <TableCell colSpan={2}>Grand Total Acquisition Cost</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatSupplyMoney(
                      activeResults.reduce((s, r) => s + Number(r.purchase_cost), 0).toString(),
                      worksheet.base_currency_code,
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                    +{formatSupplyMoney(
                      activeResults.reduce((s, r) => s + Number(r.additional_cost), 0).toString(),
                      worksheet.base_currency_code,
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {formatSupplyMoney(
                      activeResults.reduce((s, r) => s + Number(r.total_acquisition_cost), 0).toString(),
                      worksheet.base_currency_code,
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      ) : null}

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
