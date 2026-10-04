'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Database, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAdminCapability } from '@/components/admin-capabilities';

export function RebuildSummaryDialog() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [integrityIssues, setIntegrityIssues] = useState<readonly string[] | null>(null);
  const [rebuildResult, setRebuildResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRunIntegrity = useAdminCapability('reviews.integrity');

  if (!canRunIntegrity) return null;

  async function checkIntegrity() {
    setLoading(true);
    setError(null);
    setIntegrityIssues(null);
    try {
      const res = await fetch('/api/admin/reviews/integrity', { credentials: 'include' });
      if (!res.ok) throw new Error('Integrity check failed.');
      const json = await res.json();
      setIntegrityIssues(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error running integrity check');
    } finally {
      setLoading(false);
    }
  }

  async function rebuildSummary(e: React.FormEvent) {
    e.preventDefault();
    if (!productId.trim()) return;
    setLoading(true);
    setError(null);
    setRebuildResult(null);

    try {
      const res = await fetch(
        `/api/admin/reviews/products/${encodeURIComponent(productId.trim())}/rebuild-rating-summary`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || 'Failed to rebuild rating summary.');
      }
      const json = await res.json();
      setRebuildResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuild rating summary.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            <Wrench className="size-3.5 text-muted-foreground" />
            Integrity & Repair
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Database className="size-5 text-primary" />
            Reviews Integrity & Projections
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Verify reviews consistency and rebuild product rating summary projections from authoritative published review records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Diagnostic section */}
          <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Domain Integrity Audit</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={loading}
                onClick={() => void checkIntegrity()}
              >
                <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
                Run Audit
              </Button>
            </div>
            {integrityIssues !== null ? (
              integrityIssues.length === 0 ? (
                <p className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 pt-1">
                  <ShieldCheck className="size-4" /> All reviews and aggregates are 100% healthy.
                </p>
              ) : (
                <div className="space-y-1 text-destructive pt-1">
                  <p className="font-semibold">Detected {integrityIssues.length} issue(s):</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {integrityIssues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : (
              <p className="text-muted-foreground">
                Audit inspects for orphaned review revisions, uncalculated rating aggregates, or missing tokens.
              </p>
            )}
          </div>

          {/* Rebuild Form */}
          <form onSubmit={rebuildSummary} className="space-y-3 pt-2 border-t border-border">
            <div className="space-y-1">
              <label htmlFor="rebuild-product-id" className="font-semibold text-foreground block">
                Rebuild Product Rating Projection
              </label>
              <p className="text-muted-foreground">
                Recalculates average rating, review count, and star distribution directly from active published reviews.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Input
                  id="rebuild-product-id"
                  placeholder="Enter Product UUID"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="font-mono text-xs"
                  required
                />
                <Button type="submit" size="sm" disabled={loading || !productId.trim()}>
                  Rebuild
                </Button>
              </div>
            </div>

            {rebuildResult ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="size-4" /> Rating summary projection rebuilt successfully!
                </div>
                <div className="font-mono text-[11px] grid grid-cols-2 gap-1 pt-1">
                  <span>Average Rating: {rebuildResult.averageRating}★</span>
                  <span>Review Count: {rebuildResult.reviewCount}</span>
                  <span>Verified Count: {rebuildResult.verifiedCount ?? 0}</span>
                </div>
              </div>
            ) : null}
          </form>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
