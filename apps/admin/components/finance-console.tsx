'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

type Account = {
  id: string;
  account_number: string;
  name: string;
  account_type: string;
  currency_code: string;
  status: string;
  ledger_balance: string;
  last_movement_at: string | null;
};
type Expense = {
  id: string;
  expense_number: string;
  description: string;
  amount: string;
  currency_code: string;
  expense_date: string;
  status: string;
  category_name: string;
  paid: string;
  adjustments: string;
  outstanding: string;
};
type Ledger = {
  id: string;
  amount_delta: string;
  currency_code: string;
  created_at: string;
  transaction_number: string;
  transaction_type: string;
  description: string;
  account_name: string;
  source_domain: string | null;
};
type Reconciliation = {
  id: string;
  account_name: string;
  observed_balance: string;
  ledger_balance: string;
  difference_amount: string;
  status: string;
  created_at: string;
};
type Category = { id: string; code: string; name: string };
type Section = 'overview' | 'accounts' | 'expenses' | 'movements' | 'transfers' | 'reconciliation';
async function request<T>(path: string, init?: RequestInit) {
  const result = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const error = (await result.json().catch(() => undefined)) as
      { error?: { message?: string } } | undefined;
    throw new Error(error?.error?.message ?? 'Finance request was rejected.');
  }
  return result.json() as Promise<T>;
}
const nav: readonly [string, Section][] = [
  ['Overview', 'overview'],
  ['Accounts', 'accounts'],
  ['Expenses', 'expenses'],
  ['Cash Movements', 'movements'],
  ['Transfers', 'transfers'],
  ['Reconciliation', 'reconciliation'],
];
export function FinanceConsole({ section }: { section: Section }) {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [expenses, setExpenses] = useState<readonly Expense[]>([]);
  const [ledger, setLedger] = useState<readonly Ledger[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [reconciliations, setReconciliations] = useState<readonly Reconciliation[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      const [a, e, l, c, r] = await Promise.all([
        request<ApiEnvelope<readonly Account[]>>('/admin/finance/accounts'),
        request<ApiEnvelope<readonly Expense[]>>('/admin/finance/expenses'),
        request<ApiEnvelope<readonly Ledger[]>>('/admin/finance/ledger'),
        request<ApiEnvelope<readonly Category[]>>('/admin/finance/categories'),
        request<ApiEnvelope<readonly Reconciliation[]>>('/admin/finance/reconciliations'),
      ]);
      setAccounts(a.data);
      setExpenses(e.data);
      setLedger(l.data);
      setCategories(c.data);
      setReconciliations(r.data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Finance.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  const submit = (path: string) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      await request(path, {
        method: 'POST',
        body: JSON.stringify({ ...values, idempotencyKey: crypto.randomUUID() }),
      });
      event.currentTarget.reset();
      setMessage('Saved.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Finance command failed.');
    }
  };
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Operations / Finance</p>
        <h1>Finance</h1>
        <p>Operational cash ledger. Balances are derived from immutable account entries.</p>
        <nav className="flex flex-wrap gap-2" aria-label="Finance navigation">
          {nav.map(([label, target]) => (
            <Link key={target} href={target === 'overview' ? '/finance' : `/finance/${target}`}>
              {label}
            </Link>
          ))}
        </nav>
        {message && <p role="status">{message}</p>}
        {section === 'overview' && (
          <>
            <h2>Financial accounts</h2>
            <AccountTable accounts={accounts} />
            <h2>Outstanding expenses</h2>
            <ExpenseTable expenses={expenses} />
          </>
        )}
        {section === 'accounts' && (
          <>
            <h2>Financial accounts</h2>
            <form onSubmit={submit('/admin/finance/accounts')}>
              <input name="accountNumber" placeholder="Account number" required />
              <input name="name" placeholder="Name" required />
              <select name="accountType">
                <option>CASH</option>
                <option>BANK</option>
                <option>MOBILE_WALLET</option>
                <option>OTHER</option>
              </select>
              <input name="currencyCode" defaultValue="BDT" required />
              <input name="openingBalance" placeholder="Opening balance (optional)" />
              <button>Create account</button>
            </form>
            <AccountTable accounts={accounts} />
          </>
        )}
        {section === 'expenses' && (
          <>
            <h2>Expense categories</h2>
            <form onSubmit={submit('/admin/finance/categories')}>
              <input name="code" placeholder="Code" required />
              <input name="name" placeholder="Name" required />
              <button>Add category</button>
            </form>
            <h2>Record expense</h2>
            <form onSubmit={submit('/admin/finance/expenses')}>
              <select name="categoryId" required>
                <option value="">Choose category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input name="description" placeholder="Description" required />
              <input name="amount" placeholder="Amount" required />
              <input name="currencyCode" defaultValue="BDT" required />
              <input name="expenseDate" type="date" required />
              <button>Record expense</button>
            </form>
            <ExpenseTable expenses={expenses} />
          </>
        )}
        {section === 'movements' && (
          <>
            <h2>Controlled cash movement</h2>
            <form onSubmit={submit('/admin/finance/movements')}>
              <AccountSelect accounts={accounts} />
              <input name="amount" placeholder="Signed amount, e.g. 100 or -100" required />
              <input name="description" placeholder="Reason" required />
              <button>Record movement</button>
            </form>
            <h2>Immutable ledger history</h2>
            <LedgerTable entries={ledger} />
          </>
        )}
        {section === 'transfers' && (
          <>
            <h2>Internal transfer</h2>
            <p>Transfers move cash between accounts and are never expenses.</p>
            <form onSubmit={submit('/admin/finance/transfers')}>
              <select name="sourceAccountId" required>
                <option value="">From account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.ledger_balance} {a.currency_code})
                  </option>
                ))}
              </select>
              <select name="destinationAccountId" required>
                <option value="">To account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency_code})
                  </option>
                ))}
              </select>
              <input name="amount" placeholder="Amount" required />
              <input name="reference" placeholder="Reference" />
              <button>Transfer</button>
            </form>
            <LedgerTable
              entries={ledger.filter((e) => e.transaction_type === 'INTERNAL_TRANSFER')}
            />
          </>
        )}
        {section === 'reconciliation' && (
          <>
            <h2>Reconcile account</h2>
            <p>Observed balance comparison only—this never changes the ledger.</p>
            <form onSubmit={submit('/admin/finance/reconciliations')}>
              <AccountSelect accounts={accounts} />
              <input name="observedBalance" placeholder="Observed balance" required />
              <button>Create reconciliation</button>
            </form>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Ledger</th>
                  <th>Observed</th>
                  <th>Difference</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {reconciliations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.account_name}</td>
                    <td>{r.ledger_balance}</td>
                    <td>{r.observed_balance}</td>
                    <td>{r.difference_amount}</td>
                    <td>{r.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </main>
  );
}
function AccountSelect({ accounts }: { accounts: readonly Account[] }) {
  return (
    <select name="accountId" required>
      <option value="">Choose account</option>
      {accounts
        .filter((a) => a.status === 'ACTIVE')
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.currency_code})
          </option>
        ))}
    </select>
  );
}
function AccountTable({ accounts }: { accounts: readonly Account[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Account</th>
          <th>Type</th>
          <th>Currency</th>
          <th>Status</th>
          <th>Ledger balance</th>
        </tr>
      </thead>
      <tbody>
        {accounts.length ? (
          accounts.map((a) => (
            <tr key={a.id}>
              <td>
                {a.name}
                <br />
                <small>{a.account_number}</small>
              </td>
              <td>{a.account_type}</td>
              <td>{a.currency_code}</td>
              <td>{a.status}</td>
              <td>{a.ledger_balance}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5}>No financial accounts yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
function ExpenseTable({ expenses }: { expenses: readonly Expense[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Expense</th>
          <th>Category</th>
          <th>Amount</th>
          <th>Paid</th>
          <th>Outstanding</th>
        </tr>
      </thead>
      <tbody>
        {expenses.length ? (
          expenses.map((e) => (
            <tr key={e.id}>
              <td>
                {e.expense_number}
                <br />
                {e.description}
              </td>
              <td>{e.category_name}</td>
              <td>
                {e.amount} {e.currency_code}
              </td>
              <td>{e.paid}</td>
              <td>{e.outstanding}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5}>No expenses yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
function LedgerTable({ entries }: { entries: readonly Ledger[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Account</th>
          <th>Movement</th>
          <th>Type</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>
        {entries.length ? (
          entries.map((e) => (
            <tr key={e.id}>
              <td>{e.created_at}</td>
              <td>{e.account_name}</td>
              <td>
                {e.amount_delta} {e.currency_code}
              </td>
              <td>{e.transaction_type}</td>
              <td>{e.description}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5}>No cash movements yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
