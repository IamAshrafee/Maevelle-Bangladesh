'use client';

import { HelpCircle } from 'lucide-react';
import type { PurchaseDto } from '@maevelle/contracts';

import {
  Stats,
  StatsCard,
  StatsDescription,
  StatsTitle,
  StatsValue,
} from '@/components/ui/stats';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  formatSupplyDate,
  formatSupplyMoney,
  formatSupplyNumber,
} from '@/lib/supply/api';
import { percentage, purchaseQuantities } from '@/lib/supply/status';
import type { SupplierInvoice } from './types';

export interface PurchaseDetailStatsProps {
  readonly purchase: PurchaseDto;
  readonly invoices: readonly SupplierInvoice[];
  readonly canViewFinance: boolean;
}

export function PurchaseDetailStats({
  purchase,
  invoices,
  canViewFinance,
}: PurchaseDetailStatsProps) {
  const totals = purchaseQuantities(purchase);
  const allocatedPct = percentage(totals.allocated, totals.ordered);
  const receivedPct = percentage(totals.received, totals.ordered);

  const invoicedTotal = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const paidTotal = invoices.reduce((sum, inv) => sum + Number(inv.paid), 0);
  const outstandingTotal = invoices.reduce((sum, inv) => sum + Number(inv.outstanding), 0);

  return (
    <Stats className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Order Value */}
      <StatsCard>
        <div className="flex items-center justify-between">
          <StatsTitle>Commercial Value</StatsTitle>
          <Tooltip>
            <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
              <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">
              Total purchase order amount agreed with the supplier.
            </TooltipContent>
          </Tooltip>
        </div>
        <StatsValue>{formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}</StatsValue>
        <StatsDescription>
          {purchase.lines.length} {purchase.lines.length === 1 ? 'line item' : 'line items'} ·{' '}
          {formatSupplyNumber(String(totals.ordered))} units
        </StatsDescription>
      </StatsCard>

      {/* 2. Freight Allocation */}
      <StatsCard>
        <div className="flex items-center justify-between">
          <StatsTitle>Freight Allocation</StatsTitle>
          <Tooltip>
            <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
              <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">
              Quantity assigned to inbound freight shipments (containers, air parcels, or couriers).
            </TooltipContent>
          </Tooltip>
        </div>
        <StatsValue>
          {formatSupplyNumber(String(totals.allocated))}
          <span className="text-xs font-normal text-muted-foreground">
            {' '}/ {formatSupplyNumber(String(totals.ordered))}
          </span>
        </StatsValue>
        <StatsDescription>
          {allocatedPct}% allocated
          {totals.ordered > totals.allocated ? (
            <span> · {formatSupplyNumber(String(totals.ordered - totals.allocated))} unassigned</span>
          ) : (
            <span> · all assigned</span>
          )}
        </StatsDescription>
      </StatsCard>

      {/* 3. Physical Receiving */}
      <StatsCard>
        <div className="flex items-center justify-between">
          <StatsTitle>Warehouse Receipts</StatsTitle>
          <Tooltip>
            <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
              <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">
              Units physically scanned, verified, and accepted into warehouse stock.
            </TooltipContent>
          </Tooltip>
        </div>
        <StatsValue>
          {formatSupplyNumber(String(totals.received))}
          <span className="text-xs font-normal text-muted-foreground">
            {' '}/ {formatSupplyNumber(String(totals.ordered))}
          </span>
        </StatsValue>
        <StatsDescription>
          {receivedPct}% received
          {totals.ordered > totals.received ? (
            <span> · {formatSupplyNumber(String(totals.ordered - totals.received))} remaining</span>
          ) : (
            <span> · fully received</span>
          )}
        </StatsDescription>
      </StatsCard>

      {/* 4. Financial Status or Delivery Date */}
      {canViewFinance ? (
        <StatsCard>
          <div className="flex items-center justify-between">
            <StatsTitle>Finance Payables</StatsTitle>
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
                <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top">
                Authoritative payables and payment disbursements recorded in the Finance cash ledger.
              </TooltipContent>
            </Tooltip>
          </div>
          <StatsValue>
            {formatSupplyMoney(String(invoicedTotal), purchase.currencyCode)}
          </StatsValue>
          <StatsDescription>
            Paid: {formatSupplyMoney(String(paidTotal), purchase.currencyCode)} · Due:{' '}
            {formatSupplyMoney(String(outstandingTotal), purchase.currencyCode)}
          </StatsDescription>
        </StatsCard>
      ) : (
        <StatsCard>
          <div className="flex items-center justify-between">
            <StatsTitle>Expected Delivery</StatsTitle>
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
                <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top">
                Estimated arrival date at destination warehouse based on supplier lead time.
              </TooltipContent>
            </Tooltip>
          </div>
          <StatsValue>{formatSupplyDate(purchase.expectedDate)}</StatsValue>
          <StatsDescription>
            Destination: {purchase.destinationLocationName ?? 'Not assigned'}
          </StatsDescription>
        </StatsCard>
      )}
    </Stats>
  );
}
