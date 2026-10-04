'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MessageSquare, ShieldCheck, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { fetchApiData } from '@/lib/api';

export interface OrderLineReviewState {
  readonly orderLineId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId: string | null;
  readonly variantLabel: string | null;
  readonly isDeliveredOrDispatched: boolean;
  readonly isEligible: boolean;
  readonly reviewSubmitted: boolean;
  readonly reviewId?: string;
  readonly reviewRating?: number;
  readonly reviewStatus?: string;
}

export function OrderReviewStatusCard({ orderId }: { readonly orderId: string }) {
  const [lines, setLines] = useState<readonly OrderLineReviewState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchState() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApiData<readonly OrderLineReviewState[]>(
          `/admin/orders/${orderId}/review-state`,
        );
        if (active) {
          setLines(data ?? []);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load review state.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void fetchState();
    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return (
      <section className="rounded-xl border bg-card p-6 shadow-xs" aria-label="Review State Loading">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="size-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Checking review lifecycle state…</span>
        </div>
      </section>
    );
  }

  if (error || lines.length === 0) {
    return null;
  }

  const submittedCount = lines.filter((l) => l.reviewSubmitted).length;

  return (
    <section className="rounded-xl border bg-card shadow-xs overflow-hidden" aria-label="Order Reviews Status">
      <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Review Lifecycle State</h2>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {submittedCount} / {lines.length} reviewed
        </span>
      </div>

      <div className="divide-y divide-border/60">
        {lines.map((line) => (
          <div key={line.orderLineId} className="flex items-center justify-between gap-4 px-6 py-3.5 text-xs">
            <div className="space-y-0.5 min-w-0">
              <Link
                href={`/products/${line.productId}`}
                className="font-medium text-foreground hover:text-primary hover:underline truncate block"
              >
                {line.productTitle}
              </Link>
              {line.variantLabel ? (
                <p className="text-[11px] text-muted-foreground truncate">
                  Variant: {line.variantLabel}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {line.reviewSubmitted ? (
                <div className="flex items-center gap-2">
                  {line.reviewRating ? (
                    <span className="text-amber-500 font-mono text-xs">
                      {'★'.repeat(line.reviewRating)}
                      <span className="text-muted-foreground/30">{'☆'.repeat(5 - line.reviewRating)}</span>
                    </span>
                  ) : null}
                  {line.reviewStatus ? (
                    <StatusBadge status={line.reviewStatus} className="text-[10px]" />
                  ) : null}
                  {line.reviewId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary hover:text-primary gap-1 px-2"
                      render={<Link href={`/reviews?id=${encodeURIComponent(line.reviewId)}`} />}
                      nativeButton={false}
                    >
                      View Review <ExternalLink className="size-3" />
                    </Button>
                  ) : null}
                </div>
              ) : line.isEligible ? (
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800">
                    Eligible for Review
                  </Badge>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Awaiting delivery
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
