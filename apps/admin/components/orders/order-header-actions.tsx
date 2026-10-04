'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  MoreVertical,
  PackagePlus,
  PauseCircle,
  PhoneCall,
  PlayCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import type { OrderDetailDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchApiData } from '@/lib/api';

import { ConfirmOrderDialog } from './confirm-order-dialog';
import { CancelOrderDialog } from './cancel-order-dialog';
import { CompleteOrderDialog } from './complete-order-dialog';
import { CreateFulfillmentDialog } from './create-fulfillment-dialog';
import { HoldOrderDialog } from './hold-order-dialog';
import { RecordVerificationDialog } from './record-verification-dialog';

interface OrderHeaderActionsProps {
  readonly order: OrderDetailDto;
  readonly onRefresh: () => void;
  readonly onConfirmed: (feedback?: {
    orderMessage: string;
    smsEffect: string;
    tone: 'success' | 'warning' | 'info';
  }) => void;
}

export function OrderHeaderActions({
  order,
  onRefresh,
  onConfirmed,
}: OrderHeaderActionsProps) {
  const [resuming, setResuming] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);

  const { capabilities } = order;

  async function resumeOrder() {
    setResuming(true);
    try {
      await fetchApiData(`/admin/orders/${order.id}/resume`, {
        method: 'POST',
        body: JSON.stringify({ version: order.version }),
      });
      onRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to resume order');
    } finally {
      setResuming(false);
    }
  }

  const activeLines = order.lines.filter((line) => line.status === 'ACTIVE');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
        Refresh
      </Button>

      {/* Primary Action Button */}
      {capabilities.canConfirm && (
        <ConfirmOrderDialog
          orderId={order.id}
          orderNumber={order.orderNumber}
          currentVersion={order.version}
          overallRiskLevel={order.riskSummary?.overallRiskLevel}
          recommendation={order.riskSummary?.recommendation}
          onConfirmed={onConfirmed}
          onOpenVerification={() => setVerificationOpen(true)}
        />
      )}

      {capabilities.canResume && (
        <Button size="sm" onClick={resumeOrder} disabled={resuming}>
          <PlayCircle className="mr-1.5 size-4" />
          {resuming ? 'Resuming…' : 'Resume Order'}
        </Button>
      )}

      {!capabilities.canConfirm && capabilities.canCreateFulfillment && (
        <CreateFulfillmentDialog
          orderId={order.id}
          currentVersion={order.version}
          lines={activeLines}
        />
      )}

      {/* Verification Dialog controlled trigger */}
      {capabilities.canRecordVerification && (
        <RecordVerificationDialog
          orderId={order.id}
          orderNumber={order.orderNumber}
          customerPhone={order.customerPhone}
          onCompleted={onRefresh}
          trigger={
            <Button variant="outline" size="sm">
              <PhoneCall className="mr-1.5 size-3.5" />
              Verify
            </Button>
          }
        />
      )}

      {/* Secondary Actions Dropdown */}
      {(capabilities.canHold ||
        capabilities.canCancel ||
        capabilities.canComplete) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" aria-label="More operational actions">
                <MoreVertical className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            {capabilities.canHold && (
              <HoldOrderDialog
                orderId={order.id}
                currentVersion={order.version}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <PauseCircle className="mr-2 size-4 text-amber-600" />
                    Put On Hold
                  </DropdownMenuItem>
                }
              />
            )}

            {capabilities.canComplete && (
              <CompleteOrderDialog
                orderId={order.id}
                orderNumber={order.orderNumber}
                onCompleted={onRefresh}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <CheckCircle2 className="mr-2 size-4 text-emerald-600" />
                    Complete Order
                  </DropdownMenuItem>
                }
              />
            )}

            {capabilities.canCancel && (
              <>
                <DropdownMenuSeparator />
                <CancelOrderDialog
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  currentVersion={order.version}
                  onCompleted={onRefresh}
                  trigger={
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive focus:text-destructive"
                    >
                      <XCircle className="mr-2 size-4" />
                      Cancel Order
                    </DropdownMenuItem>
                  }
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
