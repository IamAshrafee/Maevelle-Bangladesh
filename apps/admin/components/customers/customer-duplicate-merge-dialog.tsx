'use client';

import { useEffect, useState, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  GitMerge,
  Loader2,
  Search,
  ShieldAlert,
  UsersRound,
  XCircle,
} from 'lucide-react';
import type {
  CustomerDetailDto,
  CustomerDuplicateCandidateDto,
  CustomerMergePreviewDto,
  CustomerSummaryDto,
  PaginatedEnvelope,
} from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { fetchApiData } from '@/lib/api';

interface CustomerDuplicateMergeDialogProps {
  readonly customer: CustomerDetailDto;
  readonly duplicateCount?: number;
  readonly onMerged?: () => void;
}

export function CustomerDuplicateMergeDialog({
  customer,
  duplicateCount = 0,
  onMerged,
}: CustomerDuplicateMergeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'select' | 'preview'>('select');

  // Search & Candidates
  const [candidates, setCandidates] = useState<readonly CustomerDuplicateCandidateDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery.trim());
  const [searchResults, setSearchResults] = useState<readonly CustomerSummaryDto[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<CustomerSummaryDto | null>(null);

  // Merge Preview State
  const [preview, setPreview] = useState<CustomerMergePreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Execution
  const [reason, setReason] = useState('');
  const [confirmedSafe, setConfirmedSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [executeError, setExecuteError] = useState('');

  // Fetch Duplicate Candidates when dialog opens
  useEffect(() => {
    if (!open) return;
    setStep('select');
    setSelectedTarget(null);
    setPreview(null);
    setConfirmedSafe(false);
    setReason('');
    setExecuteError('');

    void fetchApiData<readonly CustomerDuplicateCandidateDto[]>(
      `/admin/customers/${customer.id}/duplicate-candidates`,
    )
      .then((items) => {
        setCandidates(items ?? []);
      })
      .catch(() => {
        // Silently ignore candidate fetch failure
      });
  }, [open, customer.id]);

  // Search for target customer
  useEffect(() => {
    if (!open || deferredQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    void fetchApiData<PaginatedEnvelope<CustomerSummaryDto>>(
      `/admin/customers?q=${encodeURIComponent(deferredQuery)}&pageSize=10`,
      { signal: controller.signal },
    )
      .then((result) => {
        setSearchResults(
          result.items.filter(
            (c) =>
              c.id !== customer.id && c.status !== 'MERGED' && c.status !== 'ANONYMIZED',
          ),
        );
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSearchResults([]);
        }
      });
    return () => controller.abort();
  }, [deferredQuery, customer.id, open]);

  // Load preview when target is picked
  async function loadMergePreview(target: CustomerSummaryDto) {
    setSelectedTarget(target);
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const data = await fetchApiData<CustomerMergePreviewDto>(
        `/admin/customers/${customer.id}/merge-preview?targetCustomerId=${encodeURIComponent(target.id)}`,
      );
      setPreview(data);
      setStep('preview');
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Could not generate merge preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

  // Execute Merge
  async function handleExecuteMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTarget || !reason.trim() || !confirmedSafe || busy) return;
    setBusy(true);
    setExecuteError('');

    try {
      const merged = await fetchApiData<CustomerDetailDto>(
        `/admin/customers/${customer.id}/merge`,
        {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            sourceExpectedVersion: customer.version,
            targetCustomerId: selectedTarget.id,
            targetExpectedVersion: selectedTarget.version,
            reason: reason.trim(),
          }),
        },
      );
      setOpen(false);
      onMerged?.();
      router.push(`/customers/${merged.id}`);
      router.refresh();
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Merge failed to execute.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-9 gap-1.5" />}>
        <GitMerge className="size-3.5" aria-hidden="true" />
        Merge Customer
        {duplicateCount > 0 && (
          <Badge variant="destructive" className="ml-1 size-4 rounded-full p-0 text-[10px] flex items-center justify-center">
            {duplicateCount}
          </Badge>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="size-5 text-primary" aria-hidden="true" />
            {step === 'select' ? 'Select Customer to Merge Into' : 'Review & Confirm Customer Merge'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select'
              ? 'Choose which customer identity will survive as the canonical profile. This profile will become an alias.'
              : 'Carefully inspect what historical records will transfer into the surviving canonical profile.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <div className="space-y-5 py-2">
            {/* Detected Candidates Section */}
            {candidates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
                  <span>Detected Duplicate Candidates ({candidates.length}):</span>
                </div>
                <div className="divide-y rounded-lg border bg-amber-50/20">
                  {candidates.map((cand) => (
                    <div
                      key={cand.customerId}
                      className="flex items-center justify-between p-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {cand.displayName ?? 'Customer'}
                          </span>
                          <span className="font-mono text-muted-foreground text-[11px]">
                            {cand.customerNumber}
                          </span>
                          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-[10px] text-amber-900">
                            {Math.round(Number(cand.confidence) * 100)}% Match
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-muted-foreground text-[11px]">
                          {cand.primaryPhone && <span>Phone: {cand.primaryPhone}</span>}
                          {cand.primaryEmail && <span>Email: {cand.primaryEmail}</span>}
                          <span>Orders: {cand.orderCount ?? 0}</span>
                          <span className="font-medium text-amber-800">
                            Signal: {cand.signals.join(' + ')}
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs shrink-0"
                        disabled={previewLoading}
                        onClick={() =>
                          void loadMergePreview({
                            id: cand.customerId,
                            customerNumber: cand.customerNumber ?? '',
                            displayName: cand.displayName ?? 'Customer',
                            status: (cand.status as CustomerSummaryDto['status']) ?? 'ACTIVE',
                            version: 1,
                            firstSource: 'ADMIN_CREATED',
                            latestSource: 'ADMIN_CREATED',
                            primaryPhone: cand.primaryPhone ?? null,
                            primaryEmail: cand.primaryEmail ?? null,
                            orderCount: cand.orderCount ?? 0,
                            totalSpend: '0',
                            createdAt: new Date().toISOString(),
                          })
                        }
                      >
                        Select as Target
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Search Section */}
            <div className="space-y-2">
              <Label htmlFor="search-target">Or Search Any Customer in Organization</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="search-target"
                  className="pl-9"
                  placeholder="Search by name, phone, email, or customer code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {previewError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                  {previewError}
                </div>
              )}

              {deferredQuery.length >= 2 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                  {searchResults.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">
                      No eligible customer found matching &quot;{deferredQuery}&quot;.
                    </p>
                  ) : (
                    searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="flex items-center justify-between p-3 text-xs hover:bg-muted/30"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {result.displayName}
                            </span>
                            <span className="font-mono text-muted-foreground text-[11px]">
                              {result.customerNumber}
                            </span>
                          </div>
                          <div className="mt-0.5 text-muted-foreground text-[11px] flex gap-3">
                            <span>Phone: {result.primaryPhone ?? 'None'}</span>
                            <span>Email: {result.primaryEmail ?? 'None'}</span>
                            <span>Orders: {result.orderCount ?? 0}</span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={previewLoading}
                          onClick={() => void loadMergePreview(result)}
                        >
                          Select
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : preview ? (
          <form onSubmit={handleExecuteMerge} className="space-y-5 py-2">
            {executeError && (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
                <CircleAlert className="size-4 shrink-0 mt-0.5" />
                <p>{executeError}</p>
              </div>
            )}

            {/* Side by Side Comparison */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Left: Surviving Target */}
              <div className="rounded-lg border-2 border-emerald-500/50 bg-emerald-50/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="border-emerald-400 bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                    SURVIVING MASTER (Keep)
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {preview.targetCustomer.customerNumber}
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">
                  {preview.targetCustomer.displayName}
                </p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Primary Phone: {preview.targetCustomer.primaryPhone ?? 'None'}</p>
                  <p>Primary Email: {preview.targetCustomer.primaryEmail ?? 'None'}</p>
                  <p>Existing Orders: {preview.targetCustomer.orderCount ?? 0}</p>
                  <p>
                    Account Linked:{' '}
                    {preview.summary.targetHasAccount ? 'Yes (Auth User)' : 'No'}
                  </p>
                </div>
              </div>

              {/* Right: Source Merging */}
              <div className="rounded-lg border-2 border-amber-500/40 bg-amber-50/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-800 text-[10px] font-semibold">
                    MERGING (Becomes Alias)
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {preview.sourceCustomer.customerNumber}
                  </span>
                </div>
                <p className="text-base font-bold text-foreground">
                  {preview.sourceCustomer.displayName}
                </p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Primary Phone: {preview.sourceCustomer.primaryPhone ?? 'None'}</p>
                  <p>Primary Email: {preview.sourceCustomer.primaryEmail ?? 'None'}</p>
                  <p>Orders Moving: {preview.summary.ordersToMove}</p>
                  <p>
                    Account Linked:{' '}
                    {preview.summary.sourceHasAccount ? 'Yes (Auth User)' : 'No'}
                  </p>
                </div>
              </div>
            </div>

            {/* Transfer Summary Metrics */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
              <span className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Merge Transfer Impact
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded border bg-background p-2">
                  <span className="text-muted-foreground">Orders Moving</span>
                  <p className="text-sm font-bold text-foreground">{preview.summary.ordersToMove}</p>
                </div>
                <div className="rounded border bg-background p-2">
                  <span className="text-muted-foreground">Phones Added</span>
                  <p className="text-sm font-bold text-foreground">
                    +{preview.summary.phonesToCombine}
                    {preview.summary.duplicatePhones > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({preview.summary.duplicatePhones} exact match)
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded border bg-background p-2">
                  <span className="text-muted-foreground">Addresses Moved</span>
                  <p className="text-sm font-bold text-foreground">{preview.summary.addressesToMove}</p>
                </div>
                <div className="rounded border bg-background p-2">
                  <span className="text-muted-foreground">Restrictions Transferred</span>
                  <p className="text-sm font-bold text-rose-700">{preview.summary.restrictionsToTransfer}</p>
                </div>
              </div>
            </div>

            {/* Blocking Conflicts */}
            {!preview.canMerge && preview.blockingConflicts.length > 0 && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-800">
                  <XCircle className="size-4 shrink-0" />
                  <span>Cannot Merge These Records (Blocking Conflict):</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.blockingConflicts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Advisory Warnings:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reason & Confirmation */}
            {preview.canMerge && (
              <div className="space-y-3 border-t pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="merge-reason-input" className="text-xs">
                    Merge Reason *
                  </Label>
                  <Textarea
                    id="merge-reason-input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why these duplicate records represent the same individual (e.g. Same phone number and address observed across multiple guest orders)."
                    required
                    rows={2}
                  />
                </div>

                <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
                  <input
                    type="checkbox"
                    id="merge-confirm-check"
                    checked={confirmedSafe}
                    onChange={(e) => setConfirmedSafe(e.target.checked)}
                    className="size-4 mt-0.5 rounded border-input"
                    required
                  />
                  <Label htmlFor="merge-confirm-check" className="text-xs font-normal leading-relaxed">
                    I understand that this action unifies customer history, transfers all orders,
                    addresses, and contacts, and renders profile{' '}
                    <span className="font-semibold">{customer.customerNumber}</span> a permanent alias.
                    This operation is authoritative and irreversible.
                  </Label>
                </div>
              </div>
            )}

            <DialogFooter className="flex justify-between items-center w-full gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('select')}
                disabled={busy}
              >
                Back to Selection
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={
                  !preview.canMerge || !reason.trim() || !confirmedSafe || busy
                }
                className="bg-primary hover:bg-primary/90 font-semibold"
              >
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Confirm & Merge into {preview.targetCustomer.displayName}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
