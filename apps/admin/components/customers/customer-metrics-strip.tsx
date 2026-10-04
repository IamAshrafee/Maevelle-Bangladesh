'use client';

import {
  Banknote,
  CheckCircle,
  Clock,
  Coins,
  Package,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { CustomerDetailDto } from '@maevelle/contracts';

interface CustomerMetricsStripProps {
  readonly customer: CustomerDetailDto;
}

function formatBdt(amount: string | number | null | undefined): string {
  const numeric = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(numeric);
}

export function CustomerMetricsStrip({ customer }: CustomerMetricsStripProps) {
  const m = customer.commerceMetrics;
  const lastOrderFormatted = m.lastOrderAt
    ? new Intl.DateTimeFormat('en-BD', {
        dateStyle: 'medium',
      }).format(new Date(m.lastOrderAt))
    : 'No orders yet';

  return (
    <section aria-label="Customer Commerce Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {/* 1. Lifetime Order Value */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Lifetime Spend</span>
          <Banknote className="size-4 text-emerald-600" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight text-foreground">
          {formatBdt(m.lifetimeOrderValue)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Net merchandise + delivery
        </p>
      </div>

      {/* 2. Total Orders */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Total Orders</span>
          <ShoppingBag className="size-4 text-primary" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight text-foreground">
          {m.totalOrders}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="text-emerald-700 font-medium">{m.deliveredOrders ?? 0} delivered</span>
          <span>·</span>
          <span className="text-rose-600 font-medium">{m.cancelledOrders} cancelled</span>
        </div>
      </div>

      {/* 3. Collected Amount */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Collected</span>
          <CheckCircle className="size-4 text-emerald-600" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
          {formatBdt(m.collectedAmount)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Settled payments & COD
        </p>
      </div>

      {/* 4. Outstanding / Due */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Outstanding</span>
          <Coins className="size-4 text-amber-600" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
          {formatBdt(m.outstandingAmount)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Pending in-transit / COD
        </p>
      </div>

      {/* 5. Average Order Value */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Avg Order Value</span>
          <TrendingUp className="size-4 text-blue-600" aria-hidden="true" />
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight text-foreground">
          {formatBdt(m.averageOrderValue ?? (m.totalOrders > 0 ? Number(m.lifetimeOrderValue) / m.totalOrders : 0))}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Per placed order
        </p>
      </div>

      {/* 6. Last Order Date */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Latest Order</span>
          <Clock className="size-4 text-slate-500" aria-hidden="true" />
        </div>
        <p className="mt-2 text-sm font-semibold tracking-tight text-foreground truncate">
          {lastOrderFormatted}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {m.activeOrders > 0 ? `${m.activeOrders} active order(s)` : 'No active orders'}
        </p>
      </div>
    </section>
  );
}
