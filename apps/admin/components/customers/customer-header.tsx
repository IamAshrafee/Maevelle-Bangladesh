'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Check, Copy, ExternalLink, GitMerge, ShoppingBag } from 'lucide-react';
import type { CustomerDetailDto } from '@maevelle/contracts';

import { PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Badge } from '@/components/ui/badge';
import { useAdminCapability } from '@/components/admin-capabilities';
import { CustomerStatusBadge } from './customer-status-badge';
import { CustomerRestrictionBadge } from './customer-restriction-badge';
import { EditCustomerDialog } from './edit-customer-dialog';
import { AddNoteDialog } from './add-note-dialog';
import { ManageTagsDialog } from './manage-tags-dialog';
import { ApplyRestrictionDialog } from './apply-restriction-dialog';
import { AnonymizeCustomerDialog } from './anonymize-customer-dialog';
import { CustomerDuplicateMergeDialog } from './customer-duplicate-merge-dialog';

interface CustomerHeaderProps {
  readonly customer: CustomerDetailDto;
  readonly isRefreshing?: boolean;
  readonly onRefresh: () => void;
  readonly duplicateCount?: number;
}

export function CustomerHeader({
  customer,
  isRefreshing,
  onRefresh,
  duplicateCount = 0,
}: CustomerHeaderProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const canManage = useAdminCapability('customers.manage');
  const canRestrict = useAdminCapability('customers.restrict');
  const canMerge = useAdminCapability('customers.merge');
  const canAnonymize = useAdminCapability('customers.anonymize');

  const isMerged = customer.status === 'MERGED';
  const isAnonymized = customer.status === 'ANONYMIZED';
  const isReadOnly = isMerged || isAnonymized;

  const activeRestrictions = customer.restrictions.filter(
    (r) => r.status === 'ACTIVE' && (!r.expiresAt || new Date(r.expiresAt) > new Date()),
  );

  function copyCustomerNumber() {
    void navigator.clipboard.writeText(customer.customerNumber);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="space-y-4">
      {isMerged && customer.canonicalCustomerId ? (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <GitMerge className="size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <p>
              This customer record was merged and is now an alias. All future orders and contacts
              resolve to the canonical customer.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 bg-card hover:bg-amber-100 text-amber-950 dark:text-amber-200 dark:hover:bg-amber-900/40 shrink-0"
            render={<Link href={`/customers/${customer.canonicalCustomerId}`} />}
            nativeButton={false}
          >
            Open Canonical Customer <ExternalLink className="ml-1 size-3" />
          </Button>
        </div>
      ) : null}

      <PageHeader
        breadcrumbs={[
          { label: 'Customers', href: '/customers' },
          { label: customer.displayName, current: true },
        ]}
        eyebrow="Customer 360 & CRM"
        title={customer.displayName}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <CustomerStatusBadge status={customer.status} />
            <button
              type="button"
              onClick={copyCustomerNumber}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-muted/40 px-2 py-0.5 text-xs font-mono font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Click to copy Customer Number"
            >
              <span>{customer.customerNumber}</span>
              {copiedCode ? (
                <Check className="size-3 text-success" />
              ) : (
                <Copy className="size-3 opacity-60" />
              )}
            </button>
            <Badge variant="secondary" className="text-[11px] font-normal uppercase tracking-wider">
              Source: {customer.latestSource?.replaceAll('_', ' ') ?? 'Direct'}
            </Badge>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton
              loading={isRefreshing}
              onRefresh={onRefresh}
              tooltip="Refresh customer details"
            />
            {!isReadOnly && (
              <Button
                size="sm"
                className="h-9 font-medium"
                render={<Link href={`/orders/new?customerId=${customer.id}`} />}
                nativeButton={false}
              >
                <ShoppingBag className="mr-1.5 size-3.5" aria-hidden="true" />
                Create Order
              </Button>
            )}
            {!isReadOnly && canManage && (
              <EditCustomerDialog customer={customer} onUpdated={onRefresh} />
            )}
            {!isReadOnly && canManage && (
              <AddNoteDialog customerId={customer.id} onAdded={onRefresh} />
            )}
            {!isReadOnly && canManage && (
              <ManageTagsDialog
                customerId={customer.id}
                assignedTags={customer.tags}
                onUpdated={onRefresh}
              />
            )}
            {!isReadOnly && canRestrict && (
              <ApplyRestrictionDialog customerId={customer.id} onApplied={onRefresh} />
            )}
            {!isReadOnly && canMerge && (
              <CustomerDuplicateMergeDialog
                customer={customer}
                duplicateCount={duplicateCount}
                onMerged={onRefresh}
              />
            )}
            {!isReadOnly && canAnonymize && (
              <AnonymizeCustomerDialog customer={customer} onCompleted={onRefresh} />
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5" aria-hidden="true" />
            Customer since{' '}
            {new Intl.DateTimeFormat('en-BD', { dateStyle: 'long' }).format(
              new Date(customer.createdAt),
            )}
          </span>
          {activeRestrictions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-destructive">Commercial Restrictions:</span>
              {activeRestrictions.map((restriction) => (
                <CustomerRestrictionBadge
                  key={restriction.id}
                  restrictionType={restriction.restrictionType}
                  className="text-[10px] py-0 px-1.5"
                />
              ))}
            </div>
          ) : null}
        </div>
      </PageHeader>
    </div>
  );
}
