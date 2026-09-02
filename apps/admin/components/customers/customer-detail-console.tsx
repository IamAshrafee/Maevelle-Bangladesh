'use client';

import { Mail, MapPin, Phone, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { CustomerDetailDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { fetchApiData } from '@/lib/api';
import { EditCustomerDialog } from './edit-customer-dialog';
import { AddAddressDialog } from './add-address-dialog';
import { EditAddressDialog } from './edit-address-dialog';

export function CustomerDetailConsole({ customerId }: { readonly customerId: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetailDto>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  async function load() {
    setState('loading');
    try {
      const data = await fetchApiData<CustomerDetailDto>(`/admin/customers/${customerId}`);
      setCustomer(data);
      setMessage('');
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    void load();
  }, [customerId]);

  if (state === 'loading') {
    return (
      <main className="px-8 py-12 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 inline size-4 animate-spin" /> Loading customer {customerId}...
      </main>
    );
  }

  if (state === 'error' || !customer) {
    return (
      <main className="px-8 py-12 text-sm text-red-500">
        <XCircle className="mr-2 inline size-4" /> {message || 'Customer not found.'}
      </main>
    );
  }

  return (
    <main className="min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5">
        <div className="flex items-center justify-between">
          <div>
            <nav className="mb-2 text-xs font-medium text-muted-foreground" aria-label="Breadcrumb">
              <Link href="/customers" className="hover:underline">
                Customers
              </Link>{' '}
              <span aria-hidden="true">/</span> {customer.displayName}
            </nav>
            <h1 className="flex items-center gap-3 text-balance text-2xl font-semibold tracking-tight">
              {customer.displayName}
              <StatusBadge status={customer.status} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Customer since {new Intl.DateTimeFormat('en-BD', { dateStyle: 'long' }).format(new Date(customer.createdAt))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Refresh
            </Button>
            <EditCustomerDialog customer={customer} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Addresses & History */}
        <div className="space-y-6 lg:col-span-2">
          
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Addresses</h2>
              <AddAddressDialog customerId={customer.id} />
            </div>
            <div className="p-6">
              {customer.addresses.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
                  <MapPin className="mb-2 size-8 opacity-20" />
                  <p className="text-sm">No addresses saved.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {customer.addresses.map((address) => (
                    <div key={address.id} className="relative rounded-lg border p-4">
                      {address.isDefault && (
                        <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          Default
                        </span>
                      )}
                      <p className="font-medium text-foreground">{address.addressLine1}</p>
                      {address.addressLine2 && <p className="text-sm text-muted-foreground">{address.addressLine2}</p>}
                      {address.city && <p className="text-sm text-muted-foreground">{address.city}</p>}
                      <div className="mt-4 flex">
                        <EditAddressDialog customerId={customer.id} address={address} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Other sections like Order History could go here */}
        </div>

        {/* Right Column - Contact & Meta */}
        <div className="space-y-6">
          
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Contact</h2>
              <Button variant="ghost" size="sm">Manage</Button>
            </div>
            <div className="px-6 py-4 text-sm">
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                    <Mail className="size-4 text-muted-foreground" /> Email Addresses
                  </div>
                  {customer.emails.length === 0 ? (
                    <p className="text-muted-foreground italic">No email on file</p>
                  ) : (
                    <ul className="space-y-1">
                      {customer.emails.map((email) => (
                        <li key={email.id} className="flex items-center justify-between">
                          <span>{email.email}</span>
                          {email.isPrimary && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Primary</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                <div className="pt-2 border-t">
                  <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                    <Phone className="size-4 text-muted-foreground" /> Phone Numbers
                  </div>
                  {customer.phones.length === 0 ? (
                    <p className="text-muted-foreground italic">No phone on file</p>
                  ) : (
                    <ul className="space-y-1">
                      {customer.phones.map((phone) => (
                        <li key={phone.id} className="flex items-center justify-between">
                          <span>{phone.phone}</span>
                          {phone.isPrimary && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Primary</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Tags</h2>
            </div>
            <div className="px-6 py-4">
              {customer.tags.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No tags assigned.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {customer.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors"
                      style={tag.color ? { backgroundColor: tag.color, color: '#fff' } : undefined}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Notes</h2>
            </div>
            <div className="px-6 py-4">
              <ul className="space-y-4">
                {customer.notes.length === 0 ? (
                  <li className="text-sm text-muted-foreground italic">No notes recorded.</li>
                ) : (
                  customer.notes.map((note) => (
                    <li key={note.id} className="text-sm">
                      <p className="text-foreground">{note.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(new Date(note.createdAt))}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
          
        </div>
      </div>
    </main>
  );
}
