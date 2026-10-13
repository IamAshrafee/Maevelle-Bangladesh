'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Boxes,
  CheckCircle,
  ExternalLink,
  Package,
  RotateCcw,
  Plus,
  ShieldCheck,
  Printer,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ApiEnvelope,
  InboundReceiptDto,
  InboundReceiptLineDto,
  InventoryUnitDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { DetailMetric, DetailSection, DetailSkeleton } from '@/components/supply/supply-entity-ui';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatSupplyDate, formatSupplyNumber, supplyRequest } from '@/lib/supply/api';
import { listInventoryUnits } from '@/lib/inventory/units';
import { UnitStatusBadge } from '@/components/inventory/units/unit-status-badge';
import { UnitConditionBadge } from '@/components/inventory/units/unit-condition-badge';
import { UnitBarcodeModal } from '@/components/inventory/units/unit-barcode-modal';
import { QCInspectionWorkspace } from '@/components/inventory/units/qc-inspection-workspace';
import { ReceiptRegisterUnitsDialog } from './receipt-register-units-dialog';
import { ReceiptReverseDialog } from './receipt-reverse-dialog';
import { ReceiptResolveConditionDialog } from './receipt-resolve-condition-dialog';

export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const canAdjust = useAdminCapability('receiving.adjust');
  const canViewUnits = useAdminCapability('inventory.units.view');
  const canManageUnits = useAdminCapability('inventory.units.manage');

  const [receipt, setReceipt] = useState<InboundReceiptDto>();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Dialog states
  const [reverseOpen, setReverseOpen] = useState(false);
  const [resolvingLine, setResolvingLine] = useState<InboundReceiptLineDto>();
  const [registerUnitsOpen, setRegisterUnitsOpen] = useState(false);
  const [qcWorkspaceOpen, setQcWorkspaceOpen] = useState(false);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [receiptUnits, setReceiptUnits] = useState<readonly InventoryUnitDto[]>([]);
  const [receiptUnitTotal, setReceiptUnitTotal] = useState(0);

  async function load(signal?: AbortSignal) {
    try {
      const receiptResult = await supplyRequest<ApiEnvelope<InboundReceiptDto>>(
        `/admin/inbound-receipts/${receiptId}`,
        signal ? { signal } : undefined,
      );
      setReceipt(receiptResult.data);
      if (canViewUnits) {
        const unitsResult = await listInventoryUnits({ sourceReceiptId: receiptId, pageSize: 100 });
        setReceiptUnits(unitsResult.data);
        setReceiptUnitTotal(unitsResult.pagination.totalItems);
      } else {
        setReceiptUnits([]);
        setReceiptUnitTotal(0);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setMessage(error instanceof Error ? error.message : 'Receipt could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [receiptId, canViewUnits]);

  async function handleReverse(reason: string) {
    if (!receipt) return;
    setBusy(true);
    setMessage('');
    setSuccess('');
    try {
      await supplyRequest(`/admin/inbound-receipts/${receipt.id}/reverse`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ reason }),
      });
      setReverseOpen(false);
      setSuccess(
        'Inbound receipt successfully reversed. Inventory and landed costs have been rolled back.',
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reverse receipt.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveCondition(data: {
    lineId: string;
    targetCondition: 'SELLABLE' | 'DAMAGED';
    quantity: string;
    reason?: string | undefined;
  }) {
    if (!receipt) return;
    setBusy(true);
    setMessage('');
    setSuccess('');
    try {
      await supplyRequest(`/admin/inbound-receipts/${receipt.id}/resolve-condition`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(data),
      });
      setResolvingLine(undefined);
      setSuccess(
        `Condition resolved: ${data.quantity} units reclassified as ${data.targetCondition}.`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to resolve condition.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DetailSkeleton />;
  if (!receipt) {
    return (
      <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Receipt was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/receiving" />}>
          <ArrowLeft /> Back to receiving
        </Button>
      </main>
    );
  }

  const total = receipt.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  const conditions = receipt.lines.reduce<Record<string, number>>((result, line) => {
    result[line.condition] = (result[line.condition] ?? 0) + Number(line.quantity);
    return result;
  }, {});

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Receiving', href: '/receiving' },
          { label: receipt.shipmentNumber, href: `/inbound-shipments/${receipt.shipmentId}` },
          { label: receipt.receiptNumber, current: true },
        ]}
      />

      {message ? <OperationalFeedback tone="danger">{message}</OperationalFeedback> : null}
      {success ? <OperationalFeedback>{success}</OperationalFeedback> : null}

      {receipt.status === 'REVERSED' ? (
        <OperationalFeedback tone="warning">
          <strong>Receipt Reversed:</strong> This receiving voucher was voided. All associated stock
          movements were reversed and provisional cost allocations were rolled back.
        </OperationalFeedback>
      ) : null}

      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-pretty text-2xl font-semibold tracking-tight">
              {receipt.receiptNumber}
            </h1>
            <StatusBadge status={receipt.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Posted {formatSupplyDate(receipt.postedAt)} from{' '}
            <Link
              href={`/inbound-shipments/${receipt.shipmentId}`}
              className="font-medium text-foreground hover:underline"
            >
              {receipt.shipmentNumber}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {receipt.status === 'POSTED' && canManageUnits ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegisterUnitsOpen(true)}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>Register Physical Units</span>
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={() => setQcWorkspaceOpen(true)}
                className="gap-1.5"
              >
                <ShieldCheck className="size-3.5" />
                <span>QC Inspection Workspace</span>
              </Button>
            </>
          ) : null}

          {receipt.status === 'POSTED' && canAdjust ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 border-destructive/20 gap-1.5"
              onClick={() => setReverseOpen(true)}
              disabled={busy}
            >
              <RotateCcw className="size-3.5" />
              <span>Reverse Receipt</span>
            </Button>
          ) : null}

          <Button
            variant="outline"
            render={
              <Link href={`/inventory/history?q=${encodeURIComponent(receipt.receiptNumber)}`} />
            }
          >
            <Boxes className="size-3.5" />
            <span>View Inventory movement</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailMetric
          label="Warehouse"
          value={receipt.locationName}
          hint={
            receipt.status === 'REVERSED'
              ? 'Stock reversed from here'
              : 'Inventory was increased here'
          }
        />
        <DetailMetric
          label="Total received"
          value={formatSupplyNumber(String(total))}
          hint={`${receipt.lines.length} condition line${receipt.lines.length === 1 ? '' : 's'}`}
        />
        <DetailMetric label="Packing slip" value={receipt.packingSlipReference ?? 'Not recorded'} />
        <DetailMetric
          label="Inventory transaction"
          value={<span className="font-mono text-xs">{receipt.inventoryTransactionId}</span>}
          hint="Immutable posting reference"
        />
      </div>

      <DetailSection
        title="Counted goods"
        description="Actual quantities by product and condition."
      >
        <div className="divide-y">
          {receipt.lines.map((line) => {
            const isResolvable =
              receipt.status === 'POSTED' &&
              canAdjust &&
              (line.condition === 'INSPECTION' || line.condition === 'QUARANTINE');

            return (
              <div
                className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                key={line.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                    {line.primaryImageUrl ? (
                      <img
                        src={line.primaryImageUrl}
                        alt={`${line.productTitle} ${line.sku}`}
                        width={120}
                        height={120}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Package className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link
                      className="truncate font-medium hover:underline"
                      href={`/products/${line.productId}`}
                    >
                      {line.productTitle}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                    {line.inventoryItemId ? (
                      <Link
                        className="text-xs text-primary hover:underline"
                        href={`/inventory/stock/${line.inventoryItemId}`}
                      >
                        View stock item
                      </Link>
                    ) : null}
                  </div>
                </div>

                <StatusBadge status={line.condition} />

                <p className="font-semibold tabular-nums">{formatSupplyNumber(line.quantity)}</p>

                {isResolvable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={() => setResolvingLine(line)}
                    disabled={busy}
                  >
                    <CheckCircle className="size-3 text-primary" />
                    <span>Resolve</span>
                  </Button>
                ) : (
                  <div />
                )}
              </div>
            );
          })}
        </div>
      </DetailSection>

      <DetailSection
        title="Condition summary"
        description="Only sellable stock contributes to immediately available inventory."
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION'].map((condition) => (
            <DetailMetric
              key={condition}
              label={condition.charAt(0) + condition.slice(1).toLowerCase()}
              value={formatSupplyNumber(String(conditions[condition] ?? 0))}
            />
          ))}
        </div>
      </DetailSection>

      {/* Individually Tracked Physical Units Section */}
      {canViewUnits ? (
        <DetailSection
          title={`Individually Tracked Units (${receiptUnitTotal})`}
          description="Physical serialized garment units registered against this receiving voucher."
        >
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-foreground">
                  Showing {receiptUnits.length} of {receiptUnitTotal} registered Units
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-warning font-medium">
                  {receiptUnits.filter((u) => u.status === 'AWAITING_QC').length} Awaiting QC
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-success font-medium">
                  {
                    receiptUnits.filter(
                      (u) => u.currentCondition === 'GRADE_A' && u.status !== 'AWAITING_QC',
                    ).length
                  }{' '}
                  Passed
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-warning font-medium">
                  {
                    receiptUnits.filter(
                      (u) => u.currentCondition === 'REPAIR_REQUIRED' || u.status === 'ON_HOLD',
                    ).length
                  }{' '}
                  Repair / Hold
                </span>
              </div>

              <div className="flex items-center gap-2">
                {receiptUnits.length > 0 ? (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setBarcodeModalOpen(true)}
                    className="gap-1"
                  >
                    <Printer className="size-3" /> Print Loaded Labels
                  </Button>
                ) : null}
                {canManageUnits ? (
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => setQcWorkspaceOpen(true)}
                    className="gap-1"
                  >
                    <ShieldCheck className="size-3" /> QC Inspection Workspace
                  </Button>
                ) : null}
              </div>
            </div>

            {receiptUnits.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No physical units registered yet. Click &apos;Register Physical Units&apos; to
                generate serialized Unit IDs for this inbound delivery.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {receiptUnits.map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <Link
                        href={`/inventory/units/${u.id}`}
                        className="font-mono font-bold text-foreground hover:underline hover:text-primary block"
                      >
                        {u.unitCode}
                      </Link>
                      <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[140px]">
                        {u.sku}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <UnitStatusBadge status={u.status} />
                      <UnitConditionBadge condition={u.currentCondition} short />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DetailSection>
      ) : null}

      {receipt.notes ? (
        <DetailSection title="Receiving note">
          <p className="whitespace-pre-wrap p-4 text-sm text-muted-foreground">{receipt.notes}</p>
        </DetailSection>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={<Link href={`/inbound-shipments/${receipt.shipmentId}`} />}
        >
          <ArrowLeft /> Shipment
        </Button>
        <Button
          variant="outline"
          render={
            <Link href={`/inventory/history?q=${encodeURIComponent(receipt.receiptNumber)}`} />
          }
        >
          <ExternalLink /> Inventory evidence
        </Button>
      </div>

      <ReceiptReverseDialog
        open={reverseOpen}
        onOpenChange={setReverseOpen}
        receipt={receipt}
        busy={busy}
        onConfirmReverse={handleReverse}
      />

      <ReceiptResolveConditionDialog
        line={resolvingLine}
        busy={busy}
        onClose={() => setResolvingLine(undefined)}
        onResolve={handleResolveCondition}
      />

      {/* Serialized Units Registration Dialog */}
      {canManageUnits ? (
        <ReceiptRegisterUnitsDialog
          open={registerUnitsOpen}
          onOpenChange={setRegisterUnitsOpen}
          receipt={receipt}
          onSuccess={() => void load()}
        />
      ) : null}

      {/* QC Inspection Workspace Modal */}
      {canManageUnits ? (
        <Dialog open={qcWorkspaceOpen} onOpenChange={setQcWorkspaceOpen}>
          <DialogContent className="max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-5xl sm:max-h-[92vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader className="border-b pb-3">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <span>Receiving QC — {receipt.receiptNumber}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="pt-2">
              <QCInspectionWorkspace
                sourceReceiptId={receipt.id}
                stage="INBOUND_INTAKE"
                onCompleted={() => void load()}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Print Labels Modal */}
      {canViewUnits ? (
        <UnitBarcodeModal
          open={barcodeModalOpen}
          onOpenChange={setBarcodeModalOpen}
          units={receiptUnits}
        />
      ) : null}
    </main>
  );
}
