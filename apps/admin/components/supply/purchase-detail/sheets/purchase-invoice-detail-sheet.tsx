'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileEdit,
  FileText,
  HelpCircle,
  Receipt,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSupplyDate, formatSupplyMoney, supplyRequest } from '@/lib/supply/api';
import type { InvoiceDetail, SupplierInvoice } from '../types';

export interface PurchaseInvoiceDetailSheetProps {
  readonly invoiceId?: string | undefined;
  readonly open: boolean;
  readonly canPayInvoice: boolean;
  readonly canCreateInvoice: boolean;
  readonly onClose: () => void;
  readonly onPayClick: (invoice: SupplierInvoice) => void;
  readonly onAdjustClick: (invoice: SupplierInvoice) => void;
  readonly onCancelClick: (invoice: SupplierInvoice) => void;
}

export function PurchaseInvoiceDetailSheet({
  invoiceId,
  open,
  canPayInvoice,
  canCreateInvoice,
  onClose,
  onPayClick,
  onAdjustClick,
  onCancelClick,
}: PurchaseInvoiceDetailSheetProps) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !invoiceId) {
      setDetail(null);
      setError('');
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError('');

    supplyRequest<ApiEnvelope<InvoiceDetail>>(`/admin/finance/expenses/${invoiceId}`)
      .then((res) => {
        if (isMounted) {
          setDetail(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load invoice details.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, invoiceId]);

  const amountNumber = Number(detail?.amount || 0);
  const paidNumber = Number(detail?.paid || 0);
  const outstandingNumber = Number(detail?.outstanding || 0);
  const paymentProgress = amountNumber > 0 ? Math.min(100, Math.round((paidNumber / amountNumber) * 100)) : 0;
  const isPaid = outstandingNumber <= 0 && detail?.status !== 'CANCELLED';
  const isCancelled = detail?.status === 'CANCELLED';
  const canCancel = !isCancelled && paidNumber === 0 && canCreateInvoice;
  const canAdjust = !isCancelled && canCreateInvoice;
  const canPay = !isCancelled && outstandingNumber > 0 && canPayInvoice;

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Header */}
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono text-base font-bold">
                  {detail?.expense_number ?? 'Invoice Details'}
                </SheetTitle>
                {detail ? (
                  <StatusBadge status={isCancelled ? 'CANCELLED' : isPaid ? 'PAID' : 'OUTSTANDING'} />
                ) : null}
              </div>
              <SheetDescription className="text-xs text-muted-foreground">
                Authoritative accounts payable ledger and disbursement records
              </SheetDescription>
            </div>
            {detail ? (
              <Button
                variant="outline"
                size="icon-xs"
                render={<Link href={`/finance/expenses/${detail.id}`} target="_blank" />}
                className="shrink-0"
              >
                <ExternalLink className="size-3.5" />
                <span className="sr-only">Open in Finance Module</span>
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        {/* Content Body */}
        <div className="flex-1 space-y-5 px-6 py-5">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : detail ? (
            <>
              {/* Financial Snapshot Card */}
              <div className="rounded-xl border bg-card p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Settlement Progress</span>
                  <span className="text-xs font-mono font-semibold">{paymentProgress}% Paid</span>
                </div>
                <Progress value={paymentProgress} className="h-1.5 w-full" />

                <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Invoice Total</span>
                    <strong className="font-mono text-xs tabular-nums text-foreground">
                      {formatSupplyMoney(detail.amount, detail.currency_code)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Adjustments</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatSupplyMoney(detail.adjustments, detail.currency_code)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Total Disbursed</span>
                    <strong className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatSupplyMoney(detail.paid, detail.currency_code)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Balance Due</span>
                    <strong
                      className={`font-mono text-xs tabular-nums ${
                        outstandingNumber > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-muted-foreground'
                      }`}
                    >
                      {formatSupplyMoney(detail.outstanding, detail.currency_code)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Commercial Invoice Details */}
              <div className="rounded-xl border bg-muted/20 p-3.5 text-xs space-y-2">
                <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Receipt className="size-3.5 text-muted-foreground" />
                  <span>Invoice Metadata</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider">Bill Date</span>
                    <span className="text-foreground font-medium">{formatSupplyDate(detail.expense_date)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider">Supplier Bill #</span>
                    <span className="text-foreground font-mono font-medium">
                      {detail.external_reference || 'Not specified'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider">Payee / Entity</span>
                    <span className="text-foreground truncate block">{detail.payee_name || 'Direct Supplier'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider">Category</span>
                    <span className="text-foreground truncate block">{detail.category_name}</span>
                  </div>
                </div>
                {detail.notes ? (
                  <div className="pt-2 border-t border-border/50">
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                      Commercial Terms & Notes
                    </span>
                    <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{detail.notes}</p>
                  </div>
                ) : null}
              </div>

              {/* Payment Disbursements Ledger */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-heading text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <CreditCard className="size-3.5 text-emerald-600" />
                    <span>Disbursements & Payments ({detail.payments.length})</span>
                  </h4>
                  {canPay ? (
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1 h-6 text-[11px]"
                      onClick={() => onPayClick(detail)}
                    >
                      <CreditCard className="size-3" />
                      <span>Post payment</span>
                    </Button>
                  ) : null}
                </div>

                {detail.payments.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-center text-muted-foreground">
                    <Wallet className="size-5 mx-auto mb-1 opacity-50" />
                    <p className="text-xs font-medium">No disbursements recorded</p>
                    <p className="text-[11px] mt-0.5">
                      No cash payments have been settled against this invoice yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-xl border bg-card p-3 text-xs shadow-2xs space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <Wallet className="size-3.5 text-muted-foreground" />
                              {payment.accountName}
                            </span>
                            <span className="text-[11px] text-muted-foreground block mt-0.5">
                              Trx: <code className="font-mono text-[10px]">{payment.transactionNumber}</code> ·{' '}
                              {formatSupplyDate(payment.paidAt)}
                            </span>
                          </div>
                          <strong className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatSupplyMoney(payment.amount, detail.currency_code)}
                          </strong>
                        </div>
                        {payment.reference ? (
                          <div className="rounded-md bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <span className="font-medium text-foreground">Voucher / Ref:</span>
                            <code className="font-mono text-[10px] text-foreground font-semibold">
                              {payment.reference}
                            </code>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Adjustments / Credit Notes */}
              {detail.adjustmentHistory.length > 0 ? (
                <div className="space-y-2.5">
                  <h4 className="font-heading text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileEdit className="size-3.5 text-blue-600" />
                    <span>Credit Notes & Adjustments ({detail.adjustmentHistory.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {detail.adjustmentHistory.map((adj) => (
                      <div
                        key={adj.id}
                        className="rounded-xl border bg-card p-3 text-xs shadow-2xs flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                              {adj.type}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatSupplyDate(adj.createdAt)}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-[11px] mt-1">{adj.reason}</p>
                        </div>
                        <strong className="font-mono text-xs tabular-nums text-foreground">
                          {formatSupplyMoney(adj.amount, detail.currency_code)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        {detail && !loading ? (
          <SheetFooter className="border-t bg-muted/10 p-4 flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {canCancel ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive text-xs h-8"
                        onClick={() => onCancelClick(detail)}
                      />
                    }
                  >
                    <Ban className="size-3.5" />
                    <span>Cancel invoice</span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Void this unpaid invoice and reverse liability
                  </TooltipContent>
                </Tooltip>
              ) : null}

              {canAdjust ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 gap-1.5"
                  onClick={() => onAdjustClick(detail)}
                >
                  <FileEdit className="size-3.5" />
                  <span>Credit / Adjust</span>
                </Button>
              ) : null}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {canPay ? (
                <Button
                  size="sm"
                  className="text-xs h-8 gap-1.5"
                  onClick={() => onPayClick(detail)}
                >
                  <CreditCard className="size-3.5" />
                  <span>Post payment</span>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
