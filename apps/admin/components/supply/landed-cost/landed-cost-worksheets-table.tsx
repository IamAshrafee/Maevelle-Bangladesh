'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Coins,
  Copy,
  ExternalLink,
  Layers3,
  Search,
  Truck,
  X,
} from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatSupplyDate, formatSupplyMoney } from '@/lib/supply/api';
import type { LandedCostWorksheetsTableProps } from './types';

export function LandedCostWorksheetsTable({
  worksheets,
  selectedWorksheetId,
  onSelectWorksheet,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: LandedCostWorksheetsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyNumber = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredWorksheets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return worksheets.filter((w) => {
      // Status filter
      if (statusFilter === 'DRAFT' && w.status !== 'DRAFT' && w.status !== 'CALCULATED') {
        return false;
      }
      if (statusFilter === 'FINALIZED' && w.status !== 'FINALIZED') {
        return false;
      }
      // Text search
      if (!q) return true;
      const numberMatch = w.worksheet_number.toLowerCase().includes(q);
      const shipmentMatch = w.shipment_number?.toLowerCase().includes(q) ?? false;
      const locationMatch = w.receiving_location_name?.toLowerCase().includes(q) ?? false;
      return numberMatch || shipmentMatch || locationMatch;
    });
  }, [worksheets, searchQuery, statusFilter]);

  const draftCount = worksheets.filter(
    (w) => w.status === 'DRAFT' || w.status === 'CALCULATED',
  ).length;
  const finalizedCount = worksheets.filter((w) => w.status === 'FINALIZED').length;

  return (
    <div className="space-y-3">
      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search worksheets or shipments…"
            className="pl-8 pr-8 text-xs"
          />
          {searchQuery ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 self-start rounded-lg border bg-muted/50 p-0.5 sm:self-auto">
          <button
            type="button"
            onClick={() => onStatusFilterChange('ALL')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({worksheets.length})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('DRAFT')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === 'DRAFT'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Draft ({draftCount})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange('FINALIZED')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === 'FINALIZED'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Finalized ({finalizedCount})
          </button>
        </div>
      </div>

      {/* Worksheets Table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="font-semibold">Worksheet</TableHead>
              <TableHead className="font-semibold">Inbound Shipment</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Additional Expenses</TableHead>
              <TableHead className="font-semibold">Revisions</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWorksheets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                    <Layers3 className="size-6 text-muted-foreground/60" />
                    <p className="text-sm font-medium">No worksheets match the filter.</p>
                    <p className="text-xs">
                      {searchQuery
                        ? 'Try clearing your search query.'
                        : 'Start a landed cost worksheet from an arrived shipment.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredWorksheets.map((worksheet) => {
                const isSelected = worksheet.id === selectedWorksheetId;
                const totalAdditionalCost =
                  worksheet.results.reduce((sum, res) => sum + Number(res.additional_cost), 0) ||
                  worksheet.components.reduce(
                    (sum, comp) => sum + Number(comp.original_amount),
                    0,
                  );

                return (
                  <TableRow
                    key={worksheet.id}
                    onClick={() => onSelectWorksheet(worksheet.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/5 font-medium hover:bg-primary/10'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {/* Column 1: Worksheet # */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {worksheet.worksheet_number}
                        </span>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={(e) =>
                                  copyNumber(worksheet.worksheet_number, worksheet.id, e)
                                }
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              />
                            }
                          >
                            {copiedId === worksheet.id ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {copiedId === worksheet.id ? 'Copied!' : 'Copy worksheet #'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>

                    {/* Column 2: Shipment */}
                    <TableCell>
                      <div className="flex flex-col">
                        {worksheet.shipment_number ? (
                          <Link
                            href={`/inbound-shipments/${worksheet.shipment_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            <Truck className="size-3 shrink-0" />
                            <span>{worksheet.shipment_number}</span>
                            <ArrowUpRight className="size-2.5 opacity-60" />
                          </Link>
                        ) : (
                          <Link
                            href={`/inbound-shipments/${worksheet.shipment_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            <Truck className="size-3 shrink-0" />
                            <span>View Shipment</span>
                            <ArrowUpRight className="size-2.5 opacity-60" />
                          </Link>
                        )}
                        {worksheet.receiving_location_name ? (
                          <span className="text-[11px] text-muted-foreground">
                            {worksheet.receiving_location_name}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    {/* Column 3: Status Badge */}
                    <TableCell>
                      <StatusBadge status={worksheet.status} />
                    </TableCell>

                    {/* Column 4: Additional Expenses Total */}
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-xs font-semibold">
                          {formatSupplyMoney(
                            totalAdditionalCost.toString(),
                            worksheet.base_currency_code,
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {worksheet.components.length} component
                          {worksheet.components.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </TableCell>

                    {/* Column 5: Revisions */}
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">
                        Rev {worksheet.revisions[0]?.revision_number ?? '1'} (
                        {worksheet.revisions.length})
                      </Badge>
                    </TableCell>

                    {/* Column 6: Date */}
                    <TableCell className="text-xs text-muted-foreground">
                      {formatSupplyDate(worksheet.finalized_at ?? worksheet.created_at)}
                    </TableCell>

                    {/* Column 7: Arrow Indicator */}
                    <TableCell className="text-right">
                      <ChevronRight
                        className={`size-4 transition-transform ${
                          isSelected ? 'translate-x-0.5 text-primary' : 'text-muted-foreground/40'
                        }`}
                      />
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
