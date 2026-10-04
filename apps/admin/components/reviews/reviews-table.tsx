'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  ShieldAlert,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ReviewModerationBadge,
  ReviewVerifiedBadge,
  ReviewVisibilityBadge,
} from './review-status-badge';

export interface AdminReviewListItem {
  readonly id: string;
  readonly productId: string;
  readonly product_id?: string;
  readonly productTitle: string;
  readonly product_title?: string;
  readonly revisionId: string;
  readonly revision_id?: string;
  readonly revisionNumber: number;
  readonly revision_number?: number;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string | null;
  readonly publicDisplayName: string;
  readonly public_display_name?: string;
  readonly customerId?: string;
  readonly customer_id?: string;
  readonly customerNumber?: string;
  readonly customer_number?: string;
  readonly customerName?: string;
  readonly customer_name?: string;
  readonly moderationStatus: string;
  readonly moderation_status?: string;
  readonly moderationReason: string | null;
  readonly moderation_reason?: string | null;
  readonly visibilityStatus: string;
  readonly visibility_status?: string;
  readonly verifiedPurchase: boolean;
  readonly verified_purchase?: boolean;
  readonly purchasedVariantLabel?: string | null;
  readonly purchased_variant_label?: string | null;
  readonly orderId?: string | null;
  readonly order_id?: string | null;
  readonly orderNumber?: string | null;
  readonly order_number?: string | null;
  readonly mediaCount: number;
  readonly media_count?: number;
  readonly merchantResponse: string | null;
  readonly merchant_response?: string | null;
  readonly submittedAt: string;
  readonly submitted_at?: string;
}

interface ReviewsTableProps {
  reviews: readonly AdminReviewListItem[];
  selectedId?: string | undefined;
  onSelectReview: (id: string) => void;
  density?: 'compact' | 'comfortable' | undefined;
  loading?: boolean | undefined;
}

export function ReviewsTable({
  reviews,
  selectedId,
  onSelectReview,
  density = 'comfortable',
  loading = false,
}: ReviewsTableProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-8 text-center space-y-3">
          <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Loading review moderation queue…</p>
        </div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center space-y-3">
        <ShieldAlert className="size-8 text-muted-foreground/50 mx-auto" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">No reviews found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No reviews match the selected queue filters or search term. Try switching queues or clearing search.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
      <Table density={density}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[32%]">Review & Rating</TableHead>
            <TableHead className="w-[22%]">Product</TableHead>
            <TableHead className="w-[20%]">Customer / Order</TableHead>
            <TableHead className="w-[14%]">Status</TableHead>
            <TableHead className="w-[12%] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((r) => {
            const id = r.id;
            const productId = r.productId || r.product_id || '';
            const productTitle = r.productTitle || r.product_title || 'Untitled Product';
            const customerId = r.customerId || r.customer_id;
            const customerName = r.customerName || r.customer_name || r.publicDisplayName || r.public_display_name;
            const orderNumber = r.orderNumber || r.order_number;
            const orderId = r.orderId || r.order_id;
            const rating = r.rating;
            const title = r.title;
            const body = r.body;
            const moderationStatus = r.moderationStatus || r.moderation_status || 'PENDING';
            const visibilityStatus = r.visibilityStatus || r.visibility_status || 'HIDDEN';
            const verified = Boolean(r.verifiedPurchase ?? r.verified_purchase);
            const variantLabel = r.purchasedVariantLabel || r.purchased_variant_label;
            const mediaCount = r.mediaCount ?? r.media_count ?? 0;
            const merchantResponse = r.merchantResponse || r.merchant_response;
            const submittedAt = r.submittedAt || r.submitted_at || '';
            const isSelected = selectedId === id;

            return (
              <TableRow
                key={id}
                data-state={isSelected ? 'selected' : undefined}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-primary/5 hover:bg-primary/10',
                )}
                onClick={() => onSelectReview(id)}
              >
                {/* Column 1: Review & Rating */}
                <TableCell className="align-top py-3">
                  <div className="space-y-1 max-w-md">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-amber-500 font-mono text-xs tracking-tight select-none"
                        aria-label={`${rating} out of 5 stars`}
                      >
                        {'★'.repeat(rating)}
                        <span className="text-muted-foreground/30">{'☆'.repeat(5 - rating)}</span>
                      </span>
                      <span className="text-xs font-semibold text-foreground font-mono tabular-nums">
                        {rating}.0
                      </span>
                      {mediaCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60 px-1.5 py-0.2 text-[10px] font-medium">
                          <ImageIcon className="size-2.5" />
                          {mediaCount} {mediaCount === 1 ? 'file' : 'files'}
                        </span>
                      ) : null}
                    </div>

                    {title ? (
                      <p className="text-xs font-semibold text-foreground line-clamp-1">
                        {title}
                      </p>
                    ) : null}

                    {body ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {body}
                      </p>
                    ) : (
                      <p className="text-xs italic text-muted-foreground/60">No written feedback</p>
                    )}

                    <p className="text-[11px] text-muted-foreground/75 font-mono tabular-nums">
                      {submittedAt ? new Date(submittedAt).toLocaleString() : '—'}
                    </p>
                  </div>
                </TableCell>

                {/* Column 2: Product */}
                <TableCell className="align-top py-3">
                  <div className="space-y-1">
                    <Link
                      href={`/products/${productId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium text-foreground hover:text-primary hover:underline line-clamp-2 leading-snug"
                    >
                      {productTitle}
                    </Link>
                    {variantLabel ? (
                      <p className="text-[11px] text-muted-foreground">
                        Variant: <span className="font-medium text-foreground/80">{variantLabel}</span>
                      </p>
                    ) : null}
                  </div>
                </TableCell>

                {/* Column 3: Customer & Order */}
                <TableCell className="align-top py-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {customerId ? (
                        <Link
                          href={`/customers/${customerId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {customerName}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{customerName}</span>
                      )}
                      {verified ? <ReviewVerifiedBadge /> : null}
                    </div>

                    {orderNumber ? (
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                        <span>Order</span>
                        {orderId ? (
                          <Link
                            href={`/orders/${orderId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-primary hover:underline"
                          >
                            #{orderNumber}
                          </Link>
                        ) : (
                          <span className="font-semibold">#{orderNumber}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60">Direct / Guest review</span>
                    )}
                  </div>
                </TableCell>

                {/* Column 4: Status & Response */}
                <TableCell className="align-top py-3">
                  <div className="flex flex-col gap-1.5">
                    <ReviewModerationBadge status={moderationStatus} />
                    <ReviewVisibilityBadge status={visibilityStatus} />
                    {merchantResponse ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="size-3" />
                        Maevelle replied
                      </span>
                    ) : moderationStatus === 'APPROVED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MessageSquare className="size-3" />
                        No reply yet
                      </span>
                    ) : null}
                  </div>
                </TableCell>

                {/* Column 5: Action */}
                <TableCell className="align-top py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 px-2.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectReview(id);
                    }}
                  >
                    Inspect
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
