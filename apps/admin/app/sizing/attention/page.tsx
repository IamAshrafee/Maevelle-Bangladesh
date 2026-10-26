'use client';

import type { SizingAttentionItemDto } from '@maevelle/contracts';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
} from '@/components/ui/page-shell';
import { fetchSizingAttention } from '@/lib/sizing/api';

const PAGE_SIZE = 20;

export default function SizingAttentionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const [items, setItems] = useState<readonly SizingAttentionItemDto[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchSizingAttention({ page, pageSize: PAGE_SIZE });
      setItems(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sizing attention items.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(nextPage));
    router.push(`/sizing/attention?${params.toString()}`);
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Fit & Sizing"
        title="Needs Attention"
        description="Resolve specific customer-facing sizing problems. Each item explains the consequence and opens the exact place to fix it."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
        }
      />

      {loading ? <LoadingState message="Finding sizing work that needs a decision…" /> : null}
      {!loading && error ? (
        <ErrorState
          title="Could not load sizing work"
          message={error}
          onRetry={() => void load()}
        />
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No sizing work needs attention"
          description="Published guides, Category defaults, Product outcomes, and supplier evidence are currently consistent."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <PagePanel key={item.id} className="p-4 shadow-none">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${item.severity === 'BLOCKING' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}
                  >
                    <AlertTriangle aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">{item.resourceLabel}</h2>
                      <StatusBadge
                        status={item.issueType}
                        tone={item.severity === 'BLOCKING' ? 'danger' : 'warning'}
                      />
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {item.consequence}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.resourceType.toLowerCase()} · Updated{' '}
                      <span className="font-mono tabular-nums">
                        {new Date(item.updatedAt).toLocaleString()}
                      </span>
                    </p>
                  </div>
                </div>
                <Button variant="outline" render={<Link href={item.actionHref} />}>
                  {item.actionLabel} <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </PagePanel>
          ))}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <p className="text-sm text-muted-foreground">
                Page <span className="font-mono tabular-nums">{page}</span> of{' '}
                <span className="font-mono tabular-nums">{totalPages}</span>
              </p>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </AdminPage>
  );
}
