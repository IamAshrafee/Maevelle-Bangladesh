'use client';

import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, PackageOpen } from 'lucide-react';

import type { InventoryPositionDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';

import { InventoryEmptyState } from './inventory-page-ui';

function MovementSignals({ position }: { position: InventoryPositionDto }) {
  const signals = [
    Number(position.incomingSupply) > 0
      ? { icon: PackageOpen, label: `${formatInventoryNumber(position.incomingSupply)} supply` }
      : null,
    Number(position.incomingTransfer) > 0
      ? {
          icon: ArrowDownToLine,
          label: `${formatInventoryNumber(position.incomingTransfer)} inbound`,
        }
      : null,
    Number(position.outgoingTransfer) > 0
      ? {
          icon: ArrowUpFromLine,
          label: `${formatInventoryNumber(position.outgoingTransfer)} outbound`,
        }
      : null,
  ].filter((signal): signal is NonNullable<typeof signal> => signal !== null);
  return signals.length ? (
    <div className="flex flex-wrap gap-1.5">
      {signals.map(({ icon: Icon, label }) => (
        <Badge key={label} variant="outline" className="gap-1 font-normal">
          <Icon className="size-3" aria-hidden="true" />
          {label}
        </Badge>
      ))}
    </div>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function ConditionSignals({ position }: { position: InventoryPositionDto }) {
  const values = [
    ['Damaged', position.damaged],
    ['Quarantine', position.quarantine],
    ['Inspection', position.inspection],
  ].filter(([, quantity]) => Number(quantity) > 0);
  return values.length ? (
    <div className="flex flex-wrap gap-1.5">
      {values.map(([label, quantity]) => (
        <Badge key={label} variant={label === 'Damaged' ? 'destructive' : 'secondary'}>
          {label} {formatInventoryNumber(quantity!)}
        </Badge>
      ))}
    </div>
  ) : (
    <span className="text-muted-foreground">All sellable</span>
  );
}

export function InventoryPositionTable({
  positions,
  isLoading,
}: {
  positions: readonly InventoryPositionDto[];
  isLoading: boolean;
}) {
  if (isLoading)
    return (
      <div className="space-y-3" aria-label="Loading inventory positions">
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  if (!positions.length)
    return (
      <InventoryEmptyState
        title="No Stock Positions Found"
        description="No SKU and location combination matches these filters. Clear filters or receive stock to create a position."
      />
    );

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {positions.map((position) => (
          <Card key={`${position.inventoryItemId}-${position.locationId}`}>
            <CardContent className="space-y-4 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    className="line-clamp-2 font-semibold hover:underline"
                    href={`/inventory/stock/${position.inventoryItemId}`}
                  >
                    {position.productTitle}
                  </Link>
                  {position.optionSummary ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {position.optionSummary}
                    </p>
                  ) : null}
                  <p className="truncate font-mono text-xs text-muted-foreground">{position.sku}</p>
                </div>
                {position.inventoryStatus === 'ARCHIVED' ? (
                  <Badge variant="secondary">Archived</Badge>
                ) : null}
              </div>
              <Link
                className="text-sm font-medium hover:underline"
                href={`/inventory/warehouses/${position.locationId}`}
              >
                {position.locationName} · {position.locationCode}
              </Link>
              <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                <div>
                  <p className="text-xs text-muted-foreground">On Hand</p>
                  <p className="font-semibold">{formatInventoryNumber(position.onHand)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reserved</p>
                  <p className="font-semibold">{formatInventoryNumber(position.reserved)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="font-semibold text-emerald-600">
                    {formatInventoryNumber(position.availableToSell)}
                  </p>
                </div>
              </div>
              <ConditionSignals position={position} />
              <MovementSignals position={position} />
              <Button
                className="w-full"
                variant="outline"
                render={<Link href={`/inventory/stock/${position.inventoryItemId}`} />}
                nativeButton={false}
              >
                View Stock History
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product & SKU</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">On Hand</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead>Unavailable</TableHead>
              <TableHead>Moving</TableHead>
              <TableHead>Last Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={`${position.inventoryItemId}-${position.locationId}`}>
                <TableCell className="max-w-64 whitespace-normal">
                  <div className="min-w-0">
                    <Link
                      className="font-semibold hover:underline"
                      href={`/inventory/stock/${position.inventoryItemId}`}
                    >
                      {position.productTitle}
                    </Link>
                    {position.optionSummary ? (
                      <p className="text-xs text-muted-foreground">{position.optionSummary}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="font-mono">
                        {position.sku}
                      </Badge>
                      {position.inventoryStatus === 'ARCHIVED' ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    href={`/inventory/warehouses/${position.locationId}`}
                  >
                    {position.locationName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{position.locationCode}</p>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatInventoryNumber(position.onHand)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInventoryNumber(position.reserved)}
                </TableCell>
                <TableCell className="text-right font-semibold text-emerald-600 tabular-nums">
                  {formatInventoryNumber(position.availableToSell)}
                </TableCell>
                <TableCell>
                  <ConditionSignals position={position} />
                </TableCell>
                <TableCell>
                  <MovementSignals position={position} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {position.lastMovementAt
                    ? formatInventoryDate(position.lastMovementAt)
                    : 'No movement yet'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
