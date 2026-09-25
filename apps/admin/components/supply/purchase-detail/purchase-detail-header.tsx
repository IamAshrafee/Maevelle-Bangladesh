'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Plus,
  Ship,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import type { PurchaseDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  nextPurchaseAction,
  purchaseQuantities,
  purchaseWorkflowStatus,
} from '@/lib/supply/status';

export interface PurchaseDetailHeaderProps {
  readonly purchase: PurchaseDto;
  readonly canManage: boolean;
  readonly canManageShipments: boolean;
  readonly busy: boolean;
  readonly onEditClick: () => void;
  readonly onAddLineClick: () => void;
  readonly onPlaceOrderClick: () => void;
  readonly onCancelClick: () => void;
  readonly onCloseClick?: (() => void) | undefined;
  readonly onPlanShipmentClick?: (() => void) | undefined;
}

const statusDescriptions: Record<string, string> = {
  DRAFT: 'Draft purchase: Items and commercial details are editable. Place order to enable shipment planning.',
  ORDERED: 'Order confirmed with supplier. Ready for inbound shipment assignment.',
  PARTIALLY_SHIPPED: 'Partially shipped: Inbound freight shipments are in progress for some ordered items.',
  SHIPPED: 'Fully shipped: All ordered quantities have been allocated to inbound shipments.',
  PARTIALLY_RECEIVED: 'Partially received: Arrived goods are being received and posted into warehouse inventory.',
  RECEIVED: 'Fully received: All items have been safely verified and accepted into inventory.',
  CLOSED: 'Closed purchase order: All receiving is finalized and PO is closed for further operations.',
  CANCELLED: 'Cancelled purchase order: Kept for historical audit. No further actions allowed.',
};

export function PurchaseDetailHeader({
  purchase,
  canManage,
  canManageShipments,
  busy,
  onEditClick,
  onAddLineClick,
  onPlaceOrderClick,
  onCancelClick,
  onCloseClick,
  onPlanShipmentClick,
}: PurchaseDetailHeaderProps) {
  const [copied, setCopied] = useState(false);
  const totals = purchaseQuantities(purchase);
  const workflowStatus = purchaseWorkflowStatus(purchase);

  function copyPurchaseNumber() {
    void navigator.clipboard.writeText(purchase.purchaseNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Purchases', href: '/purchases' },
          { label: purchase.purchaseNumber, current: true },
        ]}
      />

      {/* Main Header Row */}
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {purchase.purchaseNumber}
            </h1>

            {/* Copy Button with Tooltip */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy purchase order number"
                    onClick={copyPurchaseNumber}
                  />
                }
              >
                {copied ? (
                  <CheckCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="size-3.5 text-muted-foreground" />
                )}
              </TooltipTrigger>
              <TooltipContent side="top">
                {copied ? 'Copied to clipboard!' : 'Copy PO number'}
              </TooltipContent>
            </Tooltip>

            {/* Workflow Status Badge with Descriptive Tooltip */}
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
                <StatusBadge status={workflowStatus} />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {statusDescriptions[workflowStatus] ?? workflowStatus}
              </TooltipContent>
            </Tooltip>

            {purchase.supplierReference ? (
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                Ref: {purchase.supplierReference}
              </Badge>
            ) : null}
          </div>

          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>Supplier:</span>
            <Link
              href={`/suppliers/${purchase.supplierId}`}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
            >
              {purchase.supplierName}
              <ExternalLink className="size-3 text-muted-foreground" />
            </Link>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-foreground/90 font-medium">{nextPurchaseAction(purchase)}</span>
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {purchase.status === 'DRAFT' && canManage ? (
            <>
              {/* Edit Header Details */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="sm" onClick={onEditClick} disabled={busy} />
                  }
                >
                  <Edit3 className="size-3.5" />
                  <span>Edit details</span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Change supplier reference, dates, destination, or internal notes
                </TooltipContent>
              </Tooltip>

              {/* Add Item */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="sm" onClick={onAddLineClick} disabled={busy} />
                  }
                >
                  <Plus className="size-3.5" />
                  <span>Add item</span>
                </TooltipTrigger>
                <TooltipContent side="top">Add a catalog variant to this draft</TooltipContent>
              </Tooltip>

              {/* Place Order */}
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Button
                    size="sm"
                    disabled={busy || purchase.lines.length === 0}
                    onClick={onPlaceOrderClick}
                  >
                    <Check className="size-3.5" />
                    <span>Place order</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {purchase.lines.length === 0
                    ? 'Add at least one item before placing order'
                    : 'Confirm order with supplier and enable inbound shipment planning'}
                </TooltipContent>
              </Tooltip>

              {/* Cancel Draft */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={onCancelClick}
                    />
                  }
                >
                  <XCircle className="size-3.5" />
                  <span>Cancel</span>
                </TooltipTrigger>
                <TooltipContent side="top">Cancel this draft purchase order</TooltipContent>
              </Tooltip>
            </>
          ) : null}

          {purchase.status === 'PLACED' && (
            <>
              {canManageShipments && totals.allocated < totals.ordered ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      onPlanShipmentClick ? (
                        <Button
                          size="sm"
                          onClick={onPlanShipmentClick}
                          disabled={busy}
                          className="gap-1.5"
                        />
                      ) : (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          render={
                            <Link
                              href={`/inbound-shipments?create=shipment&purchase=${purchase.id}`}
                            />
                          }
                        />
                      )
                    }
                  >
                    <Ship className="size-3.5" />
                    <span>Plan shipment</span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Create an inbound shipment for the {totals.ordered - totals.allocated} unallocated units
                  </TooltipContent>
                </Tooltip>
              ) : null}

              {canManage && totals.allocated === 0 ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                        disabled={busy}
                        onClick={onCancelClick}
                      />
                    }
                  >
                    <XCircle className="size-3.5" />
                    <span>Cancel order</span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Cancel order (only permitted when no shipments have been allocated)
                  </TooltipContent>
                </Tooltip>
              ) : null}

              {canManage && onCloseClick ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={onCloseClick}
                        className="gap-1.5"
                      />
                    }
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>Close PO</span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Close this purchase order (finalizes receiving and seals the PO)
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </>
          )}

          {purchase.status === 'CLOSED' ? (
            <Badge variant="secondary" className="px-2.5 py-1 text-xs">
              Order Closed
            </Badge>
          ) : null}

          {purchase.status === 'CANCELLED' ? (
            <Badge variant="destructive" className="px-2.5 py-1 text-xs">
              Order Cancelled
            </Badge>
          ) : null}
        </div>
      </header>
    </div>
  );
}
