'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Edit3,
  PackageCheck,
  Plus,
  Trash2,
  Truck,
} from 'lucide-react';

import type {
  InboundReceiptDto,
  InboundShipmentDto,
  PurchaseDto,
  SupplierDto,
} from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatSupplyDate,
  formatSupplyMoney,
  formatSupplyNumber,
  supplyRequest,
} from '@/lib/supply/api';

export function SuppliersTable({
  items,
  purchases,
  onEdit,
}: {
  items: SupplierDto[];
  purchases: readonly PurchaseDto[];
  onEdit: (supplier: SupplierDto) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Buying setup</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Purchases</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((supplier) => {
          const related = purchases.filter((purchase) => purchase.supplierId === supplier.id);
          return (
            <TableRow key={supplier.id}>
              <TableCell>
                <div className="font-medium">{supplier.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{supplier.code}</span>
                  <StatusBadge status={supplier.status} />
                </div>
              </TableCell>
              <TableCell>
                <div>{supplier.supplierType.replaceAll('_', ' ')}</div>
                <div className="text-xs text-muted-foreground">
                  {[
                    supplier.countryCode,
                    supplier.preferredCurrencyCode,
                    supplier.leadTimeDays !== undefined
                      ? `${supplier.leadTimeDays} day lead time`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Terms not set'}
                </div>
              </TableCell>
              <TableCell>
                <div>{supplier.contactName ?? 'No main contact'}</div>
                <div className="text-xs text-muted-foreground">
                  {supplier.contactEmail ?? supplier.contactPhone ?? 'Add contact details'}
                </div>
              </TableCell>
              <TableCell>
                <strong>{related.length}</strong>
                <div className="text-xs text-muted-foreground">
                  {related.filter((item) => item.status === 'PLACED').length} open
                </div>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(supplier)}
                    title={`Edit ${supplier.name}`}
                  >
                    <Edit3 /> Edit
                  </Button>
                  <Link
                    href={`/purchases?create=purchase&supplier=${supplier.id}`}
                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground no-underline"
                    title={`Create a purchase from ${supplier.name}`}
                  >
                    New purchase <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function PurchasesTable({
  items,
  expanded,
  setExpanded,
  onLine,
  onCancel,
  transition,
  run,
}: {
  items: PurchaseDto[];
  expanded: string | undefined;
  setExpanded: (id?: string) => void;
  onLine: (purchase: PurchaseDto) => void;
  onCancel: (purchase: PurchaseDto) => void;
  transition: (path: string, version: number, message: string, idempotent?: boolean) => void;
  run: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Purchase</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Expected</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((purchase) => {
          const allocated = purchase.lines.reduce(
            (sum, line) => sum + Number(line.allocatedQuantity),
            0,
          );
          const ordered = purchase.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
          return (
            <TableRow key={purchase.id}>
              <TableCell>
                <button
                  className="flex items-center gap-1 font-medium hover:text-primary"
                  onClick={() => setExpanded(expanded === purchase.id ? undefined : purchase.id)}
                  title="Show purchase lines"
                >
                  <ChevronDown
                    className={`size-4 transition-transform ${expanded === purchase.id ? 'rotate-180' : ''}`}
                  />{' '}
                  {purchase.purchaseNumber}
                </button>
                <div className="mt-1">
                  <StatusBadge status={purchase.status} />
                </div>
                {expanded === purchase.id ? (
                  <div className="mt-3 grid min-w-80 gap-2">
                    {purchase.lines.length ? (
                      purchase.lines.map((line) => (
                        <div className="rounded-lg bg-muted p-2 text-xs" key={line.id}>
                          <div className="font-medium">
                            {line.productTitle} · {line.sku}
                          </div>
                          <div className="text-muted-foreground">
                            Ordered {formatSupplyNumber(line.quantity)} · allocated{' '}
                            {formatSupplyNumber(line.allocatedQuantity)} · received{' '}
                            {formatSupplyNumber(line.receivedQuantity)} ·{' '}
                            {formatSupplyMoney(line.unitPrice, purchase.currencyCode)} each
                          </div>
                          {purchase.status === 'DRAFT' ? (
                            <Button
                              size="xs"
                              variant="destructive"
                              className="mt-2"
                              onClick={() =>
                                void run(
                                  () =>
                                    supplyRequest(
                                      `/admin/purchases/${purchase.id}/lines/${line.id}`,
                                      {
                                        method: 'DELETE',
                                      },
                                    ),
                                  'Purchase line removed.',
                                )
                              }
                              title="Remove this draft line"
                            >
                              <Trash2 /> Remove
                            </Button>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No product lines yet.</span>
                    )}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>
                {purchase.supplierName}
                <div className="text-xs text-muted-foreground">
                  {purchase.supplierReference ?? 'No supplier reference'}
                </div>
              </TableCell>
              <TableCell>
                {purchase.lines.length} line{purchase.lines.length === 1 ? '' : 's'}
                <div className="text-xs text-muted-foreground">
                  {formatSupplyNumber(String(allocated))} of {formatSupplyNumber(String(ordered))}{' '}
                  allocated
                </div>
              </TableCell>
              <TableCell className="font-medium">
                {formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
              </TableCell>
              <TableCell>
                {formatSupplyDate(purchase.expectedDate)}
                <div className="text-xs text-muted-foreground">
                  {purchase.destinationLocationName ?? 'No destination set'}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  {purchase.status === 'DRAFT' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onLine(purchase)}
                        title="Add a product line"
                      >
                        <Plus /> Add line
                      </Button>
                      <Button
                        size="sm"
                        disabled={!purchase.lines.length}
                        onClick={() =>
                          transition(
                            `/admin/purchases/${purchase.id}/place`,
                            purchase.version,
                            'Purchase placed. Its lines are ready for shipment planning.',
                          )
                        }
                        title="Place this supplier order"
                      >
                        <Check /> Place
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onCancel(purchase)}
                        title="Cancel this purchase"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : purchase.status === 'PLACED' ? (
                    <>
                      <Link
                        href="/inbound-shipments?create=shipment"
                        className="inline-flex h-7 items-center rounded-lg border px-2.5 text-[0.8rem] font-medium no-underline"
                        title="Plan a shipment"
                      >
                        Plan shipment
                      </Link>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onCancel(purchase)}
                        title="Cancel only if nothing is allocated"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ShipmentsTable({
  items,
  expanded,
  setExpanded,
  onCancel,
  transition,
}: {
  items: InboundShipmentDto[];
  expanded: string | undefined;
  setExpanded: (id?: string) => void;
  onCancel: (shipment: InboundShipmentDto) => void;
  transition: (path: string, version: number, message: string, idempotent?: boolean) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shipment</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Contents</TableHead>
          <TableHead>Expected</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Next action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((shipment) => (
          <TableRow key={shipment.id}>
            <TableCell>
              <button
                className="flex items-center gap-1 font-medium hover:text-primary"
                onClick={() => setExpanded(expanded === shipment.id ? undefined : shipment.id)}
                title="Show shipment contents"
              >
                <ChevronDown
                  className={`size-4 transition-transform ${expanded === shipment.id ? 'rotate-180' : ''}`}
                />{' '}
                {shipment.shipmentNumber}
              </button>
              <div className="text-xs text-muted-foreground">
                {shipment.trackingReference ?? 'No tracking reference'} · {shipment.transportMode}
              </div>
              {expanded === shipment.id ? (
                <div className="mt-3 grid min-w-96 gap-2">
                  {shipment.allocations.map((line) => (
                    <div className="rounded-lg bg-muted p-2 text-xs" key={line.id}>
                      <div className="font-medium">
                        {line.productTitle} · {line.sku}
                      </div>
                      <div className="text-muted-foreground">
                        {line.purchaseNumber} · {line.supplierName} · received{' '}
                        {formatSupplyNumber(line.receivedQuantity)} of{' '}
                        {formatSupplyNumber(line.allocatedQuantity)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              {shipment.receivingLocationName}
              <div className="text-xs text-muted-foreground">
                {shipment.originText ? `From ${shipment.originText}` : 'Origin not set'}
              </div>
            </TableCell>
            <TableCell>
              {shipment.allocations.length} lines
              <div className="text-xs text-muted-foreground">
                {new Set(shipment.allocations.map((line) => line.supplierName)).size} suppliers
              </div>
            </TableCell>
            <TableCell>{formatSupplyDate(shipment.expectedArrivalDate)}</TableCell>
            <TableCell>
              <div className="flex flex-col items-start gap-1">
                <StatusBadge status={shipment.status} />
                <StatusBadge status={shipment.receivingStatus} />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                {shipment.status === 'PLANNED' ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        transition(
                          `/admin/inbound-shipments/${shipment.id}/depart`,
                          shipment.version,
                          'Departure recorded. The shipment is in transit.',
                          true,
                        )
                      }
                      title="Record departure"
                    >
                      <Truck /> Depart
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onCancel(shipment)}
                      title="Cancel this planned shipment"
                    >
                      Cancel
                    </Button>
                  </>
                ) : shipment.status === 'IN_TRANSIT' ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      transition(
                        `/admin/inbound-shipments/${shipment.id}/arrive`,
                        shipment.version,
                        'Arrival recorded. Count the goods in Receiving next.',
                        true,
                      )
                    }
                    title="Record warehouse arrival"
                  >
                    <PackageCheck /> Mark arrived
                  </Button>
                ) : shipment.status === 'ARRIVED' && shipment.receivingStatus !== 'RECEIVED' ? (
                  <Link
                    href={`/receiving?create=receipt&shipment=${shipment.id}`}
                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground no-underline"
                    title="Count and receive these goods"
                  >
                    Receive goods <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ReceiptsTable({
  items,
  shipments,
}: {
  items: InboundReceiptDto[];
  shipments: readonly InboundShipmentDto[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt</TableHead>
          <TableHead>Shipment</TableHead>
          <TableHead>Warehouse</TableHead>
          <TableHead>Counted goods</TableHead>
          <TableHead>Posted</TableHead>
          <TableHead>Inventory proof</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((receipt) => {
          const shipment = shipments.find((item) => item.id === receipt.shipmentId);
          return (
            <TableRow key={receipt.id}>
              <TableCell className="font-medium">
                {receipt.receiptNumber}
                <div className="mt-1">
                  <StatusBadge status={receipt.status} />
                </div>
              </TableCell>
              <TableCell>
                {shipment?.shipmentNumber ?? 'Inbound shipment'}
                <div className="text-xs text-muted-foreground">
                  {receipt.packingSlipReference ?? 'No packing slip reference'}
                </div>
              </TableCell>
              <TableCell>{shipment?.receivingLocationName ?? 'Receiving location'}</TableCell>
              <TableCell>
                {receipt.lines.map((line) => (
                  <div className="text-xs" key={line.id}>
                    {formatSupplyNumber(line.quantity)} · {line.condition.replaceAll('_', ' ')}
                  </div>
                ))}
              </TableCell>
              <TableCell>{formatSupplyDate(receipt.postedAt)}</TableCell>
              <TableCell>
                <Link
                  href="/inventory/history"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  title="Open matching inventory movements"
                >
                  View inventory movement
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
