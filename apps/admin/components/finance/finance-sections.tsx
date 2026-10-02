'use client';

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  HandCoins,
  Landmark,
  Link2,
  Package,
  ReceiptText,
  RotateCcw,
  Scale,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import type {
  FinanceExpenseDto,
  FinanceLedgerEntryDto,
  FinanceOverviewDto,
  FinanceReconciliationDto,
  FinanceTrendRangeDto,
  FinanceTrendsDto,
  FinancialAccountDto,
  PaginationDto,
} from '@maevelle/contracts';

import { AccountsTable } from '@/components/finance/accounts-table';
import { OperationalEmptyState } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';

const financeTrendConfig = {
  collectedPayments: { label: 'Collected payments', color: 'var(--chart-1)' },
  completedRefunds: { label: 'Completed refunds', color: 'var(--chart-5)' },
  paidExpenses: { label: 'Paid expenses', color: 'var(--chart-3)' },
  netAccountMovement: { label: 'Net account movement', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function FinanceOverview({
  accounts,
  expenses,
  overview,
  trends,
  onTrendRangeChange,
}: {
  readonly accounts: readonly FinancialAccountDto[];
  readonly expenses: readonly FinanceExpenseDto[];
  readonly overview: FinanceOverviewDto;
  readonly trends: FinanceTrendsDto | null;
  readonly onTrendRangeChange: (range: FinanceTrendRangeDto) => void;
}) {
  const currencyAccounts = accounts.filter(
    (account) => account.currency_code === overview.currency,
  );
  const unposted = overview.attention.unpostedPayments + overview.attention.unpostedRefunds;
  const paymentWork =
    overview.attention.pendingPaymentVerifications + overview.attention.pendingCodCollections;
  const hasAttention =
    unposted > 0 ||
    paymentWork > 0 ||
    overview.attention.outstandingCodPayments > 0 ||
    overview.attention.reconciliationDifferences > 0 ||
    overview.attention.outstandingExpenses > 0;
  const chartData =
    trends?.series.map((point) => ({
      date: point.date,
      collectedPayments: Number(point.collectedPayments),
      completedRefunds: Number(point.completedRefunds),
      paidExpenses: Number(point.paidExpenses),
      netAccountMovement: Number(point.netAccountMovement),
    })) ?? [];

  return (
    <div className="grid gap-6">
      <Stats aria-label="Finance summary">
        <StatsCard>
          <StatsTitle>Collected payments</StatsTitle>
          <StatsValue>
            {formatMoney(overview.metrics.collectedPayments, overview.currency)}
          </StatsValue>
          <StatsDescription>{overview.period.label} · verified customer money</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Completed refunds</StatsTitle>
          <StatsValue>
            {formatMoney(overview.metrics.completedRefunds, overview.currency)}
          </StatsValue>
          <StatsDescription>{overview.period.label} · completed customer refunds</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Paid expenses</StatsTitle>
          <StatsValue>{formatMoney(overview.metrics.paidExpenses, overview.currency)}</StatsValue>
          <StatsDescription>
            {overview.period.label} · business costs paid from Accounts or owner capital
          </StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Net account movement</StatsTitle>
          <StatsValue>
            {formatMoney(overview.metrics.netAccountMovement, overview.currency)}
          </StatsValue>
          <StatsDescription>{overview.period.label} · ledger movement, not profit</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Courier-held COD</StatsTitle>
          <StatsValue>
            {formatMoney(overview.metrics.outstandingCodHeld, overview.currency)}
          </StatsValue>
          <StatsDescription>Collected cash not yet fully remitted</StatsDescription>
        </StatsCard>
      </Stats>

      {trends ? (
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>Operational cash flow</CardTitle>
                <CardDescription>
                  Customer collections, completed money out, and immutable account movement. This is
                  cash activity, not profit.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-1" aria-label="Finance trend range">
                {(
                  [
                    ['LAST_7_DAYS', '7 days'],
                    ['LAST_30_DAYS', '30 days'],
                    ['THIS_MONTH', 'This month'],
                    ['LAST_90_DAYS', '90 days'],
                  ] as const
                ).map(([range, label]) => (
                  <Button
                    key={range}
                    size="sm"
                    variant={trends.range === range ? 'default' : 'outline'}
                    onClick={() => onTrendRangeChange(range)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ChartContainer
              config={financeTrendConfig}
              className="aspect-auto h-[18rem] w-full"
              initialDimension={{ width: 900, height: 288 }}
            >
              <ComposedChart accessibilityLayer data={chartData} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(value: string) =>
                    new Intl.DateTimeFormat('en-BD', { month: 'short', day: 'numeric' }).format(
                      new Date(`${value}T00:00:00`),
                    )
                  }
                />
                <YAxis
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) =>
                    Intl.NumberFormat('en-BD', { notation: 'compact' }).format(value)
                  }
                />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  dataKey="collectedPayments"
                  type="monotone"
                  fill="var(--color-collectedPayments)"
                  fillOpacity={0.16}
                  stroke="var(--color-collectedPayments)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="completedRefunds"
                  type="monotone"
                  fill="var(--color-completedRefunds)"
                  fillOpacity={0.08}
                  stroke="var(--color-completedRefunds)"
                />
                <Area
                  dataKey="paidExpenses"
                  type="monotone"
                  fill="var(--color-paidExpenses)"
                  fillOpacity={0.08}
                  stroke="var(--color-paidExpenses)"
                />
                <Line
                  dataKey="netAccountMovement"
                  type="monotone"
                  dot={false}
                  stroke="var(--color-netAccountMovement)"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ChartContainer>
            <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
              <span>
                <small className="block text-muted-foreground">Collected</small>
                <strong>{formatMoney(trends.totals.collectedPayments, trends.currency)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Refunded</small>
                <strong>{formatMoney(trends.totals.completedRefunds, trends.currency)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Expenses paid</small>
                <strong>{formatMoney(trends.totals.paidExpenses, trends.currency)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Courier deductions</small>
                <strong>{formatMoney(trends.totals.courierDeductions, trends.currency)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Net account movement</small>
                <strong>{formatMoney(trends.totals.netAccountMovement, trends.currency)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasAttention ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" /> Attention
              needed
            </CardTitle>
            <CardDescription>
              Completed financial facts that still need an operational follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {paymentWork > 0 ? (
              <Link
                className="rounded-lg border bg-background p-3 hover:bg-muted/50"
                href={
                  overview.attention.pendingPaymentVerifications > 0
                    ? '/payments?tab=verification'
                    : '/payments?tab=cod'
                }
              >
                <strong className="block">
                  {paymentWork} collection task{paymentWork === 1 ? '' : 's'}
                </strong>
                <span className="text-sm text-muted-foreground">
                  Verify manual claims or record delivered COD collections.
                </span>
              </Link>
            ) : null}
            {unposted > 0 ? (
              <Link
                className="rounded-lg border bg-background p-3 hover:bg-muted/50"
                href="/payments?tab=payments&posting=UNPOSTED"
              >
                <strong className="block">
                  {unposted} account posting{unposted === 1 ? '' : 's'}
                </strong>
                <span className="text-sm text-muted-foreground">
                  Connect completed payments and refunds to where money is held.
                </span>
              </Link>
            ) : null}
            {overview.attention.outstandingCodPayments > 0 ? (
              <Link
                className="rounded-lg border bg-background p-3 hover:bg-muted/50"
                href="/finance/accounts?tab=cod-settlements"
              >
                <strong className="block">
                  {overview.attention.outstandingCodPayments} unsettled COD Payment
                  {overview.attention.outstandingCodPayments === 1 ? '' : 's'}
                </strong>
                <span className="text-sm text-muted-foreground">
                  {formatMoney(overview.metrics.outstandingCodHeld, overview.currency)} remains with
                  couriers.
                </span>
              </Link>
            ) : null}
            {overview.attention.reconciliationDifferences > 0 ? (
              <Link
                className="rounded-lg border bg-background p-3 hover:bg-muted/50"
                href="/finance/accounts?tab=reconciliation"
              >
                <strong className="block">
                  {overview.attention.reconciliationDifferences} balance difference
                  {overview.attention.reconciliationDifferences === 1 ? '' : 's'}
                </strong>
                <span className="text-sm text-muted-foreground">
                  Review the latest external balance comparisons.
                </span>
              </Link>
            ) : null}
            {overview.attention.outstandingSupplierPayments > 0 ? (
              <Link
                className="rounded-lg border bg-background p-3 hover:bg-muted/50"
                href="/purchases"
              >
                <strong className="block">
                  {overview.attention.outstandingSupplierPayments} supplier obligation
                  {overview.attention.outstandingSupplierPayments === 1 ? '' : 's'}
                </strong>
                <span className="text-sm text-muted-foreground">
                  {formatMoney(overview.metrics.outstandingSupplierPayments, overview.currency)} due
                  on linked purchases.
                </span>
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-2">
                Where money is held
                <Link
                  href="/finance/accounts"
                  className="text-xs font-normal text-primary hover:underline"
                >
                  View all →
                </Link>
              </span>
              <span>{formatMoney(overview.metrics.accountBalance, overview.currency)}</span>
            </CardTitle>
            <CardDescription>
              Balances are derived from immutable entries, never typed over.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {currencyAccounts.length ? (
              currencyAccounts.map((account) => (
                <Link
                  key={account.id}
                  href={`/finance/accounts/${account.id}`}
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <strong>{account.name}</strong>
                    <StatusBadge status={account.status} />
                  </span>
                  <span className="mt-2 block text-xl font-semibold">
                    {formatMoney(account.ledger_balance, account.currency_code)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {humanizeFinanceCode(account.account_type)} · {account.account_number}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Create an account before posting payments or expenses.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Expense obligations</span>
              <Link
                href="/finance/expenses"
                className="text-xs font-normal text-primary hover:underline"
              >
                View all →
              </Link>
            </CardTitle>
            <CardDescription>Recorded expenses that have not been fully paid.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {expenses
              .filter((expense) => Number(expense.outstanding) > 0)
              .slice(0, 5)
              .map((expense) => (
                <Link
                  key={expense.id}
                  href="/finance/expenses"
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <strong className="block truncate">{expense.description}</strong>
                    <span className="text-xs text-muted-foreground">
                      {expense.expense_number} · {expense.category_name}
                    </span>
                  </span>
                  <strong className="shrink-0">
                    {formatMoney(expense.outstanding, expense.currency_code)}
                  </strong>
                </Link>
              ))}
            {expenses.every((expense) => Number(expense.outstanding) <= 0) ? (
              <p className="text-sm text-muted-foreground">No outstanding recorded expenses.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <HandCoins className="size-4 text-emerald-600" aria-hidden="true" />
              Owner capital & funding
            </span>
            <Link
              href="/finance/capital"
              className="text-xs font-normal text-primary hover:underline"
            >
              Open workspace →
            </Link>
          </CardTitle>
          <CardDescription>
            Permanent capital contributions, owner-paid business expenses, and withdrawals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/finance/capital"
            className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="text-xs text-muted-foreground">Capital Ledger</span>
            <strong className="mt-1 block text-sm font-semibold">Immutable History</strong>
            <span className="text-xs text-muted-foreground">Traceable contribution ledger</span>
          </Link>
          <Link
            href="/finance/capital"
            className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="text-xs text-muted-foreground">Personally Funded Costs</span>
            <strong className="mt-1 block text-sm font-semibold">Zero Cash Disruption</strong>
            <span className="text-xs text-muted-foreground">Legitimate business expenses</span>
          </Link>
          <Link
            href="/finance/capital"
            className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="text-xs text-muted-foreground">Contributors</span>
            <strong className="mt-1 block text-sm font-semibold">Tracked Positions</strong>
            <span className="text-xs text-muted-foreground">Multi-owner ledger support</span>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export { AccountsTable };

export function AccountsSection({
  accounts,
  onTransfer,
  onViewActivity,
  onReconcile,
  onCreateAccount,
}: {
  readonly accounts: readonly FinancialAccountDto[];
  readonly onTransfer?: ((accountId: string) => void) | undefined;
  readonly onViewActivity?: ((accountId: string) => void) | undefined;
  readonly onReconcile?: ((accountId: string) => void) | undefined;
  readonly onCreateAccount?: (() => void) | undefined;
}) {
  return (
    <AccountsTable
      accounts={accounts}
      onTransfer={onTransfer}
      onViewActivity={onViewActivity}
      onReconcile={onReconcile}
      onCreateAccount={onCreateAccount}
    />
  );
}

export function ExpensesSection({
  expenses,
  canPay,
  onPay,
}: {
  readonly expenses: readonly FinanceExpenseDto[];
  readonly canPay: boolean;
  readonly onPay: (expense: FinanceExpenseDto) => void;
}) {
  if (!expenses.length)
    return (
      <OperationalEmptyState
        title="No expenses recorded"
        description="Record operating expenses here. Supply costs linked to landed cost remain visibly connected to their source."
      />
    );
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Expense</TableHead>
            <TableHead>Category / source</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell>
                <Link
                  className="font-semibold text-primary hover:underline"
                  href={`/finance/expenses/${expense.id}`}
                >
                  {expense.description}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {expense.expense_number}
                  {expense.payee_name ? ` · ${expense.payee_name}` : ''}
                </span>
              </TableCell>
              <TableCell>
                <span className="block">{expense.category_name}</span>
                {expense.source_domain ? (
                  expense.source_domain === 'procurement.purchase' && expense.source_id ? (
                    <Link
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      href={`/purchases/${expense.source_id}`}
                    >
                      <Link2 className="size-3" />
                      {expense.source_reference ?? 'Purchase'}
                      {expense.source_counterparty ? ` · ${expense.source_counterparty}` : ''}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="size-3" /> {humanizeFinanceCode(expense.source_domain)}
                    </span>
                  )
                ) : null}
              </TableCell>
              <TableCell>{formatFinanceDate(expense.expense_date)}</TableCell>
              <TableCell className="text-right">
                {formatMoney(expense.amount, expense.currency_code)}
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(expense.paid, expense.currency_code)}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatMoney(expense.outstanding, expense.currency_code)}
              </TableCell>
              <TableCell>
                {canPay && expense.status === 'RECORDED' && Number(expense.outstanding) > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => onPay(expense)}>
                    Pay expense
                  </Button>
                ) : (
                  <StatusBadge
                    status={
                      expense.status === 'CANCELLED'
                        ? 'CANCELLED'
                        : Number(expense.outstanding) === 0
                          ? 'PAID'
                          : expense.status
                    }
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export interface ActivitySectionProps {
  readonly entries: readonly FinanceLedgerEntryDto[];
  readonly pagination: PaginationDto;
  readonly query: string;
  readonly direction: 'ALL' | 'IN' | 'OUT';
  readonly transactionType: string;
  readonly accountId: string;
  readonly from: string;
  readonly to: string;
  readonly accounts: readonly FinancialAccountDto[];
  readonly loading: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onDirectionChange: (direction: 'ALL' | 'IN' | 'OUT') => void;
  readonly onTransactionTypeChange: (type: string) => void;
  readonly onAccountChange: (accountId: string) => void;
  readonly onFromChange: (from: string) => void;
  readonly onToChange: (to: string) => void;
  readonly onQuickRangeChange: (from: string, to: string) => void;
  readonly onApply: (e: FormEvent<HTMLFormElement>) => void;
  readonly onReset: () => void;
  readonly onPageChange: (page: number) => void;
}

function renderBusinessOrigin(entry: FinanceLedgerEntryDto) {
  if (!entry.source_domain || !entry.source_id) {
    if (entry.transaction_type === 'INTERNAL_TRANSFER') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowLeftRight className="size-3.5" /> Internal transfer
        </span>
      );
    }
    if (entry.transaction_type === 'OPENING_BALANCE') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Landmark className="size-3.5" /> Opening balance
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">Manual / internal</span>;
  }

  switch (entry.source_domain) {
    case 'payments.payment':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href={`/payments/${entry.source_id}`}
        >
          <CreditCard className="size-3.5" /> Payment <ExternalLink className="size-3" />
        </Link>
      );
    case 'payments.refund':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href={`/payments?tab=refunds&q=${encodeURIComponent(entry.transaction_number)}`}
        >
          <RotateCcw className="size-3.5" /> Refund <ExternalLink className="size-3" />
        </Link>
      );
    case 'finance.expense':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href={`/finance/expenses/${entry.source_id}`}
        >
          <ReceiptText className="size-3.5" /> Expense <ExternalLink className="size-3" />
        </Link>
      );
    case 'procurement.purchase':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href={`/purchases/${entry.source_id}`}
        >
          <Package className="size-3.5" /> Purchase <ExternalLink className="size-3" />
        </Link>
      );
    case 'finance.cod_settlement':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href="/finance/accounts?tab=cod-settlements"
        >
          <Banknote className="size-3.5" /> COD settlement <ExternalLink className="size-3" />
        </Link>
      );
    case 'finance.account':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href={`/finance/accounts/${entry.source_id}`}
        >
          <Landmark className="size-3.5" /> Account <ExternalLink className="size-3" />
        </Link>
      );
    case 'finance.capital_event':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href={
            entry.source_id
              ? `/finance/capital?eventId=${entry.source_id}`
              : '/finance/capital'
          }
        >
          <Banknote className="size-3.5" /> Owner capital <ExternalLink className="size-3" />
        </Link>
      );
    case 'assets.asset':
      return (
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          href={`/assets/${entry.source_id}`}
        >
          <BriefcaseBusiness className="size-3.5" /> Asset sale <ExternalLink className="size-3" />
        </Link>
      );
    default:
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5" /> {humanizeFinanceCode(entry.source_domain)}
        </span>
      );
  }
}

export function ActivitySection({
  entries,
  pagination,
  query,
  direction,
  transactionType,
  accountId,
  from,
  to,
  accounts,
  loading,
  onQueryChange,
  onDirectionChange,
  onTransactionTypeChange,
  onAccountChange,
  onFromChange,
  onToChange,
  onQuickRangeChange,
  onApply,
  onReset,
  onPageChange,
}: ActivitySectionProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Fallback
    }
  };

  const hasFilters = Boolean(
    query.trim() || direction !== 'ALL' || transactionType !== 'ALL' || accountId || from || to,
  );

  const presets = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: 'This month', days: 'month' },
    { label: '90 days', days: 90 },
  ] as const;

  function presetDates(days: (typeof presets)[number]['days']) {
    const end = new Date();
    const start = new Date(end);
    if (days === 'month') start.setDate(1);
    else start.setDate(start.getDate() - days + 1);
    const toStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return { from: toStr(start), to: toStr(end) };
  }

  const startItem = pagination.totalItems > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
  const totalPages = Math.max(1, pagination.totalPages);

  return (
    <div className="grid gap-4">
      {/* Controls Bar */}
      <section className="rounded-xl border bg-card p-3 shadow-2xs" aria-label="Activity filters">
        <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b pb-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Quick dates</span>
          {presets.map((preset) => {
            const dates = presetDates(preset.days);
            const selected = from === dates.from && to === dates.to;
            return (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={selected ? 'default' : 'outline'}
                disabled={loading}
                onClick={() => onQuickRangeChange(dates.from, dates.to)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>

        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_repeat(5,minmax(8rem,11rem))_auto] xl:items-end"
          onSubmit={onApply}
        >
          <label className="grid gap-1 text-sm font-medium sm:col-span-2 xl:col-span-1">
            Search
            <span className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-8"
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search transaction, description, or domain..."
              />
            </span>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Account
            <NativeSelect
              value={accountId}
              onChange={(e) => onAccountChange(e.target.value)}
              aria-label="Filter by account"
            >
              <option value="">All accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Direction
            <NativeSelect
              value={direction}
              onChange={(e) => onDirectionChange(e.target.value as 'ALL' | 'IN' | 'OUT')}
              aria-label="Filter by direction"
            >
              <option value="ALL">All directions</option>
              <option value="IN">Money in (+)</option>
              <option value="OUT">Money out (-)</option>
            </NativeSelect>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Type
            <NativeSelect
              value={transactionType}
              onChange={(e) => onTransactionTypeChange(e.target.value)}
              aria-label="Filter by transaction type"
            >
              <option value="ALL">All movement types</option>
              <option value="INTERNAL_TRANSFER">Internal transfers</option>
              <option value="PAYMENT_SOURCE_POSTING">Customer payments</option>
              <option value="REFUND_SOURCE_POSTING">Customer refunds</option>
              <option value="EXPENSE_PAYMENT">Expense payments</option>
              <option value="COD_SETTLEMENT">COD courier settlements</option>
              <option value="EXTERNAL_ADJUSTMENT">Adjustments</option>
              <option value="OPENING_BALANCE">Opening balances</option>
              <option value="CAPITAL_CONTRIBUTION">Capital contributions</option>
              <option value="CAPITAL_WITHDRAWAL">Capital withdrawals</option>
              <option value="CAPITAL_REVERSAL">Capital reversals</option>
            </NativeSelect>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            From
            <Input
              type="date"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            To
            <Input type="date" value={to} onChange={(event) => onToChange(event.target.value)} />
          </label>

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-1">
            <Button type="submit" disabled={loading}>
              Apply
            </Button>
            {hasFilters ? (
              <Button type="button" variant="outline" onClick={onReset} disabled={loading}>
                <X aria-hidden="true" /> Reset
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      {/* Ledger Table */}
      {!entries.length ? (
        <OperationalEmptyState
          title={hasFilters ? 'No matching activity' : 'No account activity yet'}
          description={
            hasFilters
              ? 'Try adjusting your search, direction, movement type, or date range filters.'
              : 'Payments, refunds, expenses, transfers, opening balances, and courier settlements will appear here.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Movement</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Business source</TableHead>
                <TableHead>Date & time</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const incoming = Number(entry.amount_delta) > 0;
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${
                            incoming
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                          }`}
                        >
                          {incoming ? (
                            <ArrowDownLeft className="size-4" />
                          ) : (
                            <ArrowUpRight className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-sm">{entry.description}</strong>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{entry.transaction_number}</span>
                            <button
                              type="button"
                              className="text-muted-foreground/70 hover:text-foreground"
                              title="Copy transaction number"
                              onClick={() => copyToClipboard(entry.transaction_number, entry.id)}
                            >
                              {copiedId === entry.id ? (
                                <Check className="size-3 text-emerald-600" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.account_id ? (
                        <Link
                          className="font-medium text-primary hover:underline"
                          href={`/finance/accounts/${entry.account_id}`}
                        >
                          {entry.account_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{entry.account_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={entry.transaction_type} />
                    </TableCell>
                    <TableCell>{renderBusinessOrigin(entry)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatFinanceDate(entry.created_at, true)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        incoming
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {incoming ? '+' : ''}
                      {formatMoney(entry.amount_delta, entry.currency_code)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination Toolbar */}
          <div className="flex flex-col gap-2.5 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {startItem} to {endItem} of {pagination.totalItems} movement
              {pagination.totalItems === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Page {pagination.page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => onPageChange(pagination.page - 1)}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= totalPages || loading}
                  onClick={() => onPageChange(pagination.page + 1)}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export function ReconciliationSection({
  checks,
  canManage,
  onResolve,
  onReopen,
}: {
  readonly checks: readonly FinanceReconciliationDto[];
  readonly canManage: boolean;
  readonly onResolve: (check: FinanceReconciliationDto) => void;
  readonly onReopen: (check: FinanceReconciliationDto) => void;
}) {
  if (!checks.length)
    return (
      <OperationalEmptyState
        title="No balance checks yet"
        description="Compare a real bank, wallet, cash, or courier balance with Maevelle's immutable ledger. This is a manual balance check, not automated statement matching."
      />
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {checks.map((check) => {
        const matched = Number(check.difference_amount) === 0;
        const resolved = check.status === 'CLOSED' && !matched;
        return (
          <Card key={check.id} className={matched ? '' : 'border-amber-500/30'}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Scale className="size-4" />
                  {check.account_name}
                </span>
                <StatusBadge status={matched ? 'MATCHED' : resolved ? 'RESOLVED' : 'EXCEPTION'} />
              </CardTitle>
              <CardDescription>{formatFinanceDate(check.created_at, true)}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <span>
                <small className="block text-muted-foreground">Ledger</small>
                <strong>{formatMoney(check.ledger_balance)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Observed</small>
                <strong>{formatMoney(check.observed_balance)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Difference</small>
                <strong className={matched ? 'text-emerald-600' : 'text-amber-700'}>
                  {formatMoney(check.difference_amount)}
                </strong>
              </span>
              {check.resolution ? (
                <div className="col-span-3 rounded-lg border bg-muted/30 p-3">
                  <small className="block text-muted-foreground">
                    {humanizeFinanceCode(check.resolution.code)} ·{' '}
                    {formatFinanceDate(check.resolution.resolved_at, true)}
                  </small>
                  <p className="mt-1">{check.resolution.note}</p>
                </div>
              ) : null}
              {!matched && check.status === 'OPEN' && canManage ? (
                <Button
                  className="col-span-3 justify-self-start"
                  size="sm"
                  variant="outline"
                  onClick={() => onResolve(check)}
                >
                  Resolve difference
                </Button>
              ) : null}
              {resolved && canManage ? (
                <Button
                  className="col-span-3 justify-self-start"
                  size="sm"
                  variant="outline"
                  onClick={() => onReopen(check)}
                >
                  Reopen difference
                </Button>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
