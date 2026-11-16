'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CommerceMeasurementReportDto } from '@maevelle/contracts';
import { useAdminContext } from '@/components/admin-capabilities';
import { NativeSelect } from '@/components/ui/native-select';
import { ErrorState, PagePanel } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchApiData, ApiRequestError } from '@/lib/api';
import { CommerceTables } from './commerce-tables';

export function CommerceView(props: {
  from: string;
  to: string;
  currency: string;
  refreshVersion: number;
}) {
  const context = useAdminContext();
  if (
    !['analytics.view', 'analytics.financial.view'].every((cap) =>
      context.capabilities.includes(cap),
    )
  )
    return (
      <ErrorState
        title="Financial analytics access required"
        message="Both analytics and financial analytics permissions are required for this report."
      />
    );
  return (
    <AuthorizedCommerceView
      key={`${context.actorId}:${context.organizationId}`}
      {...props}
      organizationId={context.organizationId}
    />
  );
}
function AuthorizedCommerceView({
  from,
  to,
  currency,
  refreshVersion,
  organizationId,
}: {
  from: string;
  to: string;
  currency: string;
  refreshVersion: number;
  organizationId: string;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    query = useSearchParams();
  const traffic = query.get('trafficClass') ?? 'BUSINESS';
  const valid = ['BUSINESS', 'SYNTHETIC', 'UNCLASSIFIED'].includes(traffic);
  const [retry, setRetry] = useState(0);
  const path = `/admin/analytics/commerce?${new URLSearchParams({ from, to, ...(currency ? { currency } : {}), trafficClass: traffic })}`;
  const key = `${organizationId}:${path}:${refreshVersion}:${retry}`;
  const [result, setResult] = useState<{
    key: string;
    data?: CommerceMeasurementReportDto;
    error?: string;
  }>();
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    void fetchApiData<CommerceMeasurementReportDto>(path, {
      signal: controller.signal,
      headers: { 'x-organization-id': organizationId },
    })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              error instanceof ApiRequestError && [403, 422, 400].includes(error.status)
                ? error.message
                : 'Commerce reporting could not be loaded.',
          });
      });
    return () => controller.abort();
  }, [key, path, organizationId, valid]);
  const current = result?.key === key ? result : undefined;
  const select = (value: string) => {
    const next = new URLSearchParams(query.toString());
    next.set('trafficClass', value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="min-w-0 space-y-6">
      <PagePanel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Commerce integrity</h2>
          <label className="grid gap-1 text-sm">
            Traffic class
            <NativeSelect
              aria-label="Commerce traffic class"
              value={valid ? traffic : 'BUSINESS'}
              onChange={(event) => select(event.target.value)}
            >
              <option value="BUSINESS">Business</option>
              <option value="SYNTHETIC">Synthetic test activity</option>
              <option value="UNCLASSIFIED">Unclassified activity</option>
            </NativeSelect>
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          Orders, verified funds, COD collections and completed refunds are separate facts. Finance
          owns recognized revenue.
        </p>
        {traffic !== 'BUSINESS' ? (
          <p
            role="status"
            className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
          >
            {traffic === 'SYNTHETIC' ? 'Synthetic test activity' : 'Unclassified activity'} — this
            selection is not actual business performance.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Business excludes synthetic and unclassified activity.
          </p>
        )}
        <p className="text-sm">
          Global Checkout conversion rate: unavailable. Purchasing availability and a complete
          denominator are not established.
        </p>
        <p className="text-sm text-muted-foreground">
          GA4, Meta and advanced matching are disabled. Dates use UTC.
        </p>
      </PagePanel>
      {!valid ? (
        <ErrorState title="Unsupported traffic class" message="Choose a supported traffic class." />
      ) : !current ? (
        <div className="space-y-4">
          <Skeleton className="h-4 w-48" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl border border-border bg-card p-4 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
          <div className="h-64 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      ) : current.error ? (
        <ErrorState
          title="Commerce report unavailable"
          message={current.error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      ) : current.data ? (
        <>
          <p className="text-xs text-muted-foreground">{current.data.coverage}</p>
          <CommerceTables data={current.data} />
        </>
      ) : null}
    </div>
  );
}
