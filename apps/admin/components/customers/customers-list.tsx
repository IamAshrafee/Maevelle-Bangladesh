'use client';

import { CircleAlert, RefreshCw, Search, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';

import type { CustomerSummaryDto, PaginatedEnvelope } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchApiData } from '@/lib/api';

export function CustomersList() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const [query, setQuery] = useState(searchParameters.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const [customers, setCustomers] = useState<PaginatedEnvelope<CustomerSummaryDto>>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const page = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'ALL' || (key === 'page' && value === '1')) next.delete(key);
      else next.set(key, value);
    }
    router.replace(next.size ? `/customers?${next.toString()}` : '/customers', { scroll: false });
  }

  useEffect(() => {
    const current = searchParameters.get('q') ?? '';
    if (current !== deferredQuery) replaceQuery({ q: deferredQuery || undefined, page: '1' });
  }, [deferredQuery]);

  async function load(signal?: AbortSignal) {
    setState('loading');
    const parameters = new URLSearchParams({
      page: String(page),
      pageSize: '25',
    });
    if (deferredQuery) parameters.set('q', deferredQuery);
    
    try {
      const data = await fetchApiData<PaginatedEnvelope<CustomerSummaryDto>>(
        `/admin/customers?${parameters.toString()}`,
        signal ? { signal } : undefined,
      );
      setCustomers(data);
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Customers could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [deferredQuery, page]);

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <nav className="mb-2 text-xs font-medium text-muted-foreground" aria-label="Breadcrumb">
            Commerce <span aria-hidden="true">/</span> Customers
          </nav>
          <h1 className="text-balance text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
            Manage your customer base, view their purchase history, and update contact information.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={state === 'loading'} onClick={() => void load()}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
          <Button render={<Link href="/customers/new" />} nativeButton={false}>
            <UserPlus aria-hidden="true" /> Create Customer
          </Button>
        </div>
      </header>

      {message ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-tight">{message}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-sm flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search by name, email, or phone..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 size-8 opacity-20" aria-hidden="true" />
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              customers?.items.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/customers/${customer.id}`)}
                >
                  <TableCell className="font-medium">
                    {customer.displayName}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {customer.email ? (
                        <span className="text-sm">{customer.email}</span>
                      ) : null}
                      {customer.phone ? (
                        <span className="text-xs text-muted-foreground">{customer.phone}</span>
                      ) : null}
                      {!customer.email && !customer.phone ? (
                        <span className="text-xs italic text-muted-foreground">No contact info</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(new Date(customer.createdAt))}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={customer.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {customers && customers.totalCount > 25 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium">{(page - 1) * 25 + 1}</span> to{' '}
            <span className="font-medium">
              {Math.min(page * 25, customers.totalCount)}
            </span>{' '}
            of <span className="font-medium">{customers.totalCount}</span> results
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => replaceQuery({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= customers.totalCount}
              onClick={() => replaceQuery({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
