'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { CustomerSummaryDto } from '@maevelle/contracts';
import { fetchApiData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  PageHeader,
  PagePanel,
} from '@/components/ui/page-shell';
import { TableSkeletonRows } from '@/components/ui/table-skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UsersRound } from 'lucide-react';
import { formatWholeTaka } from '@/lib/format/numbers';
export function SegmentMembersConsole({ segmentId }: { segmentId: string }) {
  const [data, setData] = useState<{
    items: readonly CustomerSummaryDto[];
    totalItems: number;
    explanation: readonly string[];
  }>();
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setData(await fetchApiData(`/admin/crm/segments/${segmentId}/members?pageSize=100`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Segment members could not be loaded.');
    }
  }, [segmentId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AdminPage variant="wide">
      <PageHeader
        eyebrow="Customer 360"
        title="Segment members"
        description="A paginated, explainable view of the customers included by this segment."
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={() => void load()} tooltip="Refresh segment members" />
            <Button
              variant="outline"
              render={<Link href="/customers/segments" />}
              nativeButton={false}
            >
              Back to segments
            </Button>
          </div>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <PagePanel className="overflow-x-auto p-0" aria-busy="true">
          <Table density="compact" stickyHeader>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Purchase value</TableHead>
                <TableHead>Last ordered</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableSkeletonRows
                columns={5}
                rows={5}
                columnWidths={['w-40', 'w-20', 'w-28', 'w-28', 'w-16 ml-auto']}
              />
            </TableBody>
          </Table>
        </PagePanel>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No segment members"
          description="No customers currently satisfy this segment definition."
        />
      ) : (
        <PagePanel className="overflow-x-auto p-0">
          <Table density="compact" stickyHeader>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Purchase value</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.displayName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{item.customerNumber}</p>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{item.orderCount ?? 0}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatWholeTaka(item.totalSpend ?? 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/customers/${item.id}`} />}
                      nativeButton={false}
                    >
                      Open
                    </Button>
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
