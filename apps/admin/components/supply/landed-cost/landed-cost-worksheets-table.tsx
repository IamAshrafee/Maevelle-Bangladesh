'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, Layers3, Search, X } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSupplyDate, formatSupplyMoney } from '@/lib/supply/api';
import type { LandedCostWorksheetsTableProps } from './types';

export function LandedCostWorksheetsTable({
  worksheets,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: LandedCostWorksheetsTableProps) {
  const filteredWorksheets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return worksheets.filter((worksheet) => {
      if (
        statusFilter === 'DRAFT' &&
        worksheet.status !== 'DRAFT' &&
        worksheet.status !== 'CALCULATED'
      ) {
        return false;
      }
      if (statusFilter === 'FINALIZED' && worksheet.status !== 'FINALIZED') return false;
      if (!query) return true;
      return (
        worksheet.worksheet_number.toLowerCase().includes(query) ||
        (worksheet.shipment_number?.toLowerCase().includes(query) ?? false) ||
        (worksheet.receiving_location_name?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [worksheets, searchQuery, statusFilter]);

  const draftCount = worksheets.filter(
    (worksheet) => worksheet.status === 'DRAFT' || worksheet.status === 'CALCULATED',
  ).length;
  const finalizedCount = worksheets.filter((worksheet) => worksheet.status === 'FINALIZED').length;
  const worksheetRows = filteredWorksheets.map((worksheet) => {
    const totalAdditionalCost =
      worksheet.results.reduce((sum, result) => sum + Number(result.additional_cost), 0) ||
      worksheet.components.reduce((sum, component) => sum + Number(component.original_amount), 0);
    return {
      worksheet,
      totalAdditionalCost,
      shipmentHref: `/inbound-shipments/${worksheet.shipment_id}?tab=costing`,
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="landed-cost-search"
            autoComplete="off"
            aria-label="Search landed cost worksheets"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search worksheets or shipments…"
            className="pl-8 pr-8 text-xs"
          />
          {searchQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSearchChange('')}
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
              aria-label="Clear worksheet search"
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
        </div>

        <div
          className="flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-lg border bg-muted/50 p-0.5 sm:self-auto"
          aria-label="Filter worksheets by status"
        >
          {(
            [
              ['ALL', `All (${worksheets.length})`],
              ['DRAFT', `Draft (${draftCount})`],
              ['FINALIZED', `Finalized (${finalizedCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={statusFilter === value}
              onClick={() => onStatusFilterChange(value)}
              className={`min-h-11 touch-manipulation whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                statusFilter === value
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {worksheetRows.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            <Layers3 aria-hidden="true" className="mx-auto mb-3 size-7" />
            {searchQuery
              ? 'No worksheets match this search.'
              : 'Received shipments ready for costing appear in Awaiting Costing.'}
          </div>
        ) : null}
        {worksheetRows.map(({ worksheet, totalAdditionalCost, shipmentHref }) => (
          <article key={worksheet.id} className="rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{worksheet.worksheet_number}</p>
                <Link
                  href={shipmentHref}
                  className="mt-1 block truncate font-mono text-xs text-primary hover:underline"
                >
                  {worksheet.shipment_number ?? 'Open Shipment'}
                </Link>
              </div>
              <StatusBadge status={worksheet.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Additional Expenses</dt>
                <dd className="mt-1 font-mono font-semibold tabular-nums">
                  {formatSupplyMoney(totalAdditionalCost.toString(), worksheet.base_currency_code)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Revisions</dt>
                <dd className="mt-1 font-mono font-semibold tabular-nums">
                  {worksheet.revisions.length}
                </dd>
              </div>
            </dl>
            <Button className="mt-4 w-full justify-between" render={<Link href={shipmentHref} />}>
              <span>
                {worksheet.status === 'FINALIZED' ? 'Review Valuation' : 'Continue Costing'}
              </span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-2xs md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="font-semibold">Worksheet</TableHead>
              <TableHead className="font-semibold">Inbound Shipment</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Additional Expenses</TableHead>
              <TableHead className="font-semibold">Revisions</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="text-right font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWorksheets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                    <Layers3 aria-hidden="true" className="size-6 text-muted-foreground/60" />
                    <p className="text-sm font-medium">No Worksheets Found</p>
                    <p className="text-xs">
                      {searchQuery
                        ? 'Clear or change the search.'
                        : 'Received shipments ready for costing appear in the Awaiting Costing tab.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              worksheetRows.map(({ worksheet, totalAdditionalCost, shipmentHref }) => {
                return (
                  <TableRow key={worksheet.id} className="text-xs hover:bg-muted/40">
                    <TableCell className="font-mono font-semibold">
                      {worksheet.worksheet_number}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <Link
                          href={shipmentHref}
                          className="font-mono font-semibold text-primary hover:underline"
                        >
                          {worksheet.shipment_number ?? 'Open Shipment'}
                        </Link>
                        {worksheet.receiving_location_name ? (
                          <span className="max-w-56 truncate text-[11px] text-muted-foreground">
                            {worksheet.receiving_location_name}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={worksheet.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-semibold tabular-nums">
                        {formatSupplyMoney(
                          totalAdditionalCost.toString(),
                          worksheet.base_currency_code,
                        )}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {worksheet.components.length} component
                        {worksheet.components.length === 1 ? '' : 's'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        Rev {worksheet.revisions[0]?.revision_number ?? '1'} (
                        {worksheet.revisions.length})
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-muted-foreground tabular-nums">
                      {formatSupplyDate(worksheet.finalized_at ?? worksheet.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={shipmentHref} />}
                        className="gap-1.5 whitespace-nowrap"
                      >
                        <span>
                          {worksheet.status === 'FINALIZED'
                            ? 'Review Valuation'
                            : 'Continue Costing'}
                        </span>
                        <ArrowRight aria-hidden="true" className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
