'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Ruler } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  SizeGuideSummaryDto,
  SupplyPurchaseSizingDecisionDto,
  SupplyPurchaseSizingReviewDto,
} from '@maevelle/contracts';

import { OperationalFeedback } from '@/components/operational-worklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchSizeGuides,
  fetchSupplyPurchaseSizingReview,
  setSupplyPurchaseSizingDecision,
} from '@/lib/sizing/api';

type ProductReview = SupplyPurchaseSizingReviewDto['products'][number];

function decisionLabel(decision: SupplyPurchaseSizingDecisionDto): string {
  if (decision === 'APPLIED_TO_PRODUCT') return 'Applied to Product';
  if (decision === 'EVIDENCE_ONLY') return 'Recorded as evidence';
  if (decision === 'KEEP_CURRENT') return 'Current guide kept';
  return 'Needs review';
}

function ProductSizingEvidence({
  purchaseId,
  product,
  guides,
  disabled,
  onSaved,
}: {
  purchaseId: string;
  product: ProductReview;
  guides: readonly SizeGuideSummaryDto[];
  disabled: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const [guideId, setGuideId] = useState(product.proposedGuideId ?? product.currentGuideId ?? '');
  const [notes, setNotes] = useState(product.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewingApplication, setReviewingApplication] = useState(false);

  async function save(decision: 'KEEP_CURRENT' | 'EVIDENCE_ONLY' | 'APPLIED_TO_PRODUCT') {
    if (decision !== 'KEEP_CURRENT' && !guideId) {
      setError('Select the supplier-provided guide before recording this decision.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setSupplyPurchaseSizingDecision(purchaseId, {
        productId: product.productId,
        decision,
        ...(guideId ? { sizeGuideId: guideId } : {}),
        notes: notes.trim() || null,
        ...(product.version === null ? {} : { expectedVersion: product.version }),
      });
      await onSaved(
        decision === 'APPLIED_TO_PRODUCT'
          ? `${product.productTitle} now uses the reviewed supplier guide.`
          : decision === 'EVIDENCE_ONLY'
            ? `Supplier sizing evidence saved for ${product.productTitle}.`
            : `The current guide was kept for ${product.productTitle}.`,
      );
      setReviewingApplication(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The sizing decision could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={product.conflict ? 'border-warning/50' : 'border-border'}>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">
            <Link href={`/products/${product.productId}`} className="hover:underline">
              {product.productTitle}
            </Link>
          </CardTitle>
          <CardDescription>
            {product.variantLineCount} purchased variant line
            {product.variantLineCount === 1 ? '' : 's'} · Current outcome:{' '}
            {product.currentGuideName ?? 'no effective customer guide'}
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {product.conflict ? (
            <Badge variant="outline" className="border-warning/50 text-warning">
              <AlertTriangle className="size-3" /> Conflict
            </Badge>
          ) : null}
          <Badge variant={product.decision === 'PENDING' ? 'secondary' : 'outline'}>
            {decisionLabel(product.decision)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor={`supplier-guide-${product.productId}`}>Supplier-provided guide</Label>
            <NativeSelect
              id={`supplier-guide-${product.productId}`}
              value={guideId}
              onChange={(event) => setGuideId(event.target.value)}
              disabled={disabled || busy}
            >
              <NativeSelectOption value="">Select a published guide</NativeSelectOption>
              {guides.map((guide) => (
                <NativeSelectOption key={guide.id} value={guide.id}>
                  {guide.name} · {guide.sizingDomainName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`supplier-sizing-notes-${product.productId}`}>Review note</Label>
            <Textarea
              id={`supplier-sizing-notes-${product.productId}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What did the supplier confirm or change?"
              className="min-h-9"
              disabled={disabled || busy}
            />
          </div>
        </div>

        {error ? <OperationalFeedback tone="danger">{error}</OperationalFeedback> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => void save('KEEP_CURRENT')}
          >
            Keep current guide
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || busy || !guideId}
            onClick={() => void save('EVIDENCE_ONLY')}
          >
            Record evidence only
          </Button>
          <Button
            size="sm"
            disabled={disabled || busy || !guideId}
            onClick={() => {
              if (!guideId) {
                setError('Select the supplier-provided guide before applying it.');
                return;
              }
              setReviewingApplication(true);
            }}
          >
            Apply to Product
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Recording evidence keeps Product behavior unchanged. Applying makes this a direct Product
          assignment and preserves this purchase as its source.
        </p>
        <Dialog open={reviewingApplication} onOpenChange={setReviewingApplication}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Review supplier guide application</DialogTitle>
              <DialogDescription>
                This changes the Product&apos;s customer guide. The purchase remains recorded as the
                assignment source.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Product</p>
                <p className="font-medium">{product.productTitle}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Current Storefront guide</p>
                  <p className="font-medium">{product.currentGuideName ?? 'No customer guide'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">After application</p>
                  <p className="font-medium">
                    {guides.find((guide) => guide.id === guideId)?.name ?? 'Selected guide'}
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground">
                Customers will see the selected published guide as a direct Product assignment.
                Primary Category inheritance will remain available as a fallback if this assignment
                is later removed.
              </p>
            </div>
            {error ? <OperationalFeedback tone="danger">{error}</OperationalFeedback> : null}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReviewingApplication(false)}
                disabled={busy}
              >
                Back
              </Button>
              <Button onClick={() => void save('APPLIED_TO_PRODUCT')} disabled={busy}>
                {busy ? 'Applying…' : 'Apply reviewed guide'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function PurchaseSizingReview({
  purchaseId,
  canReview,
}: {
  purchaseId: string;
  canReview: boolean;
}) {
  const [review, setReview] = useState<SupplyPurchaseSizingReviewDto>();
  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [nextReview, guideResult] = await Promise.all([
        fetchSupplyPurchaseSizingReview(purchaseId),
        fetchSizeGuides({ status: 'ACTIVE', pageSize: 100 }),
      ]);
      setReview(nextReview);
      setGuides(guideResult.items.filter((guide) => guide.hasPublishedRevision));
      setMessage('');
      setState('ready');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Sizing evidence could not be loaded.');
      setState('error');
    }
  }, [purchaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaved(nextMessage: string) {
    setSuccess(nextMessage);
    await load();
  }

  if (state === 'loading' && !review) {
    return <div className="h-48 animate-pulse rounded-xl border border-border bg-muted/50" />;
  }

  if (!review) {
    return (
      <OperationalFeedback tone="danger">
        {message || 'Sizing evidence could not be loaded.'}
      </OperationalFeedback>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="purchase-sizing-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="purchase-sizing-heading"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Ruler className="size-5 text-primary" aria-hidden="true" />
            Supplier sizing evidence
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review one customer-guide outcome per Product, even when the purchase contains several
            variants. Nothing changes on the Storefront until you explicitly apply a guide.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/sizing/guides" />}>
          Manage guide library
        </Button>
      </div>

      {!canReview ? (
        <OperationalFeedback tone="danger">
          You can view this evidence, but your role cannot record sizing decisions.
        </OperationalFeedback>
      ) : null}
      {message && state === 'error' ? (
        <OperationalFeedback tone="danger">{message}</OperationalFeedback>
      ) : null}
      {success ? (
        <OperationalFeedback>
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="size-4" /> {success}
          </span>
        </OperationalFeedback>
      ) : null}

      {review.products.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Add Product variants to this purchase before reviewing supplier sizing evidence.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {review.products.map((product) => (
            <ProductSizingEvidence
              key={`${product.productId}:${product.version ?? 'new'}:${product.decision}`}
              purchaseId={purchaseId}
              product={product}
              guides={guides}
              disabled={!canReview}
              onSaved={handleSaved}
            />
          ))}
        </div>
      )}
    </section>
  );
}
