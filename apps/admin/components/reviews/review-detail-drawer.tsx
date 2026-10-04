'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Image as ImageIcon,
  MessageSquare,
  Package,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
  User,
  Video,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAdminCapability } from '@/components/admin-capabilities';
import {
  ReviewModerationBadge,
  ReviewVerifiedBadge,
  ReviewVisibilityBadge,
} from './review-status-badge';

export interface AdminReviewDetail {
  readonly id: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly productHandle: string;
  readonly customer: {
    readonly id: string;
    readonly customerNumber: string;
    readonly displayName: string | null;
  };
  readonly order: {
    readonly orderId: string;
    readonly orderNumber: string;
    readonly orderLineId: string;
    readonly skuSnapshot: string | null;
    readonly orderedAt: string;
    readonly fulfillmentStatus: string | null;
    readonly deliveryOutcome: string | null;
    readonly hasReturn: boolean;
    readonly hasRefund: boolean;
  } | null;
  readonly purchasedVariant: {
    readonly variantId: string | null;
    readonly label: string | null;
  };
  readonly verifiedPurchase: boolean;
  readonly source: string;
  readonly lifecycleStatus: string;
  readonly visibilityStatus: string;
  readonly publishedRevisionId: string | null;
  readonly currentRevision: {
    readonly id: string;
    readonly revisionNumber: number;
    readonly rating: number;
    readonly title: string | null;
    readonly body: string | null;
    readonly publicDisplayName: string;
    readonly moderationStatus: string;
    readonly moderationReason: string | null;
    readonly internalNote: string | null;
    readonly submittedAt: string;
    readonly moderatedAt: string | null;
    readonly moderatedByActorName: string | null;
  };
  readonly revisions: readonly {
    readonly id: string;
    readonly revisionNumber: number;
    readonly rating: number;
    readonly title: string | null;
    readonly body: string | null;
    readonly publicDisplayName: string;
    readonly moderationStatus: string;
    readonly moderationReason: string | null;
    readonly submittedAt: string;
    readonly moderatedAt: string | null;
  }[];
  readonly media: readonly {
    readonly assetId: string;
    readonly mediaType: 'IMAGE' | 'VIDEO';
    readonly position: number;
    readonly url: string;
    readonly thumbnailUrl: string;
  }[];
  readonly merchantResponse: {
    readonly body: string;
    readonly status: 'VISIBLE' | 'HIDDEN';
    readonly respondedBy: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const REJECTION_REASONS = [
  { value: 'SPAM', label: 'Spam or unsolicited advertising' },
  { value: 'DUPLICATE', label: 'Duplicate submission' },
  { value: 'IRRELEVANT', label: 'Irrelevant to the product' },
  { value: 'ABUSIVE_OR_THREATENING', label: 'Abusive or threatening language' },
  { value: 'PERSONAL_INFORMATION', label: 'Contains private personal information' },
  { value: 'UNSAFE_MEDIA', label: 'Unsafe or prohibited media content' },
  { value: 'FRAUD_SUSPECTED', label: 'Suspected fraudulent behavior' },
  { value: 'PROHIBITED_CONTENT', label: 'Prohibited commercial goods or claims' },
  { value: 'OTHER', label: 'Other policy violation' },
] as const;

interface ReviewDetailDrawerProps {
  reviewId?: string | null;
  onClose: () => void;
  onModified: () => void;
}

export function ReviewDetailDrawer({
  reviewId,
  onClose,
  onModified,
}: ReviewDetailDrawerProps) {
  const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Moderation form state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string>('SPAM');
  const [internalNote, setInternalNote] = useState('');

  // Merchant response form state
  const [responseBody, setResponseBody] = useState('');

  const canModerate = useAdminCapability('reviews.moderate');
  const canRespond = useAdminCapability('reviews.respond');

  useEffect(() => {
    if (!reviewId) {
      setDetail(null);
      setError(null);
      setFeedback(null);
      return;
    }

    let isSubscribed = true;
    async function fetchDetail() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/reviews/${reviewId}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Failed to load review inspection context.');
        }
        const json = await res.json();
        if (isSubscribed) {
          const data: AdminReviewDetail = json.data;
          setDetail(data);
          setResponseBody(data.merchantResponse?.body ?? '');
        }
      } catch (err) {
        if (isSubscribed) {
          setError(err instanceof Error ? err.message : 'Error loading review');
        }
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    void fetchDetail();
    return () => {
      isSubscribed = false;
    };
  }, [reviewId]);

  async function handleModerate(
    decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'RESTORE',
    reason?: string,
    notes?: string,
  ) {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/reviews/${detail.id}/moderate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          revisionId: detail.currentRevision.id,
          decision,
          ...(reason ? { reason } : {}),
          ...(notes ? { internalNotes: notes } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Moderation decision failed.');
      }

      setFeedback(
        decision === 'APPROVE'
          ? 'Review approved and published to Storefront.'
          : decision === 'REJECT'
            ? 'Revision rejected with recorded policy reason.'
            : decision === 'HIDE'
              ? 'Review hidden from Storefront; history preserved.'
              : 'Review restored to Storefront.',
      );
      setShowRejectModal(false);
      setInternalNote('');
      onModified();

      // Refresh drawer detail
      const updated = await fetch(`/api/admin/reviews/${detail.id}`, { credentials: 'include' });
      if (updated.ok) {
        const json = await updated.json();
        setDetail(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveResponse(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !responseBody.trim()) return;
    setBusy(true);
    setError(null);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/reviews/${detail.id}/response`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: responseBody.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || 'Failed to save merchant response.');
      }

      setFeedback('Official Maevelle response saved and published.');
      onModified();

      // Refresh drawer detail
      const updated = await fetch(`/api/admin/reviews/${detail.id}`, { credentials: 'include' });
      if (updated.ok) {
        const json = await updated.json();
        setDetail(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save response');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(reviewId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-0 flex flex-col gap-0 border-l border-border bg-card"
      >
        <SheetHeader className="p-6 border-b border-border bg-muted/20 sticky top-0 z-10 backdrop-blur-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Review Inspection & Moderation
              </span>
              <SheetTitle className="text-lg font-bold text-foreground truncate">
                {detail ? detail.productTitle : 'Review Details'}
              </SheetTitle>
              {detail ? (
                <SheetDescription className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap font-mono">
                  <span>ID: {detail.id.slice(0, 8)}…</span>
                  <span>·</span>
                  <span>Revision #{detail.currentRevision.revisionNumber}</span>
                  <span>·</span>
                  <span>
                    {new Date(detail.currentRevision.submittedAt).toLocaleDateString()}
                  </span>
                </SheetDescription>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        <div className="p-6 space-y-6 flex-1">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">Loading review inspection context…</p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
              <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-destructive space-y-1">
                <p className="font-semibold">Action could not be completed</p>
                <p>{error}</p>
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                {feedback}
              </p>
            </div>
          ) : null}

          {detail && !loading ? (
            <>
              {/* Status & Verification Bar */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/70 bg-muted/10">
                <div className="flex items-center gap-2 flex-wrap">
                  <ReviewModerationBadge status={detail.currentRevision.moderationStatus} />
                  <ReviewVisibilityBadge status={detail.visibilityStatus} />
                  {detail.verifiedPurchase ? <ReviewVerifiedBadge /> : null}
                </div>
                <div className="text-right">
                  <span className="text-amber-500 font-mono text-sm tracking-tight">
                    {'★'.repeat(detail.currentRevision.rating)}
                    <span className="text-muted-foreground/30">
                      {'☆'.repeat(5 - detail.currentRevision.rating)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Customer Feedback Card */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Customer Feedback
                  </span>
                  <h3 className="text-base font-bold text-foreground">
                    {detail.currentRevision.title || 'Untitled Review'}
                  </h3>
                </div>

                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line bg-muted/20 p-3.5 rounded-md border border-border/40">
                  {detail.currentRevision.body || (
                    <span className="italic text-muted-foreground">No written feedback provided.</span>
                  )}
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                  <span>Author: <strong className="text-foreground">{detail.currentRevision.publicDisplayName}</strong></span>
                  <span className="font-mono tabular-nums">
                    Submitted: {new Date(detail.currentRevision.submittedAt).toLocaleString()}
                  </span>
                </div>

                {/* Media Gallery in Detail */}
                {detail.media && detail.media.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-primary" />
                      Attached Customer Media ({detail.media.length})
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {detail.media.map((m, idx) => (
                        <div
                          key={m.assetId}
                          className="relative rounded-lg border border-border overflow-hidden bg-muted/30 aspect-square flex items-center justify-center group"
                        >
                          {m.mediaType === 'VIDEO' ? (
                            <video
                              src={m.url}
                              controls
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block w-full h-full"
                              title="Click to view full image"
                            >
                              <img
                                src={m.thumbnailUrl || m.url}
                                alt={`Customer review attachment ${idx + 1}`}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                loading="lazy"
                              />
                            </a>
                          )}
                          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white select-none">
                            {m.mediaType}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Operational Context: Customer, Order, Product, Returns */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Authoritative Operational Context
                </span>

                {/* Return/Refund Alerts */}
                {detail.order?.hasReturn ? (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>This customer later initiated a Return Case for this order.</span>
                  </div>
                ) : null}

                {detail.order?.hasRefund ? (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>This order line item received a financial refund allocation.</span>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Customer Block */}
                  <div className="p-3 rounded-md bg-muted/20 border border-border/60 space-y-1">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <User className="size-3" /> Customer Profile
                    </span>
                    <Link
                      href={`/customers/${detail.customer.id}`}
                      className="font-semibold text-primary hover:underline block truncate"
                    >
                      {detail.customer.displayName || `Customer #${detail.customer.customerNumber}`}
                    </Link>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      #{detail.customer.customerNumber}
                    </p>
                  </div>

                  {/* Product Block */}
                  <div className="p-3 rounded-md bg-muted/20 border border-border/60 space-y-1">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Package className="size-3" /> Catalog Product
                    </span>
                    <Link
                      href={`/products/${detail.productId}`}
                      className="font-semibold text-primary hover:underline block truncate"
                    >
                      {detail.productTitle}
                    </Link>
                    {detail.purchasedVariant.label ? (
                      <p className="text-[11px] text-muted-foreground truncate">
                        Variant: <strong className="text-foreground">{detail.purchasedVariant.label}</strong>
                      </p>
                    ) : null}
                  </div>

                  {/* Order & Delivery Block */}
                  {detail.order ? (
                    <div className="p-3 rounded-md bg-muted/20 border border-border/60 space-y-1 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Order & Verification</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {detail.order.orderedAt ? new Date(detail.order.orderedAt).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/orders/${detail.order.orderId}`}
                          className="font-mono font-bold text-primary hover:underline"
                        >
                          Order #{detail.order.orderNumber}
                        </Link>
                        {detail.order.deliveryOutcome ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                            {detail.order.deliveryOutcome}
                          </span>
                        ) : null}
                        {detail.order.skuSnapshot ? (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            SKU: {detail.order.skuSnapshot}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-md bg-muted/20 border border-border/60 text-muted-foreground sm:col-span-2">
                      No linked verification order (Direct/Guest submission).
                    </div>
                  )}
                </div>
              </div>

              {/* Revision History & Moderator Audit */}
              {detail.revisions && detail.revisions.length > 1 ? (
                <div className="rounded-lg border border-border bg-card p-5 space-y-3 shadow-2xs">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <History className="size-3.5" /> Revision History ({detail.revisions.length})
                  </span>
                  <div className="space-y-2.5 divide-y divide-border/50">
                    {detail.revisions.map((rev) => (
                      <div key={rev.id} className="pt-2 first:pt-0 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            Revision #{rev.revisionNumber} ({rev.rating}★)
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {new Date(rev.submittedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground line-clamp-1">{rev.body || 'No text'}</p>
                        <div className="flex items-center gap-2 text-[10px]">
                          <ReviewModerationBadge status={rev.moderationStatus} className="text-[10px] py-0 px-2" />
                          {rev.moderationReason ? (
                            <span className="text-muted-foreground">Reason: {rev.moderationReason}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Moderation Controls (Capability Gated) */}
              {canModerate ? (
                <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Moderator Actions
                  </span>

                  {detail.currentRevision.moderationStatus === 'PENDING' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          disabled={busy}
                          type="button"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleModerate('APPROVE')}
                        >
                          <CheckCircle2 className="size-4 mr-1.5" />
                          Approve & Publish
                        </Button>
                        <Button
                          disabled={busy}
                          variant="destructive"
                          type="button"
                          onClick={() => setShowRejectModal(true)}
                        >
                          <ShieldAlert className="size-4 mr-1.5" />
                          Reject Revision
                        </Button>
                      </div>

                      {showRejectModal ? (
                        <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                              <ShieldAlert className="size-4" /> Reject Revision Policy Decision
                            </h4>
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              Invariant REV-INV-025: Negative sentiment is strictly prohibited as a rejection ground. Select an authentic policy violation reason.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground block">
                              Policy Violation Reason
                            </label>
                            <NativeSelect
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                            >
                              {REJECTION_REASONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground block">
                              Internal Moderator Note (Optional)
                            </label>
                            <Textarea
                              value={internalNote}
                              onChange={(e) => setInternalNote(e.target.value)}
                              placeholder="Explanation for internal audit and customer service reference..."
                              rows={2}
                              maxLength={500}
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => setShowRejectModal(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                handleModerate('REJECT', rejectionReason, internalNote)
                              }
                            >
                              Confirm Rejection
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {detail.currentRevision.moderationStatus === 'APPROVED' ? (
                    <div className="flex items-center gap-3">
                      {detail.visibilityStatus === 'VISIBLE' ? (
                        <Button
                          disabled={busy}
                          variant="outline"
                          className="w-full text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Hide this published review from the public Storefront? Audit history will be retained.',
                              )
                            ) {
                              void handleModerate('HIDE');
                            }
                          }}
                        >
                          <EyeOff className="size-3.5 mr-1.5" />
                          Hide from Storefront
                        </Button>
                      ) : (
                        <Button
                          disabled={busy}
                          variant="outline"
                          className="w-full text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => handleModerate('RESTORE')}
                        >
                          <Eye className="size-3.5 mr-1.5" />
                          Restore to Storefront
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Official Merchant Response Section (Capability Gated) */}
              {canRespond ? (
                <form
                  onSubmit={handleSaveResponse}
                  className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="size-3.5 text-primary" />
                      Official Response from Maevelle
                    </span>
                    {detail.merchantResponse ? (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Responded by {detail.merchantResponse.respondedBy}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    This response will appear publicly under the review on the Storefront labeled as <strong className="text-foreground">"Response from Maevelle"</strong>.
                  </p>

                  <div className="space-y-1.5">
                    <Textarea
                      value={responseBody}
                      onChange={(e) => setResponseBody(e.target.value)}
                      placeholder="Thank the customer or address their experience constructively..."
                      required
                      maxLength={3000}
                      rows={3}
                    />
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                      <span>Professional & authentic tone recommended</span>
                      <span>{responseBody.length} / 3000 chars</span>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full text-xs"
                    disabled={busy || !responseBody.trim()}
                  >
                    {detail.merchantResponse ? 'Update Official Response' : 'Publish Official Response'}
                  </Button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
