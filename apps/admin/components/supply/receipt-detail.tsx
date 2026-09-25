'use client';

import Link from 'next/link';
import { ArrowLeft, Boxes, CheckCircle, ExternalLink, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ApiEnvelope, InboundReceiptDto, InboundReceiptLineDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { DetailMetric, DetailSection, DetailSkeleton } from '@/components/supply/supply-entity-ui';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { formatSupplyDate, formatSupplyNumber, supplyRequest } from '@/lib/supply/api';

import { ReceiptReverseDialog } from './receipt-reverse-dialog';
import { ReceiptResolveConditionDialog } from './receipt-resolve-condition-dialog';

export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const canAdjust = useAdminCapability('receiving.adjust');

  const [receipt, setReceipt] = useState<InboundReceiptDto>();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Dialog states
  const [reverseOpen, setReverseOpen] = useState(false);
  const [resolvingLine, setResolvingLine] = useState<InboundReceiptLineDto>();

  async function load(signal?: AbortSignal) {
    try {
      const result = await supplyRequest<ApiEnvelope<InboundReceiptDto>>(
        `/admin/inbound-receipts/${receiptId}`,
        signal ? { signal } : undefined,
      );
      setReceipt(result.data);
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
  }, [receiptId]);

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
      setSuccess('Inbound receipt successfully reversed. Inventory and landed costs have been rolled back.');
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
      setSuccess(`Condition resolved: ${data.quantity} units reclassified as ${data.targetCondition}.`);
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
          hint={receipt.status === 'REVERSED' ? 'Stock reversed from here' : 'Inventory was increased here'}
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
        receipt={receipt}
        busy={busy}
        onClose={() => setResolvingLine(undefined)}
        onResolve={handleResolveCondition}
      />
    </main>
  );
}
