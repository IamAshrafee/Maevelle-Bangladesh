'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CustomerDetailDto, CustomerDuplicateCandidateDto } from '@maevelle/contracts';

import { AdminPage, ErrorState, PageSkeleton } from '@/components/ui/page-shell';
import { DetailWorkspace } from '@/components/workspaces/detail-workspace';
import { fetchApiData } from '@/lib/api';
import { CustomerHeader } from './customer-header';
import { CustomerMetricsStrip } from './customer-metrics-strip';
import { CustomerOrdersSection } from './customer-orders-section';
import { CustomerTimelineSection } from './customer-timeline-section';
import { CustomerCommunicationSection } from './customer-communication-section';
import { CustomerContactSection } from './customer-contact-section';
import { CustomerAddressesSection } from './customer-addresses-section';
import {
  CustomerDeliveryRiskCard,
  type CustomerDeliveryHistoryData,
} from './customer-delivery-risk-card';
import { CustomerRestrictionsCard } from './customer-restrictions-card';
import { CustomerAccountCard } from './customer-account-card';
import { CustomerTagsCard } from './customer-tags-card';
import { CustomerNotesCard } from './customer-notes-card';
import { CustomerDuplicateMergeDialog } from './customer-duplicate-merge-dialog';
import { CustomerCrmCard } from './customer-crm-card';

interface CustomerDetailConsoleProps {
  readonly customerId: string;
}

export function CustomerDetailConsole({ customerId }: CustomerDetailConsoleProps) {
  const [customer, setCustomer] = useState<CustomerDetailDto | null>(null);
  const [deliveryHistory, setDeliveryHistory] = useState<CustomerDeliveryHistoryData | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    readonly CustomerDuplicateCandidateDto[]
  >([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setState('loading');
      else setIsRefreshing(true);
      setMessage('');

      try {
        const [customerData, historyData, duplicatesData] = await Promise.all([
          fetchApiData<CustomerDetailDto>(`/admin/customers/${customerId}`),
          fetchApiData<CustomerDeliveryHistoryData>(
            `/admin/customers/${customerId}/delivery-history`,
          ).catch(() => null),
          fetchApiData<readonly CustomerDuplicateCandidateDto[]>(
            `/admin/customers/${customerId}/duplicate-candidates`,
          ).catch(() => []),
        ]);

        setCustomer(customerData);
        setDeliveryHistory(historyData);
        setDuplicateCandidates(duplicatesData);
        setState('ready');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Customer could not be loaded.');
        setState('error');
      } finally {
        setIsRefreshing(false);
      }
    },
    [customerId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return <PageSkeleton variant="detail" widthVariant="wide" />;
  }

  if (state === 'error' || !customer) {
    return (
      <AdminPage variant="wide">
        <ErrorState
          title="Failed to Load Customer"
          message={message || 'Customer profile was not found.'}
          onRetry={() => void load()}
        />
      </AdminPage>
    );
  }

  const isReadOnly = customer.status === 'MERGED' || customer.status === 'ANONYMIZED';
  const primarySearchPhone =
    customer.phones.find((p) => p.isPrimary)?.phone ??
    customer.phones[0]?.phone ??
    customer.displayName;

  return (
    <DetailWorkspace
      widthVariant="wide"
      header={
        <>
          <CustomerHeader
            customer={customer}
            isRefreshing={isRefreshing}
            onRefresh={() => void load(true)}
            duplicateCount={duplicateCandidates.length}
          />
          {!isReadOnly && duplicateCandidates.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-300/80 bg-amber-500/10 p-4 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <p>
                  <span className="font-semibold">
                    {duplicateCandidates.length} potential duplicate customer record(s) detected
                  </span>{' '}
                  sharing verified phone numbers or email addresses.
                </p>
              </div>
              <CustomerDuplicateMergeDialog
                customer={customer}
                duplicateCount={duplicateCandidates.length}
                onMerged={() => void load(true)}
              />
            </div>
          )}
        </>
      }
      kpiStrip={<CustomerMetricsStrip customer={customer} />}
      primary={
        <>
          {/* Order & Return History */}
          <CustomerOrdersSection customerId={customer.id} isReadOnly={isReadOnly} />

          {/* Unified Customer Activity Timeline */}
          <CustomerTimelineSection customerId={customer.id} />

          {/* Unified Communications Log */}
          <CustomerCommunicationSection customerId={customer.id} />
        </>
      }
      rail={
        <>
          <CustomerCrmCard
            customerId={customer.id}
            customerVersion={customer.version}
            isReadOnly={isReadOnly}
            onUpdated={() => void load(true)}
          />

          {/* Delivery & RTO Intelligence */}
          <CustomerDeliveryRiskCard
            history={deliveryHistory}
            customerSearchTerm={primarySearchPhone}
          />

          {/* Commercial Restrictions */}
          <CustomerRestrictionsCard
            customerId={customer.id}
            restrictions={customer.restrictions}
            isReadOnly={isReadOnly}
            onUpdated={() => void load(true)}
          />

          {/* Contacts (Multi-Phone & Multi-Email) */}
          <CustomerContactSection
            customerId={customer.id}
            phones={customer.phones}
            emails={customer.emails}
            isReadOnly={isReadOnly}
            onUpdated={() => void load(true)}
          />

          {/* Addresses */}
          <CustomerAddressesSection
            customerId={customer.id}
            addresses={customer.addresses}
            isReadOnly={isReadOnly}
            onUpdated={() => void load(true)}
          />

          {/* Future User Account Link */}
          <CustomerAccountCard
            customerId={customer.id}
            account={customer.account}
            isReadOnly={isReadOnly}
            onUpdated={() => void load(true)}
          />

          {/* Tags */}
          <CustomerTagsCard
            customerId={customer.id}
            tags={customer.tags}
            isReadOnly={isReadOnly}
            onUpdated={() => void load(true)}
          />

          {/* Internal Notes */}
          <CustomerNotesCard
            customerId={customer.id}
            notes={customer.notes}
            isReadOnly={isReadOnly}
            onUpdated={() => void load(true)}
          />
        </>
      }
    />
  );
}
