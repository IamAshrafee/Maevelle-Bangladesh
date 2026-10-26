'use client';

import { ArrowRight, CheckCircle2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ProductGuideAssignmentPreviewDto,
  ProductSizingDto,
  SizeGuideSummaryDto,
} from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
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
  applyProductGuideAssignment,
  fetchSizeGuides,
  previewProductGuideAssignment,
} from '@/lib/sizing/api';

type Outcome = 'INHERIT' | 'DIRECT' | 'NONE';

function sourceLabel(
  source: ProductGuideAssignmentPreviewDto['current']['effectiveSource'],
): string {
  if (source === 'PRODUCT') return 'Direct Product guide';
  if (source === 'CATEGORY') return 'Primary Category guide';
  return 'No customer guide';
}

export function ProductGuideAssignmentDialog({
  open,
  productId,
  sizing,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  productId: string;
  sizing: ProductSizingDto | undefined;
  onOpenChange: (open: boolean) => void;
  onApplied: () => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<Outcome>('INHERIT');
  const [guideId, setGuideId] = useState('');
  const [reason, setReason] = useState('');
  const [guides, setGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [preview, setPreview] = useState<ProductGuideAssignmentPreviewDto>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setOutcome(
      sizing?.guideOutcome === 'DIRECT' || sizing?.guideOutcome === 'NONE'
        ? sizing.guideOutcome
        : 'INHERIT',
    );
    setGuideId(sizing?.sizeGuideId ?? '');
    setReason(sizing?.noGuideReason ?? '');
    setPreview(undefined);
    setError('');
    void fetchSizeGuides({ status: 'ACTIVE', publication: 'PUBLISHED', pageSize: 100 })
      .then((result) => setGuides(result.items.filter((guide) => guide.hasPublishedRevision)))
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : 'Published guides could not be loaded.',
        ),
      );
  }, [open, sizing]);

  async function review() {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await previewProductGuideAssignment(productId, {
          outcome,
          ...(outcome === 'DIRECT' ? { sizeGuideId: guideId } : {}),
          ...(outcome === 'NONE' ? { noGuideReason: reason.trim() } : {}),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The guide change could not be reviewed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await applyProductGuideAssignment(productId, preview.previewToken);
      await onApplied();
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The reviewed guide change could not be applied.',
      );
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 top-0 left-0 max-h-none max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[85vh] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>
            {preview ? 'Review customer guide change' : 'Change customer guide'}
          </DialogTitle>
          <DialogDescription>
            {preview
              ? 'Confirm the Storefront source and Product-size impact before applying.'
              : 'Choose whether this Product inherits, uses its own guide, or intentionally shows no guide.'}
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="space-y-4">
            <div className="grid items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <p className="text-xs text-muted-foreground">Current</p>
                <p className="mt-1 font-medium">
                  {preview.current.guideName ?? sourceLabel(preview.current.effectiveSource)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sourceLabel(preview.current.effectiveSource)}
                </p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">After change</p>
                <p className="mt-1 font-medium">
                  {preview.next.guideName ??
                    (preview.next.outcome === 'NONE' ? 'No customer guide' : 'No Category guide')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {preview.next.outcome === 'DIRECT'
                    ? 'Direct Product guide'
                    : preview.next.outcome === 'INHERIT'
                      ? 'Primary Category inheritance'
                      : preview.next.noGuideReason}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Product sizes', preview.productSizeCount],
                ['Matched', preview.matchedSizeCount],
                ['Conflicts', preview.conflictCount],
              ].map(([label, value]) => (
                <div className="rounded-lg border border-border p-3" key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <p
              className={`flex gap-2 rounded-lg border p-3 text-sm ${preview.conflictCount ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/30 bg-success/10 text-success'}`}
            >
              {preview.conflictCount ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              )}
              {preview.conflictCount
                ? 'Some purchasable sizes do not match a guide row. The assignment will remain visible in Needs Attention.'
                : 'The guide and Product sizes are reconciled.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-guide-source">Guide source</Label>
              <NativeSelect
                id="product-guide-source"
                className="w-full"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value as Outcome)}
              >
                <NativeSelectOption value="INHERIT">Use primary Category guide</NativeSelectOption>
                <NativeSelectOption value="DIRECT">
                  Choose a guide for this Product
                </NativeSelectOption>
                <NativeSelectOption value="NONE">Intentionally show no guide</NativeSelectOption>
              </NativeSelect>
              {outcome === 'INHERIT' ? (
                <p className="text-xs text-muted-foreground">
                  Current Category fallback:{' '}
                  {sizing?.categoryDefaultGuideName ?? 'no published guide'}.
                </p>
              ) : null}
            </div>
            {outcome === 'DIRECT' ? (
              <div className="space-y-1.5">
                <Label htmlFor="product-guide">Published guide</Label>
                <NativeSelect
                  id="product-guide"
                  className="w-full"
                  value={guideId}
                  onChange={(event) => setGuideId(event.target.value)}
                >
                  <NativeSelectOption value="">Select a guide</NativeSelectOption>
                  {guides.map((guide) => (
                    <NativeSelectOption key={guide.id} value={guide.id}>
                      {guide.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
            {outcome === 'NONE' ? (
              <div className="space-y-1.5">
                <Label htmlFor="no-guide-reason">Reason</Label>
                <Textarea
                  id="no-guide-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="For example: this Product is not worn and sizing does not apply."
                />
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          {preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(undefined)} disabled={busy}>
                Back
              </Button>
              <Button onClick={() => void apply()} disabled={busy}>
                {busy ? 'Applying…' : 'Apply reviewed change'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={() => void review()}
                disabled={
                  busy ||
                  (outcome === 'DIRECT' && !guideId) ||
                  (outcome === 'NONE' && !reason.trim())
                }
              >
                {busy ? 'Reviewing…' : 'Review impact'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
