import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  ExternalLink,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import type { InventoryUnitDto } from '@maevelle/contracts';
import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUnitBarcodeSvgUrl } from '@/lib/inventory/units';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getNextStep(unit: InventoryUnitDto): string {
  if (unit.activeRepair) return 'Complete the active repair, then reinspect the unit.';
  if (unit.status === 'AWAITING_QC') return 'Record the required quality inspection.';
  if (unit.status === 'RETURNED') return 'Complete return intake inspection.';
  if (unit.status === 'ON_HOLD') return 'Resolve the quality hold before release or movement.';
  if (unit.status === 'IN_TRANSFER') return 'Receive the open warehouse transfer.';
  if (unit.status === 'IN_FULFILLMENT') return 'Continue the assigned fulfillment workflow.';
  if (unit.status === 'RESERVED') return 'Allocation is reserved for an order.';
  if (unit.status === 'DISPATCHED') return 'Unit is in customer delivery custody.';
  if (unit.status === 'WRITTEN_OFF') return 'No further stock operation is permitted.';
  return 'Available for reservation, transfer, or routine inspection.';
}

function ReferenceRow({
  icon,
  label,
  href,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly href?: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-2.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      {href ? (
        <Link
          href={href}
          className="flex items-center gap-1 break-all font-mono font-medium text-primary hover:underline"
        >
          {value}
          <ExternalLink className="size-2.5 shrink-0" aria-hidden="true" />
        </Link>
      ) : (
        <span className="break-all font-mono text-foreground">{value}</span>
      )}
    </div>
  );
}

export function UnitOverviewPanels({ unit }: { readonly unit: InventoryUnitDto }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-xl shadow-2xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current control state
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Ledger bucket</dt>
            <dd className="text-right font-mono font-semibold">{unit.inventoryCondition}</dd>
            <dt className="text-muted-foreground">Record version</dt>
            <dd className="text-right font-mono tabular-nums">{unit.version}</dd>
            <dt className="text-muted-foreground">Last updated</dt>
            <dd className="text-right font-mono tabular-nums">{formatDate(unit.updatedAt)}</dd>
          </dl>
          <div className="rounded-lg border border-info/25 bg-info/10 p-2.5">
            <p className="mb-1 flex items-center gap-1 font-semibold text-foreground">
              <ArrowRight className="size-3 text-info" aria-hidden="true" />
              Next operational step
            </p>
            <p className="leading-relaxed text-muted-foreground">{getNextStep(unit)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-2xs">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Physical identity</span>
            <span className="font-mono text-[10px] font-normal normal-case">Code 128</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col items-center justify-center rounded-lg border bg-white p-3">
            <img
              src={getUnitBarcodeSvgUrl(unit.id)}
              alt={`Barcode for ${unit.unitCode}`}
              className="max-h-12 w-auto object-contain contrast-200"
            />
            <span className="mt-1 font-mono text-xs font-bold text-black">{unit.unitCode}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Payload</dt>
            <dd className="break-all text-right font-mono font-medium">{unit.barcodePayload}</dd>
            <dt className="text-muted-foreground">Registered</dt>
            <dd className="text-right font-mono tabular-nums">{formatDate(unit.createdAt)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-2xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <Link
            href={`/inventory/warehouses/${unit.locationId}`}
            className="block rounded-lg border bg-muted/40 p-3 transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Boxes className="size-3.5" aria-hidden="true" /> Warehouse location
            </span>
            <p className="mt-1 text-base font-semibold text-foreground">
              {unit.locationName || unit.locationCode || 'Unassigned'}
            </p>
            <span className="block font-mono text-muted-foreground">
              {unit.locationCode || 'No location code'}
            </span>
          </Link>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Package</dt>
            <dd className="break-all text-right font-mono">
              {unit.packageReference || 'Not recorded'}
            </dd>
            <dt className="text-muted-foreground">Storage notes</dt>
            <dd className="text-right">{unit.storageNotes || 'None'}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-2xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Provenance and custody
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {unit.sourceReceiptId ? (
            <ReferenceRow
              icon={<PackageCheck className="size-3.5" aria-hidden="true" />}
              label="Inbound receipt"
              href={`/receiving/${unit.sourceReceiptId}`}
              value={unit.sourceReceiptNumber || 'View receipt'}
            />
          ) : (
            <ReferenceRow
              icon={<PackageCheck className="size-3.5" aria-hidden="true" />}
              label="Source"
              value={unit.sourceType.replaceAll('_', ' ')}
            />
          )}
          {unit.sourceReturnReceiptId ? (
            <ReferenceRow
              icon={<RotateCcw className="size-3.5" aria-hidden="true" />}
              label="Return receipt"
              value={unit.sourceReturnReceiptId}
            />
          ) : null}
          {unit.currentFulfillmentId ? (
            <ReferenceRow
              icon={<Truck className="size-3.5" aria-hidden="true" />}
              label="Fulfillment"
              href={`/fulfillments?selected=${encodeURIComponent(unit.currentFulfillmentId)}`}
              value={unit.currentFulfillmentNumber || 'View fulfillment'}
            />
          ) : null}
          {unit.currentOrderId ? (
            <ReferenceRow
              icon={<ShoppingBag className="size-3.5" aria-hidden="true" />}
              label="Order"
              href={`/orders/${unit.currentOrderId}`}
              value={unit.currentOrderNumber || 'View order'}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
