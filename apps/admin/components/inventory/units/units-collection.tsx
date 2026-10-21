import { useState } from 'react';
import Link from 'next/link';
import { Boxes, Check, ChevronRight, Copy, Loader2, Printer, ShieldCheck } from 'lucide-react';
import type { InventoryUnitDto, PaginationDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { unitCanBeInspected, unitCanEnterTransfer } from './unit-action-policy';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitStatusBadge } from './unit-status-badge';

export interface UnitsCollectionProps {
  readonly units: readonly InventoryUnitDto[];
  readonly pagination: PaginationDto;
  readonly page: number;
  readonly selectedIds: ReadonlySet<string>;
  readonly loading: boolean;
  readonly hasActiveFilters: boolean;
  readonly canManage: boolean;
  readonly canTransfer: boolean;
  readonly onSelectAll: (checked: boolean) => void;
  readonly onToggleSelected: (unitId: string) => void;
  readonly onInspect: (unit: InventoryUnitDto) => void;
  readonly onTransfer: (unit: InventoryUnitDto) => void;
  readonly onPrint: (unit: InventoryUnitDto) => void;
  readonly onPageChange: (page: number) => void;
  readonly onResetFilters: () => void;
}

function UnitCode({ unit }: { readonly unit: InventoryUnitDto }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(unit.unitCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center gap-1 font-mono text-xs font-bold text-foreground">
        <Link href={`/inventory/units/${unit.id}`} className="hover:text-primary hover:underline">
          {unit.unitCode}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => void copy()}
          aria-label={`Copy Unit ID ${unit.unitCode}`}
        >
          {copied ? (
            <Check className="size-3 text-success" aria-hidden="true" />
          ) : (
            <Copy className="size-3" aria-hidden="true" />
          )}
        </Button>
      </div>
      <span className="block font-mono text-[10px] text-muted-foreground">{unit.sku}</span>
    </div>
  );
}

export function UnitsCollection({
  units,
  pagination,
  page,
  selectedIds,
  loading,
  hasActiveFilters,
  canManage,
  canTransfer,
  onSelectAll,
  onToggleSelected,
  onInspect,
  onTransfer,
  onPrint,
  onPageChange,
  onResetFilters,
}: UnitsCollectionProps) {
  const allSelected = units.length > 0 && units.every((unit) => selectedIds.has(unit.id));

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground shadow-2xs">
        <Loader2 className="mx-auto mb-2 size-6 animate-spin text-primary" aria-hidden="true" />
        Loading physical units…
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
        <EmptyState
          icon={Boxes}
          title="No physical units found"
          description={
            hasActiveFilters
              ? 'No units match the current search and filters.'
              : 'Serialized units are created through inbound receiving, return intake, or authorized stock conversion.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
      <div className="hidden overflow-x-auto md:block">
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onSelectAll}
                  aria-label="Select all units on this page"
                />
              </TableHead>
              <TableHead>Unit ID</TableHead>
              <TableHead>Product and variant</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => {
              const selected = selectedIds.has(unit.id);
              return (
                <TableRow key={unit.id} className={selected ? 'bg-primary/5' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => onToggleSelected(unit.id)}
                      aria-label={`Select ${unit.unitCode}`}
                    />
                  </TableCell>
                  <TableCell>
                    <UnitCode unit={unit} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/products/${unit.productId}`}
                      className="block max-w-52 truncate text-xs font-medium text-foreground hover:underline"
                    >
                      {unit.productTitle}
                    </Link>
                    {unit.optionSummary ? (
                      <span className="block max-w-52 truncate text-[11px] text-muted-foreground">
                        {unit.optionSummary}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Link
                      href={`/inventory/warehouses/${unit.locationId}`}
                      className="block font-medium text-foreground hover:underline"
                    >
                      {unit.locationName || unit.locationCode || 'Unassigned'}
                    </Link>
                    {unit.packageReference ? (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Pack: {unit.packageReference}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <UnitConditionBadge condition={unit.currentCondition} short />
                  </TableCell>
                  <TableCell>
                    <UnitStatusBadge status={unit.status} />
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {unit.sourceReceiptId ? (
                      <Link
                        href={`/receiving/${unit.sourceReceiptId}`}
                        className="text-foreground hover:text-primary hover:underline"
                      >
                        {unit.sourceReceiptNumber || 'Receipt'}
                      </Link>
                    ) : (
                      unit.sourceType.replaceAll('_', ' ')
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canManage && unitCanBeInspected(unit) ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onInspect(unit)}
                          aria-label={`Inspect ${unit.unitCode}`}
                        >
                          <ShieldCheck className="text-info" aria-hidden="true" />
                        </Button>
                      ) : null}
                      {canTransfer && unitCanEnterTransfer(unit) ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onTransfer(unit)}
                          aria-label={`Transfer ${unit.unitCode}`}
                        >
                          <Boxes aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onPrint(unit)}
                        aria-label={`Print label for ${unit.unitCode}`}
                      >
                        <Printer aria-hidden="true" />
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        render={<Link href={`/inventory/units/${unit.id}`} />}
                      >
                        Detail
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y md:hidden">
        {units.map((unit) => {
          const selected = selectedIds.has(unit.id);
          return (
            <article key={unit.id} className={cn('space-y-3 p-3.5', selected && 'bg-primary/5')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleSelected(unit.id)}
                    aria-label={`Select ${unit.unitCode}`}
                  />
                  <UnitCode unit={unit} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <UnitStatusBadge status={unit.status} />
                  <UnitConditionBadge condition={unit.currentCondition} short />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">{unit.productTitle}</p>
                {unit.optionSummary ? (
                  <p className="text-[11px] text-muted-foreground">{unit.optionSummary}</p>
                ) : null}
              </div>
              <Link
                href={`/inventory/warehouses/${unit.locationId}`}
                className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 text-xs hover:border-primary/40"
              >
                <span className="text-muted-foreground">Location</span>
                <span className="font-semibold text-foreground">
                  {unit.locationName || unit.locationCode || 'Unassigned'}
                </span>
              </Link>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {canManage && unitCanBeInspected(unit) ? (
                    <Button variant="outline" size="xs" onClick={() => onInspect(unit)}>
                      Inspect
                    </Button>
                  ) : null}
                  {canTransfer && unitCanEnterTransfer(unit) ? (
                    <Button variant="outline" size="xs" onClick={() => onTransfer(unit)}>
                      Transfer
                    </Button>
                  ) : null}
                  <Button variant="outline" size="xs" onClick={() => onPrint(unit)}>
                    Label
                  </Button>
                </div>
                <Button size="xs" render={<Link href={`/inventory/units/${unit.id}`} />}>
                  Open <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t bg-muted/20 p-3 text-xs">
          <span className="text-muted-foreground">
            Page <strong className="font-mono tabular-nums">{pagination.page}</strong> of{' '}
            <strong className="font-mono tabular-nums">{pagination.totalPages}</strong>
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={page >= pagination.totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
