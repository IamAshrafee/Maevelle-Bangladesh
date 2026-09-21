'use client';

import Link from 'next/link';
import { ArrowLeft, Boxes, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ApiEnvelope, InboundReceiptDto } from '@maevelle/contracts';

import { OperationalFeedback } from '@/components/operational-worklist';
import { DetailMetric, DetailSection, DetailSkeleton } from '@/components/supply/supply-entity-ui';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { formatSupplyDate, formatSupplyNumber, supplyRequest } from '@/lib/supply/api';

export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const [receipt, setReceipt] = useState<InboundReceiptDto>();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void supplyRequest<ApiEnvelope<InboundReceiptDto>>(`/admin/inbound-receipts/${receiptId}`, {
      signal: controller.signal,
    })
      .then((result) => setReceipt(result.data))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setMessage(error instanceof Error ? error.message : 'Receipt could not be loaded.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [receiptId]);

  if (loading) return <DetailSkeleton />;
  if (!receipt) {
    return (
      <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Receipt was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/supply#receiving" />}>
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
          { label: receipt.shipmentNumber, href: `/inbound-shipments/${receipt.shipmentId}` },
          { label: receipt.receiptNumber, current: true },
        ]}
      />
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
        <Button
          variant="outline"
          render={
            <Link href={`/inventory/history?q=${encodeURIComponent(receipt.receiptNumber)}`} />
          }
        >
          <Boxes /> View Inventory movement
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailMetric
          label="Warehouse"
          value={receipt.locationName}
          hint="Inventory was increased here"
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
          {receipt.lines.map((line) => (
            <div
              className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              key={line.id}
            >
              <div className="min-w-0">
                <Link className="truncate font-medium hover:underline" href={`/products/${line.productId}`}>{line.productTitle}</Link>
                <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                {line.inventoryItemId ? <Link className="text-xs text-primary hover:underline" href={`/inventory/stock/${line.inventoryItemId}`}>View stock item</Link> : null}
              </div>
              <StatusBadge status={line.condition} />
              <p className="font-semibold tabular-nums">{formatSupplyNumber(line.quantity)}</p>
            </div>
          ))}
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
    </main>
  );
}
