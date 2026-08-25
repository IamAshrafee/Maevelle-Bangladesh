'use client';

import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { FinanceWorkspace } from '@/components/finance/finance-workspace';

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

export function FinanceConsole({ section }: { section: Section }) {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [expenses, setExpenses] = useState<readonly Expense[]>([]);
  const [ledger, setLedger] = useState<readonly Ledger[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [reconciliations, setReconciliations] = useState<readonly Reconciliation[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Finance</h1>
          <p className="text-muted-foreground mb-6">
            Operational cash ledger, real-time P&L, chart of accounts, and bank reconciliation.
          </p>
        </div>
        
        {message && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-6">
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">Loading financial data...</div>
        ) : (
          <FinanceWorkspace 
            accounts={accounts as any} 
            expenses={expenses as any} 
            ledger={ledger as any} 
            reconciliations={reconciliations as any} 
            reload={reload} 
          />
        )}
      </div>
    </main>
  );
}
