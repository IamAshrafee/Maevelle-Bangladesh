'use client';

import { CircleAlert, Loader2, Search, ShieldX, UsersRound } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { CustomerDetailDto, CustomerSummaryDto, PaginatedEnvelope } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

function ErrorMessage({ message }: { readonly message: string }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function MergeCustomerDialog({ customer }: { readonly customer: CustomerDetailDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [candidates, setCandidates] = useState<readonly CustomerSummaryDto[]>([]);
  const [selected, setSelected] = useState<CustomerSummaryDto>();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || deferredQuery.length < 2) {
      setCandidates([]);
      return;
    }
    const controller = new AbortController();
    void fetchApiData<PaginatedEnvelope<CustomerSummaryDto>>(
      `/admin/customers?q=${encodeURIComponent(deferredQuery)}&pageSize=10`,
      { signal: controller.signal },
    )
      .then((result) =>
        setCandidates(
          result.items.filter(
            (candidate) =>
              candidate.id !== customer.id &&
              candidate.status !== 'MERGED' &&
              candidate.status !== 'ANONYMIZED',
          ),
        ),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setMessage(error instanceof Error ? error.message : 'Customer search failed.');
      });
    return () => controller.abort();
  }, [customer.id, deferredQuery, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const merged = await fetchApiData<CustomerDetailDto>(
        `/admin/customers/${customer.id}/merge`,
        {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            sourceExpectedVersion: customer.version,
            targetCustomerId: selected.id,
            targetExpectedVersion: selected.version,
            reason,
          }),
        },
      );
      setOpen(false);
      router.push(`/customers/${merged.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customers could not be merged.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UsersRound aria-hidden="true" /> Merge
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Merge duplicate customer</DialogTitle>
          <DialogDescription>
            This profile becomes a historical alias. Contacts, addresses, notes, tags, and commerce
            history will resolve through the customer you select.
          </DialogDescription>
        </DialogHeader>
        <ErrorMessage message={message} />
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="merge-customer-search">Canonical customer</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                id="merge-customer-search"
                className="pl-9"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(undefined);
                }}
                placeholder="Search by name, phone, or email"
                autoComplete="off"
              />
            </div>
            {deferredQuery.length >= 2 ? (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {candidates.length ? (
                  candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`flex min-h-12 w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted ${selected?.id === candidate.id ? 'bg-muted' : ''}`}
                      onClick={() => setSelected(candidate)}
                    >
                      <span>
                        <span className="block font-medium">{candidate.displayName}</span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.primaryPhone ??
                            candidate.primaryEmail ??
                            candidate.customerNumber}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {candidate.customerNumber}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    No eligible customers found.
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="merge-reason">Reason</Label>
            <Textarea
              id="merge-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why these records belong to the same customer"
              maxLength={1000}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selected || !reason.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Merge into selected customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnonymizeCustomerDialog({
  customer,
  onCompleted,
}: {
  readonly customer: CustomerDetailDto;
  readonly onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [reasonCode, setReasonCode] = useState('CUSTOMER_REQUEST');
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== customer.customerNumber || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/customers/${customer.id}/anonymize`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: customer.version,
          reasonCode,
          reasonText: reasonText.trim() || undefined,
        }),
      });
      setOpen(false);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer could not be anonymized.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>
        <ShieldX aria-hidden="true" /> Anonymize
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anonymize customer data</DialogTitle>
          <DialogDescription>
            Current profile contacts, saved addresses, notes, and tags will be removed. Immutable
            order snapshots remain for operational and accounting history. Active orders, returns,
            or refunds block this action.
          </DialogDescription>
        </DialogHeader>
        <ErrorMessage message={message} />
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="anonymize-reason">Reason</Label>
            <select
              id="anonymize-reason"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              <option value="CUSTOMER_REQUEST">Customer request</option>
              <option value="RETENTION_POLICY">Retention policy</option>
              <option value="DATA_CORRECTION">Data correction</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="anonymize-notes">Internal explanation</Label>
            <Textarea
              id="anonymize-notes"
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              maxLength={1000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anonymize-confirmation">
              Type {customer.customerNumber} to confirm
            </Label>
            <Input
              id="anonymize-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={confirmation !== customer.customerNumber || busy}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Permanently anonymize
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerIdentityActions({
  customer,
  onCompleted,
}: {
  readonly customer: CustomerDetailDto;
  readonly onCompleted: () => void;
}) {
  if (customer.status === 'MERGED' || customer.status === 'ANONYMIZED') return null;
  return (
    <>
      <MergeCustomerDialog customer={customer} />
      <AnonymizeCustomerDialog customer={customer} onCompleted={onCompleted} />
    </>
  );
}
