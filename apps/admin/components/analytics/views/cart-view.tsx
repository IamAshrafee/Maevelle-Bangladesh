'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  cartAnalyticsTimezone,
  type CartAnalyticsDto,
  type CartInteractionName,
} from '@maevelle/contracts';
import { MetricCard } from '@/components/analytics/analytics-kpi-card';
import { NativeSelect } from '@/components/ui/native-select';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { ApiRequestError, fetchApiData } from '@/lib/api';
import { CartActivityTable, CartValueTable, formatCartCount } from './cart-activity-tables';

const CartTrend = dynamic(() => import('./cart-trend').then((module) => module.CartTrend), {
  loading: () => <LoadingState message="Loading chart…" />,
});

const observationLabels: Record<CartInteractionName, { title: string; description: string }> = {
  CART_VIEWED: {
    title: 'Bag views',
    description: 'Visible episodes of the drawer, Bag page or merge review.',
  },
  CART_COMMAND_INITIATED: {
    title: 'Submitted attempts',
    description: 'First submissions of Bag actions.',
  },
  CART_COMMAND_REJECTED: {
    title: 'Definitive rejections',
    description: 'Observed rejections with a definitive response.',
  },
  CART_RECOVERY_VIEWED: {
    title: 'Recovery shown',
    description: 'Episodes when recovery controls appeared.',
  },
};

const dateTime = new Intl.DateTimeFormat('en-BD', {
  timeZone: cartAnalyticsTimezone,
  dateStyle: 'medium',
  timeStyle: 'short',
});
function RecordedRange({ first, last }: { first: string | null; last: string | null }) {
  if (!first || !last) return null;
  return (
    <p className="text-xs text-muted-foreground">
      First and last records in this selection{' '}
      <span className="font-mono tabular-nums">
        {dateTime.format(new Date(first))} to {dateTime.format(new Date(last))}
      </span>
    </p>
  );
}

type Result = { key: string } & ({ data: CartAnalyticsDto } | { error: unknown });

export function CartView({
  from,
  to,
  organizationId,
  refreshVersion,
}: {
  from: string;
  to: string;
  organizationId: string;
  refreshVersion: number;
}) {
  const [currency, setCurrency] = useState('');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result>();
  const params = new URLSearchParams({ from, to, ...(currency ? { currency } : {}) });
  const path = `/admin/analytics/cart?${params}`;
  const key = `${path}:${refreshVersion}:${retry}`;

  useEffect(() => {
    const request = new AbortController();
    void fetchApiData<CartAnalyticsDto>(path, {
      signal: request.signal,
      headers: { 'x-organization-id': organizationId },
    }).then(
      (data) => {
        if (!request.signal.aborted) setResult({ key, data });
      },
      (error: unknown) => {
        if (!request.signal.aborted) setResult({ key, error });
      },
    );
    return () => request.abort();
  }, [key, organizationId, path]);

  const current = result?.key === key ? result : undefined;
  const data = current && 'data' in current ? current.data : undefined;
  const currencies = result && 'data' in result ? result.data.committed.currencies : [];
  const { committed, observations } = data ?? {};
  const hasObservations = observations?.counts.some(({ count }) => count !== '0');

  return (
    <PageSection className="space-y-5">
      <PagePanel className="space-y-2">
        <h2 className="text-lg font-semibold">Cart Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Dates are inclusive in Dhaka time. Older Cart events were never backfilled. Coverage
          depends on instrumentation and processing. A quiet period does not establish abandonment.
        </p>
        {data && (
          <p className="text-xs text-muted-foreground">
            Report generated{' '}
            <span className="font-mono tabular-nums">
              {dateTime.format(new Date(data.generatedAt))}
            </span>
          </p>
        )}
      </PagePanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Committed Cart activity</h3>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Committed currency
          <NativeSelect value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="">All currencies</option>
            {[...new Set([...currencies, ...(currency ? [currency] : [])])].sort().map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      {!current && <LoadingState message="Loading Cart Analytics…" />}
      {current && 'error' in current && (
        <ErrorState
          title="Cart Analytics unavailable"
          message={
            current.error instanceof ApiRequestError && [403, 422].includes(current.error.status)
              ? current.error.message
              : 'The report could not be loaded.'
          }
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      {committed && observations && (
        <>
          <RecordedRange first={committed.firstRecordedAt} last={committed.lastRecordedAt} />
          {(committed.pending !== '0' || committed.failed !== '0') && (
            <div
              role="status"
              className="rounded-lg border border-border bg-warning/10 p-3 text-sm"
            >
              Committed totals are partial. In this date range across all currencies,{' '}
              <span className="font-mono tabular-nums">{formatCartCount(committed.pending)}</span>{' '}
              changes await processing and{' '}
              <span className="font-mono tabular-nums">{formatCartCount(committed.failed)}</span>{' '}
              could not be projected.
            </div>
          )}
          {committed.mutations === '0' ? (
            <EmptyState
              title="No projected Cart changes"
              description="Try another date range or currency. Recent changes can take time to appear."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  title="Committed changes"
                  value={formatCartCount(committed.mutations)}
                  description="One per changed Cart revision."
                />
                <MetricCard
                  title="Distinct active Carts"
                  value={formatCartCount(committed.distinctCarts)}
                  description="Carts with at least one recorded change."
                />
                <MetricCard
                  title="Net unit change"
                  value={formatCartCount(committed.netUnitChange)}
                  description="Units after minus before each change. Merges include units carried over from guest Bags."
                />
              </div>
              <CartTrend
                title="Daily committed changes"
                from={from}
                to={to}
                rows={committed.trend}
              />
              <CartActivityTable rows={committed.breakdown} />
              <CartValueTable values={committed.values} />
            </>
          )}

          <div className="space-y-2 border-t border-border pt-5">
            <h3 className="text-base font-semibold">Consented browser observations</h3>
            <p className="text-sm text-muted-foreground">
              Counts reflect reported interactions from browsers that allowed analytics. This stream
              has no currency or shopper key. Its counts cannot be used to calculate conversion or
              abandonment.
            </p>
            <RecordedRange
              first={observations.firstRecordedAt}
              last={observations.lastRecordedAt}
            />
          </div>
          {hasObservations ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {observations.counts.map(({ name, count }) => (
                  <MetricCard
                    key={name}
                    {...observationLabels[name]}
                    value={formatCartCount(count)}
                  />
                ))}
              </div>
              <CartTrend
                title="Daily observed Bag views"
                from={from}
                to={to}
                rows={observations.viewsTrend}
              />
            </>
          ) : (
            <EmptyState
              title="No consented observations recorded"
              description="Activity without analytics consent is outside this measurement."
            />
          )}
        </>
      )}
    </PageSection>
  );
}
