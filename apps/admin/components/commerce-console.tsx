'use client';

import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

async function request(path: string, body: unknown) {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('The requested commerce operation could not be completed.');
  return response.json() as Promise<{ data: { id: string } }>;
}
export function PricingConsole() {
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request('/admin/pricing/prices', {
        variantId: data.get('variantId'),
        currency: 'BDT',
        amount: data.get('amount'),
        compareAtAmount: data.get('compareAtAmount') || null,
      });
      setMessage(
        'Price definition created. It is the authoritative selling price for this Variant.',
      );
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Price could not be saved.');
    }
  }
  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Variant pricing</CardTitle>
            <CardDescription>
              Pricing is separate from Catalog and supports scheduled, exact-money definitions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={submit}>
              <Input name="variantId" placeholder="Variant ID" required />
              <Input name="amount" placeholder="Selling price, e.g. 1290.0000" required />
              <Input name="compareAtAmount" placeholder="Compare-at price (optional)" />
              <Button type="submit">Set price</Button>
            </form>
            {message ? (
              <p className="mt-3" role="status">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
export function PromotionsConsole() {
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const promotion = await request('/admin/promotions', {
        name: data.get('name'),
        promotionType: 'COUPON',
        benefitType: data.get('benefitType'),
        benefitValue: data.get('benefitValue'),
        combinability: data.get('combinability'),
      });
      const code = String(data.get('couponCode') ?? '');
      if (code) await request(`/admin/promotions/${promotion.data.id}/coupons`, { code });
      setMessage(
        'Promotion and coupon created. Cart application remains provisional until an Order exists.',
      );
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promotion could not be saved.');
    }
  }
  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Promotions and coupons</CardTitle>
            <CardDescription>
              Benefits and eligibility are evaluated on the server; Cart use never consumes
              redemption usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={submit}>
              <Input name="name" placeholder="Promotion name" required />
              <select name="benefitType" defaultValue="PERCENTAGE_DISCOUNT">
                <option value="PERCENTAGE_DISCOUNT">Percentage discount</option>
                <option value="FIXED_AMOUNT_DISCOUNT">Fixed amount discount</option>
              </select>
              <Input name="benefitValue" placeholder="Benefit value, e.g. 10.0000" required />
              <select name="combinability" defaultValue="EXCLUSIVE">
                <option value="EXCLUSIVE">Exclusive</option>
                <option value="STACKABLE">Stackable</option>
              </select>
              <Input name="couponCode" placeholder="Coupon code" />
              <Button type="submit">Create promotion</Button>
            </form>
            {message ? (
              <p className="mt-3" role="status">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
