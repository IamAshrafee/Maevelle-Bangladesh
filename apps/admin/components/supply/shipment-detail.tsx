'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CircleDollarSign,
  History,
  Loader2,
  PackageCheck,
  Ship,
  Truck,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope, InboundReceiptDto, InboundShipmentDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalEmptyState, OperationalFeedback } from '@/components/operational-worklist';
import { ReceiptForm } from '@/components/supply/supply-forms';
import {
  DetailMetric,
  DetailSection,
  DetailSkeleton,
  QuantityProgress,
} from '@/components/supply/supply-entity-ui';
import { SupplyField } from '@/components/supply/supply-field';
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
import { Textarea } from '@/components/ui/textarea';
import {
  formatSupplyDate,
  formatSupplyMoney,
  formatSupplyNumber,
  supplyRequest,
} from '@/lib/supply/api';
import { shipmentQuantities } from '@/lib/supply/status';
import type { Worksheet } from '@/lib/supply/costing-types';
import type { PagedEnvelope, ReceiptDraftLine } from '@/lib/supply/types';

export function ShipmentDetail({ shipmentId }: { shipmentId: string }) {
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
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
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

  function postReceipt(event: FormEvent<HTMLFormElement>) {
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
      'Receipt posted. Inventory quantities and provisional cost layers were created atomically.',
      () => {
        setReceiveOpen(false);
        setReceiptLines([]);
      },
    );
  }

  if (state === 'loading' && !shipment) return <DetailSkeleton />;
  if (!shipment) {
    return (
      <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Shipment was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/inbound-shipments" />}>
          <ArrowLeft /> Back to shipments
        </Button>
      </main>
    );
  }

  const totals = shipmentQuantities(shipment);
  const remainingAllocations = shipment.allocations
    .filter(
      (allocation) => Number(allocation.receivedQuantity) < Number(allocation.allocatedQuantity),
    )
    .map((allocation) => ({ ...allocation, shipment }));
  const worksheet = worksheets[0];
  const additionalCost =
    worksheet?.results.reduce((total, result) => total + Number(result.additional_cost), 0) ?? 0;

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Shipments', href: '/inbound-shipments' },
          { label: shipment.shipmentNumber, current: true },
        ]}
      />
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-pretty text-2xl font-semibold tracking-tight">
              {shipment.shipmentNumber}
            </h1>
            <StatusBadge status={shipment.status} />
            <StatusBadge status={shipment.receivingStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {shipment.originText ? `${shipment.originText} → ` : ''}
            {shipment.receivingLocationName} · {shipment.transportMode.toLowerCase()} freight
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shipment.status === 'PLANNED' && canManage ? (
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    supplyRequest(`/admin/inbound-shipments/${shipment.id}/depart`, {
                      method: 'POST',
                      headers: { 'idempotency-key': crypto.randomUUID() },
                      body: JSON.stringify({ version: shipment.version }),
                    }),
                  'Departure recorded. This shipment is now in transit.',
                )
              }
            >
              <Truck /> Record departure
            </Button>
          ) : null}
          {shipment.status === 'IN_TRANSIT' && canManage ? (
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    supplyRequest(`/admin/inbound-shipments/${shipment.id}/arrive`, {
                      method: 'POST',
                      headers: { 'idempotency-key': crypto.randomUUID() },
                      body: JSON.stringify({ version: shipment.version }),
                    }),
                  'Arrival recorded. Inventory is unchanged until a physical receipt is posted.',
                )
              }
            >
              <PackageCheck /> Mark arrived
            </Button>
          ) : null}
          {shipment.status === 'ARRIVED' &&
          shipment.receivingStatus !== 'RECEIVED' &&
          canReceive ? (
            <Button onClick={() => setReceiveOpen(true)}>
              <PackageCheck /> Receive goods
            </Button>
          ) : null}
          {shipment.receivingStatus === 'RECEIVED' && canManageCost ? (
            <Button
              variant={worksheet ? 'outline' : 'default'}
              render={<Link href={`/landed-cost?shipment=${shipment.id}`} />}
            >
              <CircleDollarSign /> {worksheet ? 'Open landed cost' : 'Add landed cost'}
            </Button>
          ) : null}
          {shipment.status === 'PLANNED' && canManage ? (
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
          label="Destination"
          value={shipment.receivingLocationName}
          hint="Inventory receiving location"
        />
        <DetailMetric
          label="Expected arrival"
          value={formatSupplyDate(shipment.expectedArrivalDate)}
          hint={
            shipment.arrivedAt
              ? `Arrived ${formatSupplyDate(shipment.arrivedAt)}`
              : 'Arrival has not been recorded'
          }
        />
        <DetailMetric
          label="Tracking / freight reference"
          value={shipment.trackingReference ?? 'Not set'}
          hint={shipment.transportMode}
        />
        <DetailMetric
          label="Landed cost"
          value={worksheet ? <StatusBadge status={worksheet.status} /> : 'Not started'}
          hint={
            worksheet?.results.length
              ? `${formatSupplyMoney(String(additionalCost), worksheet.base_currency_code)} additional cost`
              : 'Available after receiving is complete'
          }
        />
      </div>

      <DetailSection
        title="Receiving progress"
        description="Arrival records logistics; posted receipts create Inventory movements."
      >
        <div className="p-4">
          <QuantityProgress
            label="Physically received"
            complete={totals.received}
            total={totals.expected}
            detail={`${formatSupplyNumber(String(totals.expected - totals.received))} units remain to be counted`}
          />
        </div>
      </DetailSection>

      <DetailSection
        title="Shipment items"
        description="Purchase lines consolidated into this physical shipment."
      >
        <div className="divide-y">
          {shipment.allocations.map((allocation) => (
            <div
              className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(9rem,0.8fr)_repeat(2,minmax(6rem,0.5fr))] lg:items-center"
              key={allocation.id}
            >
              <div className="min-w-0">
                <Link className="truncate font-medium hover:underline" href={`/products/${allocation.productId}`}>{allocation.productTitle}</Link>
                <p className="truncate font-mono text-xs text-muted-foreground">{allocation.sku}</p>
                <Link className="text-xs text-primary hover:underline" href={`/inventory/adjustments?variantId=${encodeURIComponent(allocation.variantId)}`}>View inventory</Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Purchase</p>
                <p>
                  <Link
                    href={`/purchases/${allocation.purchaseId}`}
                    className="font-medium hover:underline"
                  >
                    {allocation.purchaseNumber}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground">{allocation.supplierName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expected</p>
                <p className="font-medium tabular-nums">
                  {formatSupplyNumber(allocation.allocatedQuantity)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Received</p>
                <p className="font-medium tabular-nums">
                  {formatSupplyNumber(allocation.receivedQuantity)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DetailSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <DetailSection
          title="Receiving history"
          description="Each session is immutable evidence tied to one Inventory transaction."
          action={
            shipment.status === 'ARRIVED' &&
            shipment.receivingStatus !== 'RECEIVED' &&
            canReceive ? (
              <Button size="sm" onClick={() => setReceiveOpen(true)}>
                <PackageCheck /> Receive
              </Button>
            ) : undefined
          }
        >
          {!receipts.length ? (
            <OperationalEmptyState
              title="No receipts posted"
              description={
                shipment.status === 'ARRIVED'
                  ? 'Count the physically arrived goods to increase Inventory.'
                  : 'Receiving becomes available after arrival.'
              }
            />
          ) : (
            <div className="divide-y">
              {receipts.map((receipt) => (
                <Link
                  href={`/receiving/${receipt.id}`}
                  className="flex items-center justify-between gap-3 p-4 no-underline hover:bg-muted/50"
                  key={receipt.id}
                >
                  <div>
                    <p className="font-medium">{receipt.receiptNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {receipt.lines.length} condition line{receipt.lines.length === 1 ? '' : 's'} ·{' '}
                      {receipt.packingSlipReference ?? 'No packing slip'}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={receipt.status} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatSupplyDate(receipt.postedAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection
          title="Landed cost"
          description="Purchase value plus freight, duty, handling, and other acquisition costs."
          action={
            shipment.receivingStatus === 'RECEIVED' && canManageCost ? (
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/landed-cost?shipment=${shipment.id}`} />}
              >
                <CircleDollarSign /> {worksheet ? 'Manage' : 'Start worksheet'}
              </Button>
            ) : undefined
          }
        >
          {worksheet ? (
            <div className="grid gap-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{worksheet.worksheet_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {worksheet.components.length} additional cost component
                    {worksheet.components.length === 1 ? '' : 's'}
                  </p>
                </div>
                <StatusBadge status={worksheet.status} />
              </div>
              {worksheet.results.length ? (
                worksheet.results.map((result) => (
                  <div
                    className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-3 text-sm"
                    key={result.allocation_target_id}
                  >
                    <div>
                      <p className="font-medium">{result.product_title}</p>
                      <p className="font-mono text-xs text-muted-foreground">{result.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatSupplyMoney(result.unit_acquisition_cost, result.currency_code)} /
                        unit
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatSupplyMoney(result.additional_cost, result.currency_code)} added
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add cost components, preview the allocation, and finalize when the amounts are
                  known.
                </p>
              )}
            </div>
          ) : (
            <OperationalEmptyState
              title={
                shipment.receivingStatus === 'RECEIVED'
                  ? 'Ready for landed cost'
                  : 'Finish receiving first'
              }
              description={
                shipment.receivingStatus === 'RECEIVED'
                  ? 'Add shared acquisition expenses and calculate the final unit cost.'
                  : 'Landed cost uses physical receipt quantities, so it begins after every shipment item is received.'
              }
            />
          )}
        </DetailSection>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={
            <Link href={`/inventory/history?q=${encodeURIComponent(shipment.shipmentNumber)}`} />
          }
        >
          <History /> Inventory history
        </Button>
        <Button variant="outline" render={<Link href="/inbound-shipments" />}>
          <Ship /> All shipments
        </Button>
      </div>

      <Dialog
        open={receiveOpen}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setReceiptLines([]);
        }}
      >
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Receive {shipment.shipmentNumber}</DialogTitle>
            <DialogDescription>
              Count what physically arrived at {shipment.receivingLocationName}. Posting increases
              Inventory exactly once.
            </DialogDescription>
          </DialogHeader>
          <ReceiptForm
            shipments={[shipment]}
            allocations={remainingAllocations}
            shipmentId={shipment.id}
            setShipmentId={() => undefined}
            lines={receiptLines}
            setLines={setReceiptLines}
            onSubmit={postReceipt}
            saving={busy}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {shipment.shipmentNumber}?</DialogTitle>
            <DialogDescription>
              Only a planned shipment can be cancelled. Its purchase quantities become available for
              another shipment.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(new FormData(event.currentTarget).get('reason'));
              void run(
                () =>
                  supplyRequest(`/admin/inbound-shipments/${shipment.id}/cancel`, {
                    method: 'POST',
                    body: JSON.stringify({ version: shipment.version, reason }),
                  }),
                'Shipment cancelled.',
                () => setCancelOpen(false),
              );
            }}
          >
            <SupplyField label="Reason">
              <Textarea name="reason" required />
            </SupplyField>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Keep shipment
              </DialogClose>
              <Button variant="destructive" type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null} Cancel shipment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
