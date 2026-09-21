'use client';

import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Landmark,
  Link2,
  Scale,
} from 'lucide-react';
import Link from 'next/link';
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import type {
  FinanceExpenseDto,
  FinanceLedgerEntryDto,
  FinanceOverviewDto,
  FinanceReconciliationDto,
  FinanceTrendRangeDto,
  FinanceTrendsDto,
  FinancialAccountDto,
} from '@maevelle/contracts';

import { OperationalEmptyState } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
          <StatsDescription>{overview.period.label} · account-backed money out</StatsDescription>
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
                href="/payments"
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
                href="/payments"
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
                href="/finance/cod-settlements"
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
    </div>
  );
}

export function AccountsSection({
  accounts,
  onTransfer,
  onViewActivity,
  onReconcile,
}: {
  readonly accounts: readonly FinancialAccountDto[];
  readonly onTransfer?: (accountId: string) => void;
  readonly onViewActivity?: (accountId: string) => void;
  readonly onReconcile?: (accountId: string) => void;
}) {
  if (!accounts.length)
    return (
      <OperationalEmptyState
        title="No financial accounts"
        description="Create Cash, Bank, mobile-wallet, or courier holding accounts before recording account-backed money movement."
      />
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="flex flex-col justify-between rounded-xl border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md"
        >
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Landmark className="size-4" />
              </span>
              <StatusBadge status={account.status} />
            </div>
            <Link
              href={`/finance/accounts/${account.id}`}
              className="mt-3 block text-base font-semibold hover:underline"
            >
              {account.name}
            </Link>
            <span className="text-xs text-muted-foreground">
              {humanizeFinanceCode(account.account_type)} · {account.account_number}
            </span>
            <span className="mt-3 block text-2xl font-semibold tracking-tight">
              {formatMoney(account.ledger_balance, account.currency_code)}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {account.last_movement_at
                ? `Last movement ${formatFinanceDate(account.last_movement_at)}`
                : 'No movements yet'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-3">
            {onTransfer ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => onTransfer(account.id)}
              >
                <ArrowLeftRight className="size-3" /> Transfer
              </Button>
            ) : null}
            {onViewActivity ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => onViewActivity(account.id)}
              >
                <Activity className="size-3" /> Activity
              </Button>
            ) : null}
            {onReconcile ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => onReconcile(account.id)}
              >
                <Scale className="size-3" /> Reconcile
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-xs text-muted-foreground hover:text-foreground"
              render={<Link href={`/finance/accounts/${account.id}`} />}
            >
              Provenance <ChevronRight className="size-3 ml-0.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
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

export function ActivitySection({
  entries,
}: {
  readonly entries: readonly FinanceLedgerEntryDto[];
}) {
  if (!entries.length)
    return (
      <OperationalEmptyState
        title="No account activity"
        description="Payments, refunds, expenses, transfers, opening balances, and controlled adjustments will appear here."
      />
    );
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Movement</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Business source</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const incoming = Number(entry.amount_delta) > 0;
            return (
              <TableRow key={entry.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className={incoming ? 'text-emerald-600' : 'text-rose-600'}>
                      {incoming ? (
                        <ArrowDownLeft className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>
                    <span>
                      <strong className="block">{entry.description}</strong>
                      <span className="text-xs text-muted-foreground">
                        {entry.transaction_number}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>{entry.account_name}</TableCell>
                <TableCell>
                  <StatusBadge status={entry.transaction_type} />
                </TableCell>
                <TableCell>
                  {entry.source_domain
                    ? humanizeFinanceCode(entry.source_domain)
                    : 'Manual / internal'}
                </TableCell>
                <TableCell>{formatFinanceDate(entry.created_at, true)}</TableCell>
                <TableCell
                  className={`text-right font-semibold ${incoming ? 'text-emerald-600' : 'text-rose-600'}`}
                >
                  {incoming ? '+' : ''}
                  {formatMoney(entry.amount_delta, entry.currency_code)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
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
