'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Truck, AlertTriangle, ArrowUpRight, Info } from 'lucide-react';
import { usePaymentPermission } from './use-payment-query';
import { ClaimReviewQueue } from './claim-review';
import { CodOperations } from './record-panels';
import { ReceiptExceptions } from './receipt-workspace';
import { PaymentNotice } from './payment-ui';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type ActionQueueSubtab = 'claims' | 'cod' | 'exceptions';

interface ActionQueueHubProps {
  readonly subtab?: ActionQueueSubtab;
  readonly onSubtabChange: (subtab: ActionQueueSubtab) => void;
}

export function ActionQueueHub({
  subtab = 'claims',
  onSubtabChange,
}: ActionQueueHubProps) {
  const canReview = usePaymentPermission('payments.review');
  const canVerify = usePaymentPermission('payments.verify');

  const availableSubtabs = useMemo(() => {
    const list: { id: ActionQueueSubtab; label: string; icon: typeof ClipboardCheck; desc: string }[] = [];
    if (canReview) {
      list.push({
        id: 'claims',
        label: 'Wallet Claims',
        icon: ClipboardCheck,
        desc: 'Customer-submitted bKash and Nagad transaction references awaiting statement verification',
      });
    }
    if (canVerify) {
      list.push({
        id: 'cod',
        label: 'Delivered COD',
        icon: Truck,
        desc: 'Customer cash collections upon parcel delivery at doorstep',
      });
    }
    if (canReview) {
      list.push({
        id: 'exceptions',
        label: 'Receipt Exceptions',
        icon: AlertTriangle,
        desc: 'Overpayments, expired claim reconciliations, and maker-checker reversal reviews',
      });
    }
    return list;
  }, [canReview, canVerify]);

  const activeSubtab = availableSubtabs.some((s) => s.id === subtab)
    ? subtab
    : (availableSubtabs[0]?.id ?? 'claims');

  if (availableSubtabs.length === 0) {
    return (
      <PaymentNotice>
        You do not have permission to review wallet claims, verify COD, or handle receipt exceptions.
      </PaymentNotice>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subtab Navigation */}
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeSubtab}
          onValueChange={(val) => onSubtabChange(val as ActionQueueSubtab)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
            {availableSubtabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium sm:text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <p className="hidden text-xs text-muted-foreground lg:block">
          {availableSubtabs.find((s) => s.id === activeSubtab)?.desc}
        </p>
      </div>

      {/* Subtab Content */}
      {activeSubtab === 'claims' && canReview && <ClaimReviewQueue />}

      {activeSubtab === 'cod' && canVerify && (
        <div className="space-y-6">
          {/* Informational distinction banner for COD Doorstep Collection vs Courier Remittance */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm shadow-2xs">
            <div className="flex items-start gap-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Doorstep Cash Collection (Orders)
                  </h4>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
                    Order Payment
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Record here that the customer paid cash to the delivery agent upon receiving their parcel. This completes the customer&apos;s payment obligation for the order.
                </p>
                <div className="pt-1 text-xs">
                  <span className="text-muted-foreground">Looking to reconcile courier bank deposits and shipping fees? Go to </span>
                  <Link
                    href="/finance/cod-settlements"
                    className="inline-flex items-center font-medium text-primary hover:underline"
                  >
                    <span>Finance &rarr; COD Settlements</span>
                    <ArrowUpRight className="ml-0.5 h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <CodOperations />
        </div>
      )}

      {activeSubtab === 'exceptions' && canReview && <ReceiptExceptions />}
    </div>
  );
}
