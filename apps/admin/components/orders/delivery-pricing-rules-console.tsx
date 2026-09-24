'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';

type Rule = {
  readonly id: string;
  readonly name: string;
  readonly country_code: string;
  readonly geography_node_id: string | null;
  readonly flat_amount: string;
  readonly currency_code: string;
  readonly priority: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly version: number;
};

export function DeliveryPricingRulesConsole() {
  const [rules, setRules] = useState<readonly Rule[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setRules(await fetchApiData<readonly Rule[]>('/admin/orders/delivery-pricing-rules'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delivery pricing rules could not be loaded.');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData('/admin/orders/delivery-pricing-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: values.get('name'),
          countryCode: values.get('countryCode'),
          geographyNodeId: String(values.get('geographyNodeId') || '') || undefined,
          flatAmount: values.get('flatAmount'),
          currency: values.get('currency'),
          priority: Number(values.get('priority') || 0),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delivery pricing rule could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(rule: Rule) {
    if (!window.confirm(`Deactivate ${rule.name}? Existing Order quotes will remain unchanged.`)) return;
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/orders/delivery-pricing-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: rule.version,
          name: rule.name,
          countryCode: rule.country_code,
          geographyNodeId: rule.geography_node_id ?? undefined,
          flatAmount: rule.flat_amount,
          currency: rule.currency_code,
          priority: rule.priority,
          status: 'INACTIVE',
        }),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delivery pricing rule could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-medium text-primary">Commerce configuration</p>
        <h1 className="text-2xl font-semibold tracking-tight">Delivery pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Checkout calculates delivery charges from these server-owned rules. New rules take effect on the next checkout refresh.
        </p>
      </header>
      {message ? <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{message}</p> : null}
      <form onSubmit={create} className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <label className="space-y-2"><Label htmlFor="rule-name">Rule name</Label><Input id="rule-name" name="name" required /></label>
        <label className="space-y-2"><Label htmlFor="rule-amount">Delivery charge</Label><Input id="rule-amount" name="flatAmount" inputMode="decimal" defaultValue="0" required /></label>
        <label className="space-y-2"><Label htmlFor="rule-country">Country</Label><Input id="rule-country" name="countryCode" defaultValue="BD" maxLength={2} required /></label>
        <label className="space-y-2"><Label htmlFor="rule-geography">Geography node ID (optional)</Label><Input id="rule-geography" name="geographyNodeId" /></label>
        <label className="space-y-2"><Label htmlFor="rule-currency">Currency</Label><Input id="rule-currency" name="currency" defaultValue="BDT" maxLength={3} required /></label>
        <label className="space-y-2"><Label htmlFor="rule-priority">Priority</Label><Input id="rule-priority" name="priority" inputMode="numeric" defaultValue="10" required /></label>
        <div className="flex items-end"><Button type="submit" disabled={busy}>Add pricing rule</Button></div>
      </form>
      <section className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Rule</th><th className="p-3">Rate</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
          <tbody>{rules.map((rule) => <tr className="border-b last:border-0" key={rule.id}><td className="p-3"><p className="font-medium">{rule.name}</p><p className="text-xs text-muted-foreground">{rule.country_code}{rule.geography_node_id ? ' · Geographic rule' : ' · Country rule'}</p></td><td className="p-3">{rule.currency_code} {rule.flat_amount}</td><td className="p-3">{rule.priority}</td><td className="p-3">{rule.status}</td><td className="p-3 text-right">{rule.status === 'ACTIVE' ? <Button disabled={busy} onClick={() => void deactivate(rule)} size="sm" variant="outline">Deactivate</Button> : null}</td></tr>)}</tbody>
        </table>
      </section>
    </main>
  );
}
