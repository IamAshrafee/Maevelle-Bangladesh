'use client';

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, UserCheck, Users, UserX } from 'lucide-react';
import type { CrmAnalyticsDto } from '@maevelle/contracts';
import { fetchApiData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  AdminPage,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CrmNav } from './crm-nav';

export function CrmAnalyticsConsole() {
  const [data, setData] = useState<CrmAnalyticsDto | null>(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lifecycle, setLifecycle] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [filters, setFilters] = useState({ from: '', to: '', lifecycle: 'ALL', source: 'ALL' });
  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
      if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
      if (filters.lifecycle !== 'ALL') params.set('lifecycleStage', filters.lifecycle);
      if (filters.source !== 'ALL') params.set('source', filters.source);
      setData(
        await fetchApiData<CrmAnalyticsDto>(
          `/admin/crm/analytics${params.size ? `?${params.toString()}` : ''}`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'CRM analytics could not be loaded.');
    }
  }, [filters]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Customer 360"
        title="CRM analytics"
        description="Identity coverage, lifecycle distribution, relationship workload, and profile data quality from authoritative records."
        actions={
          <RefreshButton onRefresh={() => void load()} tooltip="Refresh CRM analytics" />
        }
      />
      <CrmNav />
      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ from, to, lifecycle, source });
        }}
      >
        <div>
          <Label htmlFor="analytics-from">Customer created from</Label>
          <Input
            id="analytics-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="analytics-to">Customer created through</Label>
          <Input
            id="analytics-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="analytics-lifecycle">Lifecycle</Label>
          <NativeSelect
            id="analytics-lifecycle"
            value={lifecycle}
            onChange={(event) => setLifecycle(event.target.value)}
          >
            {[
              'ALL',
              'NEW_CONTACT',
              'PROSPECT',
              'ENGAGED_PROSPECT',
              'FIRST_TIME_BUYER',
              'REPEAT_CUSTOMER',
              'LOYAL_CUSTOMER',
              'INACTIVE_CUSTOMER',
              'RE_ENGAGED_CUSTOMER',
            ].map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value === 'ALL' ? 'All lifecycle stages' : value.replaceAll('_', ' ')}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="analytics-source">Source</Label>
          <NativeSelect
            id="analytics-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            {[
              'ALL',
              'STOREFRONT',
              'MANUAL_ORDER',
              'FACEBOOK',
              'INSTAGRAM',
              'WHATSAPP',
              'PHONE',
              'IMPORT',
              'ADMIN_CREATED',
              'EXTERNAL_API',
            ].map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value === 'ALL' ? 'All sources' : value.replaceAll('_', ' ')}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">Apply</Button>
      </form>
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <LoadingState message="Loading CRM analytics…" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Customer profiles', value: data.totalCustomers, icon: Users },
              { label: 'Verified customers', value: data.verifiedCustomers, icon: UserCheck },
              {
                label: 'Identity coverage',
                value: `${data.identityCoveragePercent}%`,
                icon: Fingerprint,
              },
              { label: 'Unlinked contacts', value: data.unlinkedChannelContacts, icon: UserX },
            ].map(({ label, value, icon: MetricIcon }) => (
              <PagePanel key={label} className="shadow-2xs">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <MetricIcon className="size-4 text-primary" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">
                  {String(value)}
                </p>
              </PagePanel>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'First-time buyers', value: data.commerce.firstTimeBuyers },
              { label: 'Repeat buyers', value: data.commerce.repeatBuyers },
              { label: 'Repeat buyer rate', value: `${data.commerce.repeatBuyerRatePercent}%` },
              {
                label: 'Average completed orders / buyer',
                value: data.commerce.averageCompletedOrdersPerBuyer,
              },
              {
                label: 'Completed BDT revenue',
                value: formatBdt(data.commerce.completedRevenueBdt),
              },
              { label: 'Completed refunds', value: formatBdt(data.commerce.completedRefundsBdt) },
              {
                label: 'Net completed revenue',
                value: formatBdt(data.commerce.netCompletedRevenueBdt),
              },
              {
                label: 'Average order value',
                value: formatBdt(data.commerce.averageOrderValueBdt),
              },
            ].map(({ label, value }) => (
              <PagePanel key={label} className="shadow-2xs">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-3 font-mono text-xl font-semibold tabular-nums">{String(value)}</p>
              </PagePanel>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <PageSection title="Lifecycle distribution">
              <PagePanel className="space-y-3">
                {data.lifecycleDistribution.map((item) => (
                  <div
                    key={item.stage}
                    className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-sm">{item.stage.replaceAll('_', ' ').toLowerCase()}</span>
                    <span className="font-mono text-sm tabular-nums">{item.count}</span>
                  </div>
                ))}
              </PagePanel>
            </PageSection>
            <PageSection title="Data quality">
              <PagePanel className="space-y-3">
                {[
                  ['Missing phone and email', data.dataQuality.missingContactCount],
                  ['Contact present but unverified', data.dataQuality.unverifiedContactCount],
                  ['No relationship owner', data.dataQuality.profilesWithoutOwnerCount],
                  ['Open duplicate candidates', data.openDuplicateCandidates],
                  ['Overdue follow-ups', data.overdueFollowUps],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-sm">{String(label)}</span>
                    <span className="font-mono text-sm tabular-nums">{String(value)}</span>
                  </div>
                ))}
              </PagePanel>
            </PageSection>
          </div>
          <PageSection
            title="12-month acquisition cohorts"
            description="Customers are grouped by profile creation month. Converted means at least one completed order; repeat means at least two completed orders as of now."
          >
            <PagePanel className="overflow-x-auto p-0">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Acquisition month</TableHead>
                    <TableHead className="text-right">New profiles</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right">Repeat buyers</TableHead>
                    <TableHead className="text-right">Conversion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.acquisitionCohorts.map((cohort) => (
                    <TableRow key={cohort.month}>
                      <TableCell className="font-mono tabular-nums">{cohort.month}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {cohort.newCustomers}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {cohort.customersWithCompletedOrders}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {cohort.repeatBuyers}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {cohort.newCustomers
                          ? Math.round(
                              (cohort.customersWithCompletedOrders / cohort.newCustomers) * 100,
                            )
                          : 0}
                        %
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </PagePanel>
          </PageSection>
          <p className="text-xs text-muted-foreground">
            Commerce metrics use completed BDT orders only. Net completed revenue subtracts
            completed BDT refunds. First-time and repeat buyer counts are mutually exclusive based
            on completed-order count.
          </p>
        </>
      )}
    </AdminPage>
  );
}

function formatBdt(value: string): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 2,
  }).format(Number(value));
}
