'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Eye,
  FileEdit,
  FileText,
  Filter,
  HelpCircle,
  MoreHorizontal,
  Receipt,
  ReceiptText,
  Search,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PurchaseDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import {
  formatSupplyDate,
  formatSupplyMoney,
} from '@/lib/supply/api';
import type { SupplierInvoice } from './types';

export interface PurchaseDetailFinanceTabProps {
  readonly purchase: PurchaseDto;
  readonly invoices: readonly SupplierInvoice[];
  readonly canCreateInvoice: boolean;
  readonly canPayInvoice: boolean;
  readonly busy: boolean;
  readonly onRecordInvoiceClick: () => void;
  readonly onPayInvoiceClick: (invoice: SupplierInvoice) => void;
  readonly onCancelInvoiceClick: (invoice: SupplierInvoice) => void;
  readonly onAdjustInvoiceClick: (invoice: SupplierInvoice) => void;
  readonly onInspectInvoiceClick: (invoiceId: string) => void;
}

type InvoiceFilter = 'ALL' | 'OUTSTANDING' | 'PAID' | 'CANCELLED';

export function PurchaseDetailFinanceTab({
  purchase,
  invoices,
  canCreateInvoice,
  canPayInvoice,
  busy,
  onRecordInvoiceClick,
  onPayInvoiceClick,
  onCancelInvoiceClick,
  onAdjustInvoiceClick,
  onInspectInvoiceClick,
}: PurchaseDetailFinanceTabProps) {
  const [filter, setFilter] = useState<InvoiceFilter>('ALL');
  const [search, setSearch] = useState('');

  // Active (non-cancelled) invoices for authoritative financial calculations
  const activeInvoices = useMemo(
    () => invoices.filter((inv) => inv.status !== 'CANCELLED'),
    [invoices],
  );

  const orderTotal = Number(purchase.totalAmount || 0);
  const invoiceTotal = activeInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const paidTotal = activeInvoices.reduce((sum, inv) => sum + Number(inv.paid), 0);
  const outstandingTotal = activeInvoices.reduce((sum, inv) => sum + Number(inv.outstanding), 0);
  const remainingUninvoiced = Math.max(0, orderTotal - invoiceTotal);
  const isOverinvoiced = invoiceTotal > orderTotal && orderTotal > 0;
  const overinvoicedAmount = isOverinvoiced ? invoiceTotal - orderTotal : 0;

  const billingProgress = orderTotal > 0 ? Math.min(100, Math.round((invoiceTotal / orderTotal) * 100)) : 0;
  const settlementProgress = invoiceTotal > 0 ? Math.min(100, Math.round((paidTotal / invoiceTotal) * 100)) : 0;

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const outstandingNum = Number(inv.outstanding);
      const isPaid = outstandingNum <= 0 && inv.status !== 'CANCELLED';
      const isCancelled = inv.status === 'CANCELLED';
      const isOutstanding = outstandingNum > 0 && !isCancelled;

      if (filter === 'OUTSTANDING' && !isOutstanding) return false;
      if (filter === 'PAID' && !isPaid) return false;
      if (filter === 'CANCELLED' && !isCancelled) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesExpenseNo = inv.expense_number.toLowerCase().includes(q);
        const matchesBillNo = (inv.external_reference || '').toLowerCase().includes(q);
        const matchesDesc = (inv.description || '').toLowerCase().includes(q);
        const matchesPayee = (inv.payee_name || '').toLowerCase().includes(q);
        const matchesCategory = (inv.category_name || '').toLowerCase().includes(q);
        return matchesExpenseNo || matchesBillNo || matchesDesc || matchesPayee || matchesCategory;
      }

      return true;
    });
  }, [invoices, filter, search]);

  const outstandingCount = invoices.filter(
    (inv) => Number(inv.outstanding) > 0 && inv.status !== 'CANCELLED',
  ).length;
  const paidCount = invoices.filter(
    (inv) => Number(inv.outstanding) <= 0 && inv.status !== 'CANCELLED',
  ).length;
  const cancelledCount = invoices.filter((inv) => inv.status === 'CANCELLED').length;

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-base font-semibold">
              Supplier Invoices & Payables
            </h2>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs font-mono">
              {activeInvoices.length} active
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Commercial bills, accounts payable, payment disbursements, and supplier credit notes.
          </p>
        </div>

        {canCreateInvoice ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="sm" onClick={onRecordInvoiceClick} disabled={busy} className="gap-1.5" />
              }
            >
              <ReceiptText className="size-4" />
              <span>Record invoice</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              Record an incoming bill or commercial invoice from {purchase.supplierName}
            </TooltipContent>
          </Tooltip>
        ) : purchase.status === 'DRAFT' ? (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
              <Button variant="outline" size="sm" disabled className="gap-1.5">
                <ReceiptText className="size-4" />
                <span>Record invoice</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Place this purchase order first before recording commercial invoices
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Financial Summary KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Order Value */}
        <Card size="sm" className="relative overflow-hidden">
          <CardContent className="p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Order Value</span>
            <p className="mt-1 font-mono text-base font-bold tabular-nums">
              {formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
            </p>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Original PO total</span>
              <span className="font-mono">{billingProgress}% billed</span>
            </div>
            <Progress value={billingProgress} className="h-1 mt-1.5 w-full bg-muted/60" />
          </CardContent>
        </Card>

        {/* Card 2: Total Invoiced */}
        <Card size="sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Invoiced</span>
              {isOverinvoiced ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge variant="destructive" className="text-[10px] font-mono cursor-help" />
                    }
                  >
                    +{formatSupplyMoney(String(overinvoicedAmount), purchase.currencyCode)} over
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Total invoices exceed the original purchase order amount.
                  </TooltipContent>
                </Tooltip>
              ) : remainingUninvoiced > 0 ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge variant="secondary" className="text-[10px] font-mono cursor-help" />
                    }
                  >
                    {formatSupplyMoney(String(remainingUninvoiced), purchase.currencyCode)} left
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Remaining amount left to be billed on this purchase order.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  Fully billed
                </Badge>
              )}
            </div>
            <p className="mt-1 font-mono text-base font-bold tabular-nums">
              {formatSupplyMoney(String(invoiceTotal), purchase.currencyCode)}
            </p>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {activeInvoices.length} {activeInvoices.length === 1 ? 'bill active' : 'bills active'}
              </span>
              <span className="font-mono">{settlementProgress}% settled</span>
            </div>
            <Progress value={settlementProgress} className="h-1 mt-1.5 w-full bg-muted/60" />
          </CardContent>
        </Card>

        {/* Card 3: Disbursed / Paid */}
        <Card size="sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Disbursed / Paid</span>
              {settlementProgress === 100 && invoiceTotal > 0 ? (
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  100% Settled
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatSupplyMoney(String(paidTotal), purchase.currencyCode)}
            </p>
            <span className="mt-1.5 block text-[11px] text-muted-foreground">
              Immutable bank & cash ledger debits
            </span>
          </CardContent>
        </Card>

        {/* Card 4: Balance Due / Outstanding */}
        <Card size="sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Balance Due / Outstanding</span>
              {outstandingTotal > 0 ? (
                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                  Payment Due
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  No Dues
                </Badge>
              )}
            </div>
            <p
              className={`mt-1 font-mono text-base font-bold tabular-nums ${
                outstandingTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
              }`}
            >
              {formatSupplyMoney(String(outstandingTotal), purchase.currencyCode)}
            </p>
            <span className="mt-1.5 block text-[11px] text-muted-foreground">
              Pending accounts payable disbursement
            </span>
          </CardContent>
        </Card>
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center sm:p-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ReceiptText className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-heading text-base font-semibold">No supplier invoices recorded</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Record the supplier's commercial bill to track accounts payable, cash disbursements, and landed cost.
          </p>
          {canCreateInvoice ? (
            <Button className="mt-5 gap-1.5" onClick={onRecordInvoiceClick} disabled={busy}>
              <ReceiptText className="size-4" />
              <span>Record supplier invoice</span>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Filter & Search Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="xs"
                variant={filter === 'ALL' ? 'default' : 'outline'}
                onClick={() => setFilter('ALL')}
                className="h-7 text-xs"
              >
                All ({invoices.length})
              </Button>
              <Button
                size="xs"
                variant={filter === 'OUTSTANDING' ? 'default' : 'outline'}
                onClick={() => setFilter('OUTSTANDING')}
                className="h-7 text-xs gap-1"
              >
                <span>Needs Payment</span>
                {outstandingCount > 0 ? (
                  <Badge variant={filter === 'OUTSTANDING' ? 'secondary' : 'default'} className="h-4 px-1 text-[10px]">
                    {outstandingCount}
                  </Badge>
                ) : null}
              </Button>
              <Button
                size="xs"
                variant={filter === 'PAID' ? 'default' : 'outline'}
                onClick={() => setFilter('PAID')}
                className="h-7 text-xs"
              >
                Settled ({paidCount})
              </Button>
              {cancelledCount > 0 ? (
                <Button
                  size="xs"
                  variant={filter === 'CANCELLED' ? 'default' : 'outline'}
                  onClick={() => setFilter('CANCELLED')}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Cancelled ({cancelledCount})
                </Button>
              ) : null}
            </div>

            {/* Quick Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search invoice, bill #, payee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Invoices Table */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px]">Invoice & Bill #</TableHead>
                  <TableHead className="min-w-[180px]">Description & Payee</TableHead>
                  <TableHead className="w-[130px]">Category</TableHead>
                  <TableHead className="w-[110px]">Bill Date</TableHead>
                  <TableHead className="text-right w-[110px]">Amount</TableHead>
                  <TableHead className="text-right w-[130px]">Paid / Disbursed</TableHead>
                  <TableHead className="text-right w-[110px]">Outstanding</TableHead>
                  <TableHead className="text-center w-[100px]">Status</TableHead>
                  <TableHead className="text-right w-[110px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-28 text-center text-xs text-muted-foreground">
                      No invoices match the selected filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((inv) => {
                    const amount = Number(inv.amount || 0);
                    const paid = Number(inv.paid || 0);
                    const outstanding = Number(inv.outstanding || 0);
                    const isCancelled = inv.status === 'CANCELLED';
                    const isPaid = outstanding <= 0 && !isCancelled;
                    const rowProgress = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;
                    const canPayRow = !isCancelled && outstanding > 0 && canPayInvoice;
                    const canCancelRow = !isCancelled && paid === 0 && canCreateInvoice;
                    const canAdjustRow = !isCancelled && canCreateInvoice;

                    return (
                      <TableRow
                        key={inv.id}
                        className={`group transition-colors ${
                          isCancelled ? 'opacity-60 bg-muted/20' : 'hover:bg-muted/30 cursor-pointer'
                        }`}
                        onClick={(e) => {
                          // Prevent triggering if clicked button or interactive elements
                          const target = e.target as HTMLElement;
                          if (target.closest('button') || target.closest('a')) return;
                          onInspectInvoiceClick(inv.id);
                        }}
                      >
                        {/* Invoice Number & Supplier External Ref */}
                        <TableCell className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onInspectInvoiceClick(inv.id)}
                              className="font-mono font-semibold text-xs text-foreground hover:underline text-left"
                            >
                              {inv.expense_number}
                            </button>
                            {inv.notes ? (
                              <Tooltip>
                                <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
                                  <FileText className="size-3 text-muted-foreground/70 hover:text-foreground" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs whitespace-pre-wrap">
                                  {inv.notes}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                          {inv.external_reference ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">Bill #:</span>
                              <span className="font-mono text-[11px] font-medium text-foreground">
                                {inv.external_reference}
                              </span>
                            </div>
                          ) : null}
                        </TableCell>

                        {/* Description & Payee */}
                        <TableCell className="max-w-[220px]">
                          <p className="truncate text-xs font-medium text-foreground">{inv.description}</p>
                          {inv.payee_name && inv.payee_name !== purchase.supplierName ? (
                            <p className="truncate text-[11px] text-muted-foreground">Payee: {inv.payee_name}</p>
                          ) : (
                            <p className="truncate text-[11px] text-muted-foreground/80">{purchase.supplierName}</p>
                          )}
                        </TableCell>

                        {/* Category */}
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="truncate block max-w-[120px]" title={inv.category_name}>
                            {inv.category_name}
                          </span>
                        </TableCell>

                        {/* Bill Date */}
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {formatSupplyDate(inv.expense_date)}
                        </TableCell>

                        {/* Total Amount */}
                        <TableCell className="text-right font-mono font-medium text-xs tabular-nums">
                          {formatSupplyMoney(inv.amount, inv.currency_code)}
                        </TableCell>

                        {/* Paid & Mini Progress */}
                        <TableCell className="text-right space-y-1">
                          <div className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                            {formatSupplyMoney(inv.paid, inv.currency_code)}
                          </div>
                          {!isCancelled && amount > 0 ? (
                            <div className="flex items-center justify-end gap-1">
                              <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 transition-all"
                                  style={{ width: `${rowProgress}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                                {rowProgress}%
                              </span>
                            </div>
                          ) : null}
                        </TableCell>

                        {/* Outstanding Balance */}
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {outstanding > 0 ? (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              {formatSupplyMoney(inv.outstanding, inv.currency_code)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {formatSupplyMoney('0', inv.currency_code)}
                            </span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center">
                          <StatusBadge
                            status={isCancelled ? 'CANCELLED' : isPaid ? 'PAID' : 'OUTSTANDING'}
                          />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canPayRow ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      onClick={() => onPayInvoiceClick(inv)}
                                      disabled={busy}
                                      className="h-7 gap-1 text-xs"
                                    />
                                  }
                                >
                                  <CreditCard className="size-3" />
                                  <span>Pay</span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Record cash payment for {formatSupplyMoney(inv.outstanding, inv.currency_code)}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => onInspectInvoiceClick(inv.id)}
                                      className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                    />
                                  }
                                >
                                  <Eye className="size-3" />
                                  <span>View</span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  View payment history & ledger
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {/* Dropdown Menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    className="size-7 text-muted-foreground hover:text-foreground"
                                    title="More invoice options"
                                  />
                                }
                              >
                                <MoreHorizontal className="size-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs">
                                <DropdownMenuItem onClick={() => onInspectInvoiceClick(inv.id)}>
                                  <Eye className="size-3.5 mr-2 text-muted-foreground" />
                                  <span>Payment History & Ledger</span>
                                </DropdownMenuItem>

                                {canPayRow ? (
                                  <DropdownMenuItem onClick={() => onPayInvoiceClick(inv)}>
                                    <CreditCard className="size-3.5 mr-2 text-emerald-600" />
                                    <span>Record Payment</span>
                                  </DropdownMenuItem>
                                ) : null}

                                {canAdjustRow ? (
                                  <DropdownMenuItem onClick={() => onAdjustInvoiceClick(inv)}>
                                    <FileEdit className="size-3.5 mr-2 text-blue-600" />
                                    <span>Credit Note / Adjust</span>
                                  </DropdownMenuItem>
                                ) : null}

                                <DropdownMenuSeparator />

                                {canCancelRow ? (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => onCancelInvoiceClick(inv)}
                                  >
                                    <Ban className="size-3.5 mr-2" />
                                    <span>Cancel Invoice</span>
                                  </DropdownMenuItem>
                                ) : null}

                                <DropdownMenuItem
                                  render={<Link href={`/finance/expenses/${inv.id}`} target="_blank" />}
                                >
                                  <ExternalLink className="size-3.5 mr-2 text-muted-foreground" />
                                  <span>Open in Finance</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
