'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Star,
  Undo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { fetchApiData } from '@/lib/api';

interface CustomerOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly totalAmount: string;
  readonly currencyCode: string;
  readonly createdAt: string;
}

interface CustomerReturnRow {
  readonly id: string;
  readonly caseNumber: string;
  readonly status: string;
  readonly returnType: string;
  readonly orderNumber: string;
  readonly createdAt: string;
}

interface CustomerRefundRow {
  readonly id: string;
  readonly amount: string;
  readonly status: string;
  readonly orderNumber: string;
  readonly createdAt: string;
}

interface CustomerReviewRow {
  readonly reviewId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string | null;
  readonly moderationStatus: string;
  readonly verifiedPurchase: boolean;
  readonly purchasedVariantLabel: string | null;
  readonly submittedAt: string;
}

interface CustomerOrdersSectionProps {
  readonly customerId: string;
  readonly isReadOnly?: boolean;
}

export function CustomerOrdersSection({ customerId, isReadOnly = false }: CustomerOrdersSectionProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'returns' | 'refunds' | 'reviews'>('orders');
  const [orders, setOrders] = useState<readonly CustomerOrderRow[]>([]);
  const [returns, setReturns] = useState<readonly CustomerReturnRow[]>([]);
  const [refunds, setRefunds] = useState<readonly CustomerRefundRow[]>([]);
  const [reviews, setReviews] = useState<readonly CustomerReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [ordersRes, returnsRes, refundsRes, reviewsRes] = await Promise.all([
        fetchApiData<readonly CustomerOrderRow[]>(`/admin/customers/${customerId}/orders?limit=25`),
        fetchApiData<readonly CustomerReturnRow[]>(`/admin/customers/${customerId}/returns?limit=25`),
        fetchApiData<readonly CustomerRefundRow[]>(`/admin/customers/${customerId}/refunds?limit=25`),
        fetchApiData<{ items: readonly CustomerReviewRow[] }>(`/admin/customers/${customerId}/reviews?pageSize=25`).catch(() => ({ items: [] })),
      ]);
      setOrders(ordersRes);
      setReturns(returnsRes);
      setRefunds(refundsRes);
      setReviews(reviewsRes?.items ?? []);
    } catch {
      // Handled silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [customerId]);

  function formatBdt(amount: string | number): string {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: 'BDT',
      maximumFractionDigits: 0,
    }).format(Number(amount));
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Order Activity">
      <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {/* Custom Pill Tab Selector */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'orders'
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShoppingBag className="size-3.5" aria-hidden="true" />
              Orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('returns')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'returns'
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Returns ({returns.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('refunds')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'refunds'
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              Refunds ({refunds.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reviews')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'reviews'
                  ? 'bg-background text-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Star className="size-3.5" aria-hidden="true" />
              Reviews ({reviews.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              render={<Link href={`/orders/new?customerId=${customerId}`} />}
              nativeButton={false}
            >
              <Plus className="size-3" aria-hidden="true" /> Create Order
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-primary hover:text-primary gap-1"
            render={<Link href={`/orders?customerId=${customerId}`} />}
            nativeButton={false}
          >
            All Orders in Orders Workspace <ExternalLink className="size-3" />
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 inline size-4 animate-spin" /> Loading commercial history...
          </div>
        ) : activeTab === 'orders' ? (
          orders.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
              <ShoppingBag className="mb-2 size-8 opacity-20" aria-hidden="true" />
              <p className="text-sm font-medium">No orders recorded yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                New orders placed online or manually created will appear here.
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex min-h-14 items-center justify-between gap-4 px-6 py-3.5 hover:bg-muted/40 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      #{order.orderNumber}
                    </span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Intl.DateTimeFormat('en-BD', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(order.createdAt))}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">
                    {formatBdt(order.totalAmount)}
                  </p>
                  <span className="text-[11px] text-primary hover:underline">
                    View Order Details →
                  </span>
                </div>
              </Link>
            ))
          )
        ) : activeTab === 'returns' ? (
          returns.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
              <RotateCcw className="mb-2 size-8 opacity-20" aria-hidden="true" />
              <p className="text-sm font-medium">No returns or RMA cases recorded</p>
            </div>
          ) : (
            returns.map((ret) => (
              <div
                key={ret.id}
                className="flex min-h-14 items-center justify-between gap-4 px-6 py-3.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      Case #{ret.caseNumber}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {ret.status.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Order #{ret.orderNumber} · Type: {ret.returnType.replaceAll('_', ' ')}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                    new Date(ret.createdAt),
                  )}
                </div>
              </div>
            ))
          )
        ) : refunds.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
            <Undo2 className="mb-2 size-8 opacity-20" aria-hidden="true" />
            <p className="text-sm font-medium">No monetary refunds recorded</p>
          </div>
        ) : (
          refunds.map((ref) => (
            <div
              key={ref.id}
              className="flex min-h-14 items-center justify-between gap-4 px-6 py-3.5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-rose-700 dark:text-rose-400">
                    {formatBdt(ref.amount)}
                  </span>
                  <Badge variant="outline" className="text-[10px] capitalize border-emerald-300 text-emerald-700">
                    {ref.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Order #{ref.orderNumber}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                  new Date(ref.createdAt),
                )}
              </div>
            </div>
          ))
        )}

        {/* Reviews List */}
        {activeTab === 'reviews' &&
          (reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Star className="size-8 stroke-1 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">No reviews submitted by this customer</p>
            </div>
          ) : (
            reviews.map((rev) => (
              <div
                key={rev.reviewId}
                className="flex min-h-14 items-center justify-between gap-4 px-6 py-3.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {rev.productTitle}
                    </span>
                    <span className="text-amber-500 text-xs">
                      {'★'.repeat(rev.rating)}
                      {'☆'.repeat(5 - rev.rating)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase ${
                        rev.moderationStatus === 'APPROVED'
                          ? 'border-emerald-300 text-emerald-700'
                          : rev.moderationStatus === 'REJECTED'
                            ? 'border-rose-300 text-rose-700'
                            : 'border-amber-300 text-amber-700'
                      }`}
                    >
                      {rev.moderationStatus}
                    </Badge>
                    {rev.verifiedPurchase ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Verified
                      </Badge>
                    ) : null}
                  </div>
                  {rev.purchasedVariantLabel ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Variant: {rev.purchasedVariantLabel}
                    </p>
                  ) : null}
                  {rev.title || rev.body ? (
                    <p className="text-xs text-foreground/80 mt-1 line-clamp-1">
                      {rev.title ? <strong>{rev.title}: </strong> : null}
                      {rev.body}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                    new Date(rev.submittedAt),
                  )}
                </div>
              </div>
            ))
          ))}
      </div>
    </section>
  );
}
