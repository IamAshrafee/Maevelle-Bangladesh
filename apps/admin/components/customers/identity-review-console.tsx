'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import type { CustomerIdentityLinkDto } from '@maevelle/contracts';
import { fetchApiData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
} from '@/components/ui/page-shell';
import { CrmNav } from './crm-nav';
import { IdentityDecisionDialog } from './identity-decision-dialog';

export function IdentityReviewConsole() {
  const [result, setResult] = useState<{
    items: readonly CustomerIdentityLinkDto[];
    totalItems: number;
  }>();
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setResult(await fetchApiData('/admin/crm/identity-links?status=CANDIDATE&pageSize=100'));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Identity candidates could not be loaded.',
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Customer 360"
        title="Identity review"
        description="Review scoped website, Facebook, and Instagram identity evidence. Unverified candidates never expose customer history."
        actions={
          <RefreshButton onRefresh={() => void load()} tooltip="Refresh identity review" />
        }
      />
      <CrmNav />
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !result ? (
        <LoadingState />
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={Fingerprint}
          title="No identity candidates"
          description="New candidate matches will appear here for an authorized review."
        />
      ) : (
        <PagePanel className="overflow-x-auto p-0">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Channel identity</TableHead>
                <TableHead>Assurance</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">
                      {item.displayName ?? item.username ?? 'Unnamed contact'}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {item.provider} · {item.externalSubjectId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={item.assurance}
                      tone={
                        item.assurance === 'HIGH'
                          ? 'success'
                          : item.assurance === 'MEDIUM'
                            ? 'info'
                            : 'warning'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <p className="max-w-sm text-xs text-muted-foreground">{item.evidenceSummary}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/customers/${item.customerId}`} />}
                      nativeButton={false}
                    >
                      Review profile
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <IdentityDecisionDialog
                        link={item}
                        decision="REJECTED"
                        onCompleted={() => void load()}
                      />
                      <IdentityDecisionDialog
                        link={item}
                        decision="LINKED"
                        onCompleted={() => void load()}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PagePanel>
      )}
    </AdminPage>
  );
}
