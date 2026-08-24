'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from 'lucide-react';

import type { ApiEnvelope } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';

interface Customer {
  id: string;
  customerNumber: string;
  displayName: string;
  status: string;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  orderCount?: number;
  totalSpend?: string;
  lastOrderAt?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string; code?: string };
    };
    const detail = typeof body.error === 'object' ? body.error.message : body.error;
    throw new Error(detail ?? 'Customer operation could not be completed.');
  }
  return response.json() as Promise<T>;
}

const money = (value: string | undefined) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(Number(value ?? 0));

export function CustomersConsole() {
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [selected, setSelected] = useState<Customer>();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('Loading Customers…');
  const [createOpen, setCreateOpen] = useState(false);

  const reload = async () => {
    try {
      const loaded = (await request<ApiEnvelope<readonly Customer[]>>('/admin/customers')).data;
      setCustomers(loaded);
      setSelected((current) => loaded.find((customer) => customer.id === current?.id) ?? current);
      setMessage('');
      return loaded;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Customers.');
      return [];
    }
  };

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    void reload().then((loaded) => {
      const customerId = parameters.get('customer');
      if (customerId) setSelected(loaded.find((customer) => customer.id === customerId));
    });
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return customers.filter((customer) =>
      `${customer.displayName} ${customer.customerNumber} ${customer.primaryPhone ?? ''} ${customer.primaryEmail ?? ''}`
        .toLowerCase()
        .includes(term),
    );
  }, [customers, query]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const displayName = new FormData(form).get('displayName');
    try {
      await request('/admin/customers', { method: 'POST', body: JSON.stringify({ displayName }) });
      form.reset();
      setCreateOpen(false);
      setMessage('Customer created. Open the record to add verified contact information.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Customer.');
    }
  }

  async function addContact(event: FormEvent<HTMLFormElement>, kind: 'phones' | 'emails') {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/admin/customers/${selected.id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({
          [kind === 'phones' ? 'phone' : 'email']: data.get('value'),
          isPrimary: true,
        }),
      });
      form.reset();
      setMessage(`Primary ${kind === 'phones' ? 'phone' : 'email'} added.`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add contact information.');
    }
  }

  return (
    <main className="admin-page customer-v2">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce / Customers</p>
          <h1>Customers</h1>
          <p>Identity, contact context, order history, and lifetime activity in one queue.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" type="button" onClick={() => void reload()}>
            <RefreshCw /> Refresh
          </button>
          <button className="button primary" type="button" onClick={() => setCreateOpen(true)}>
            <Plus /> Create Customer
          </button>
        </div>
      </header>
      {message ? (
        <div className="notice notice-warning" role="status">
          <AlertTriangle /> {message}
        </div>
      ) : null}
      <section className="orders-filterbar" aria-label="Customer search">
        <label className="table-search">
          <Search />
          <span className="sr-only">Search Customers</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, customer number, phone, or email…"
          />
        </label>
        <span className="result-count">{visible.length} Customers</span>
      </section>
      <div className={`customer-workspace ${selected ? 'detail-open' : ''}`}>
        <section className="panel">
          <div className="data-table-shell">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Orders</th>
                  <th>Lifetime spend</th>
                  <th>Last order</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((customer) => (
                  <tr
                    className={selected?.id === customer.id ? 'selected-row' : ''}
                    key={customer.id}
                    onClick={() => setSelected(customer)}
                  >
                    <td>
                      <div className="product-identity">
                        <span>
                          <UserRound />
                        </span>
                        <div>
                          <strong>{customer.displayName}</strong>
                          <small>{customer.customerNumber}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{customer.primaryPhone ?? 'No phone'}</strong>
                      <small className="table-secondary">
                        {customer.primaryEmail ?? 'No email'}
                      </small>
                    </td>
                    <td>{customer.orderCount ?? 0}</td>
                    <td>{money(customer.totalSpend)}</td>
                    <td>
                      {customer.lastOrderAt
                        ? new Date(customer.lastOrderAt).toLocaleDateString('en-BD')
                        : 'Never'}
                    </td>
                    <td>
                      <StatusBadge status={customer.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 ? (
              <div className="empty-state">
                <UserRound />
                <strong>No matching Customers</strong>
                <p>Create a Customer or clear the search.</p>
              </div>
            ) : null}
          </div>
        </section>
        {selected ? (
          <aside className="customer-detail-panel">
            <header className="detail-header">
              <div>
                <p className="eyebrow">Customer 360</p>
                <h2>{selected.displayName}</h2>
                <StatusBadge status={selected.status} />
              </div>
              <button
                aria-label="Close Customer detail"
                type="button"
                onClick={() => setSelected(undefined)}
              >
                <X />
              </button>
            </header>
            <section className="customer-metrics">
              <article>
                <span>Orders</span>
                <strong>{selected.orderCount ?? 0}</strong>
              </article>
              <article>
                <span>Lifetime spend</span>
                <strong>{money(selected.totalSpend)}</strong>
              </article>
            </section>
            <section className="customer-contact-list">
              <h3>Primary contact</h3>
              <p>
                <Phone /> {selected.primaryPhone ?? 'No phone saved'}
              </p>
              <p>
                <Mail /> {selected.primaryEmail ?? 'No email saved'}
              </p>
            </section>
            <section className="customer-contact-forms">
              <h3>Add or replace primary contact</h3>
              <form onSubmit={(event) => void addContact(event, 'phones')}>
                <input name="value" placeholder="+880…" required />
                <button type="submit">Save phone</button>
              </form>
              <form onSubmit={(event) => void addContact(event, 'emails')}>
                <input name="value" type="email" placeholder="customer@example.com" required />
                <button type="submit">Save email</button>
              </form>
            </section>
            <a className="detail-link" href={`/orders?customer=${selected.id}`}>
              <ShoppingBag /> View related Orders
            </a>
          </aside>
        ) : null}
      </div>
      {createOpen ? (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={() => setCreateOpen(false)}
        >
          <aside
            className="form-drawer compact"
            role="dialog"
            aria-modal="true"
            aria-label="Create Customer"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">New identity</p>
                <h2>Create Customer</h2>
                <p>Start with the name; contact details remain separate verified facts.</p>
              </div>
              <button aria-label="Close" type="button" onClick={() => setCreateOpen(false)}>
                <X />
              </button>
            </header>
            <form onSubmit={create}>
              <label>
                Customer name
                <input name="displayName" placeholder="Customer name" required />
              </label>
              <footer>
                <button type="button" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button className="button primary" type="submit">
                  Create Customer
                </button>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
