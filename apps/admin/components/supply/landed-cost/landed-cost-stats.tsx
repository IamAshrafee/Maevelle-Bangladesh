'use client';

import {
  Boxes,
  CircleDollarSign,
  Clock,
  Coins,
  FileCheck2,
  PackageCheck,
  ReceiptText,
} from 'lucide-react';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatSupplyMoney } from '@/lib/supply/api';
import type { LandedCostStatsProps } from './types';

export function LandedCostStats({ worksheets, unstartedShipments }: LandedCostStatsProps) {
  const drafts = worksheets.filter((w) => w.status === 'DRAFT' || w.status === 'CALCULATED').length;
  const finalized = worksheets.filter((w) => w.status === 'FINALIZED').length;

  const totalAdditionalCost = worksheets.reduce((sum, w) => {
    const fromResults = w.results.reduce((resSum, r) => resSum + Number(r.additional_cost), 0);
    if (fromResults > 0) return sum + fromResults;
    const fromComponents = w.components.reduce((compSum, c) => compSum + Number(c.original_amount), 0);
    return sum + fromComponents;
  }, 0);

  const totalFinalizedAcquisitionValue = worksheets
    .filter((w) => w.status === 'FINALIZED')
    .reduce((sum, w) => {
      const fromResults = w.results.reduce((resSum, r) => resSum + Number(r.total_acquisition_cost), 0);
      return sum + fromResults;
    }, 0);

  return (
    <Stats aria-label="Landed cost executive metrics">
      {/* KPI 1: Total Worksheets */}
      <Tooltip>
        <TooltipTrigger render={<span className="w-full text-left" />}>
          <StatsCard className="flex items-start justify-between gap-3 transition-shadow hover:shadow-sm">
            <div className="min-w-0 flex-1">
              <StatsTitle>Landed Cost Worksheets</StatsTitle>
              <StatsValue className="mt-1 font-heading text-2xl font-bold tracking-tight">
                {worksheets.length}
              </StatsValue>
              <StatsDescription className="mt-1 flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {drafts} Draft
                </span>
                <span>·</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {finalized} Finalized
                </span>
              </StatsDescription>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ReceiptText className="size-4" />
            </div>
          </StatsCard>
        </TooltipTrigger>
        <TooltipContent side="top">
          Total active worksheets tracking shipment landed costs across the organization
        </TooltipContent>
      </Tooltip>

      {/* KPI 2: Shipments Awaiting Costing */}
      <Tooltip>
        <TooltipTrigger render={<span className="w-full text-left" />}>
          <StatsCard
            className={`flex items-start justify-between gap-3 transition-shadow hover:shadow-sm ${
              unstartedShipments.length > 0 ? 'border-amber-500/20 bg-amber-500/5' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <StatsTitle>Awaiting Landed Cost</StatsTitle>
              <StatsValue
                className={`mt-1 font-heading text-2xl font-bold tracking-tight ${
                  unstartedShipments.length > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground'
                }`}
              >
                {unstartedShipments.length}
              </StatsValue>
              <StatsDescription className="mt-1 text-xs">
                {unstartedShipments.length > 0
                  ? 'Physical receipt verified; needs costing'
                  : 'All received shipments costed'}
              </StatsDescription>
            </div>
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                unstartedShipments.length > 0
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <PackageCheck className="size-4" />
            </div>
          </StatsCard>
        </TooltipTrigger>
        <TooltipContent side="top">
          Arrived shipments with warehouse physical counts confirmed that require freight & duty booking
        </TooltipContent>
      </Tooltip>

      {/* KPI 3: Total Allocated Logistics Expenses */}
      <Tooltip>
        <TooltipTrigger render={<span className="w-full text-left" />}>
          <StatsCard className="flex items-start justify-between gap-3 transition-shadow hover:shadow-sm">
            <div className="min-w-0 flex-1">
              <StatsTitle>Total Allocated Expenses</StatsTitle>
              <StatsValue className="mt-1 font-heading text-2xl font-bold tracking-tight">
                {formatSupplyMoney(totalAdditionalCost.toString(), 'BDT')}
              </StatsValue>
              <StatsDescription className="mt-1 text-xs text-muted-foreground">
                Freight, customs, taxes & port charges
              </StatsDescription>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coins className="size-4" />
            </div>
          </StatsCard>
        </TooltipTrigger>
        <TooltipContent side="top">
          Cumulative logistics, customs tariffs, handling, and insurance expenses entered on worksheets
        </TooltipContent>
      </Tooltip>

      {/* KPI 4: Finalized Stock Layer Value */}
      <Tooltip>
        <TooltipTrigger render={<span className="w-full text-left" />}>
          <StatsCard className="flex items-start justify-between gap-3 transition-shadow hover:shadow-sm">
            <div className="min-w-0 flex-1">
              <StatsTitle>Finalized Valuation</StatsTitle>
              <StatsValue className="mt-1 font-heading text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatSupplyMoney(totalFinalizedAcquisitionValue.toString(), 'BDT')}
              </StatsValue>
              <StatsDescription className="mt-1 text-xs text-muted-foreground">
                Permanent FIFO unit cost in warehouse
              </StatsDescription>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileCheck2 className="size-4" />
            </div>
          </StatsCard>
        </TooltipTrigger>
        <TooltipContent side="top">
          Total commercial acquisition value permanently recognized into warehouse FIFO stock layers
        </TooltipContent>
      </Tooltip>
    </Stats>
  );
}
