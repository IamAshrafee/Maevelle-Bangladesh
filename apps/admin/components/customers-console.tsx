'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Customer {
  id: string;
  customerNumber: string;
  displayName: string;
  status: string;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!response.ok) throw new Error('Customer operation could not be completed.');
  return response.json() as Promise<T>;
}
export function CustomersConsole() {
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      setCustomers((await request<ApiEnvelope<readonly Customer[]>>('/admin/customers')).data);
    } catch {
      window.location.assign('/login');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const displayName = new FormData(form).get('displayName');
    try {
      await request('/admin/customers', { method: 'POST', body: JSON.stringify({ displayName }) });
      form.reset();
      setMessage(
        'Customer created. Add contacts and addresses through the protected Customer API.',
      );
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create customer.');
    }
  }
  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto grid max-w-5xl gap-6">
        <header>
          <p className="text-sm text-muted-foreground">Maevelle / Customers</p>
          <h1 className="text-3xl font-semibold">Customer workspace</h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Create Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={create}>
              <Input name="displayName" placeholder="Customer name" required />
              <Button type="submit">Create</Button>
            </form>
          </CardContent>
        </Card>
        {message ? <p role="status">{message}</p> : null}
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {customers.map((customer) => (
                <li key={customer.id} className="rounded border p-3">
                  <strong>{customer.displayName}</strong>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {customer.customerNumber} · {customer.status}
                  </span>
                </li>
              ))}
              {customers.length === 0 ? <li>No Customers yet.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
