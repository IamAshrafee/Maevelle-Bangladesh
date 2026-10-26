'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { GitCompareArrows, RefreshCw } from 'lucide-react';
import { fetchApiData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
} from '@/components/ui/page-shell';
import { CrmNav } from './crm-nav';

type Candidate = {
  id: string;
  confidence: string;
  signals: readonly string[];
  createdAt: string;
  customerA: { id: string; customerNumber: string; displayName: string };
  customerB: { id: string; customerNumber: string; displayName: string };
};
type MergeHistory = {
  id: string;
  sourceCustomer: { id: string; customerNumber: string; displayName: string };
  targetCustomer: { id: string; customerNumber: string; displayName: string };
  reason: string | null;
  createdAt: string;
};
export function DuplicateReviewConsole() {
  const [items, setItems] = useState<readonly Candidate[]>();
  const [history, setHistory] = useState<readonly MergeHistory[]>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const [candidates, merges] = await Promise.all([
        fetchApiData<{ items: readonly Candidate[] }>('/admin/crm/duplicates?pageSize=100'),
        fetchApiData<{ items: readonly MergeHistory[] }>('/admin/crm/merges?pageSize=25'),
      ]);
      setItems(candidates.items);
      setHistory(merges.items);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Duplicate review data could not be loaded.',
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function dismiss() {
    if (!selected || !reason.trim()) return;
    setSaving(true);
    setError('');
    try {
      await fetchApiData(`/admin/crm/duplicates/${selected.id}/dismissal`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setSelected(null);
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Candidate could not be dismissed.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Customer 360"
        title="Duplicate review center"
        description="Compare explainable identity signals before merging. No candidate is merged automatically."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />
      <CrmNav />
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !items || !history ? (
        <LoadingState />
      ) : (
        <>
          <section aria-labelledby="open-duplicates">
            <h2 id="open-duplicates" className="mb-3 text-lg font-semibold">
              Open candidates
            </h2>
            {items.length === 0 ? (
              <EmptyState
                icon={GitCompareArrows}
                title="No open duplicate candidates"
                description="Conservative checkout matching will create review candidates when evidence is ambiguous."
              />
            ) : (
              <div className="grid gap-4">
                {items.map((item) => (
                  <PagePanel key={item.id}>
                    <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
                      <div>
                        <p className="font-semibold">{item.customerA.displayName}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.customerA.customerNumber}
                        </p>
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          render={<Link href={`/customers/${item.customerA.id}`} />}
                          nativeButton={false}
                        >
                          Open profile
                        </Button>
                      </div>
                      <div className="flex items-center justify-center">
                        <GitCompareArrows className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{item.customerB.displayName}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.customerB.customerNumber}
                        </p>
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          render={<Link href={`/customers/${item.customerB.id}`} />}
                          nativeButton={false}
                        >
                          Open profile
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-medium">
                          Evidence: {item.signals.join(', ') || 'No strong evidence recorded'}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          Confidence {Number(item.confidence) * 100}%
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setSelected(item)}>
                        Not a duplicate
                      </Button>
                    </div>
                  </PagePanel>
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="merge-history">
            <h2 id="merge-history" className="mb-3 mt-8 text-lg font-semibold">
              Merge history
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No customer profiles have been merged.
              </p>
            ) : (
              <div className="grid gap-3">
                {history.map((item) => (
                  <PagePanel key={item.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">
                          {item.sourceCustomer.displayName}{' '}
                          <span className="text-muted-foreground">merged into</span>{' '}
                          {item.targetCustomer.displayName}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.sourceCustomer.customerNumber} →{' '}
                          {item.targetCustomer.customerNumber}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.reason || 'No reason recorded'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          render={<Link href={`/customers/${item.sourceCustomer.id}`} />}
                          nativeButton={false}
                        >
                          Source
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          render={<Link href={`/customers/${item.targetCustomer.id}`} />}
                          nativeButton={false}
                        >
                          Canonical
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 font-mono text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </PagePanel>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss duplicate candidate</DialogTitle>
            <DialogDescription>
              Record why these profiles represent different customers. The evidence remains
              auditable.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: verified as different family members sharing a phone number"
            rows={4}
          />
          <DialogFooter showCloseButton>
            <Button disabled={saving || !reason.trim()} onClick={() => void dismiss()}>
              {saving ? 'Saving…' : 'Dismiss candidate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
