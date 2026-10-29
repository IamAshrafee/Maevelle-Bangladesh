'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
} from '@/components/ui/page-shell';
import { fetchApiData } from '@/lib/api';
import { CrmNav } from './crm-nav';

type PrivacyRequest = {
  id: string;
  customerId: string;
  customerNumber: string;
  displayName: string;
  requestType: string;
  status: string;
  reason: string;
  resolutionNotes: string | null;
  dueAt: string | null;
  createdAt: string;
  version: number;
};
const decisions = [
  'IDENTITY_VERIFICATION_REQUIRED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
function PrivacyDecision({ item, onUpdated }: { item: PrivacyRequest; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<(typeof decisions)[number]>('IN_PROGRESS');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notes.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await fetchApiData(`/admin/crm/privacy-requests/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: item.version,
          status,
          resolutionNotes: notes.trim(),
        }),
      });
      setOpen(false);
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Process</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Process {item.requestType.toLowerCase()} request</DialogTitle>
          <DialogDescription>
            Verify the requester outside this form before exporting, correcting, or anonymizing
            data. Closing this work item does not silently mutate immutable commerce records.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`privacy-status-${item.id}`}>Status</Label>
            <NativeSelect
              id={`privacy-status-${item.id}`}
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              {decisions.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`privacy-notes-${item.id}`}>Resolution notes</Label>
            <Textarea
              id={`privacy-notes-${item.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !notes.trim()}>
              {busy ? 'Saving…' : 'Save status'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PrivacyExport({ item }: { item: PrivacyRequest }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('Verified data-subject request fulfillment');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await fetchApiData<{ fileName: string; bundle: Record<string, unknown> }>(
        `/admin/crm/privacy-requests/${item.id}/export`,
        { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) },
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.bundle, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Customer data could not be exported.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Download className="size-4" /> Export
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export customer-owned data</DialogTitle>
          <DialogDescription>
            This audited export includes the customer&apos;s profile, contact data, commerce
            records, consents, linked identities, and non-internal conversation messages. It
            excludes staff notes, risk controls, audit events, and provider secrets.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor={`privacy-export-reason-${item.id}`}>Auditable reason</Label>
            <Textarea
              id={`privacy-export-reason-${item.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy ? 'Preparing…' : 'Download JSON'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PrivacyRequestsConsole() {
  const [data, setData] = useState<{ items: readonly PrivacyRequest[] }>();
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setData(await fetchApiData('/admin/crm/privacy-requests?pageSize=100'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Privacy requests could not be loaded.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Customer 360"
        title="Privacy requests"
        description="Identity-verified access, export, correction, restriction, and anonymization work with immutable audit evidence."
        actions={
          <RefreshButton onRefresh={() => void load()} tooltip="Refresh privacy requests" />
        }
      />
      <CrmNav />
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <LoadingState />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No privacy requests"
          description="Customer data-rights requests will appear here for authorized processing."
        />
      ) : (
        <PagePanel className="overflow-x-auto p-0">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/customers/${item.customerId}`}
                    >
                      {item.displayName}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{item.customerNumber}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.requestType} tone="info" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>
                    <p className="max-w-sm text-xs text-muted-foreground">{item.reason}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {item.dueAt ? new Date(item.dueAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {item.status === 'IN_PROGRESS' &&
                      ['ACCESS', 'EXPORT'].includes(item.requestType) ? (
                        <PrivacyExport item={item} />
                      ) : null}
                      {['COMPLETED', 'REJECTED', 'CANCELLED'].includes(item.status) ? (
                        <span className="self-center text-xs text-muted-foreground">Closed</span>
                      ) : (
                        <PrivacyDecision item={item} onUpdated={() => void load()} />
                      )}
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
