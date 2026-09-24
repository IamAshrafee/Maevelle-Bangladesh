'use client';

import { useState } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';

export function CreateCustomerForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);
    const payload = {
      displayName: formData.get('displayName') as string,
      phone: (formData.get('phone') as string) || undefined,
      email: (formData.get('email') as string) || undefined,
      source: formData.get('source') as string,
    };

    try {
      const data = await fetchApiData<{ id: string }>('/admin/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      router.push(`/customers/${data.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer could not be created.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            name="displayName"
            required
            disabled={busy}
            placeholder="e.g. Jane Doe"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" disabled={busy} placeholder="01712 345678" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              disabled={busy}
              placeholder="customer@example.com"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Acquisition source</Label>
          <select
            id="source"
            name="source"
            defaultValue="ADMIN_CREATED"
            disabled={busy}
            className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ADMIN_CREATED">Admin created</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="PHONE">Phone</option>
            <option value="IMPORT">Import</option>
            <option value="EXTERNAL_API">External API</option>
          </select>
        </div>
      </div>

      {message ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <CircleAlert className="mt-0.5 size-4 shrink-0 opacity-80" />
          <p className="leading-tight">{message}</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => router.push('/customers')}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Create Customer
        </Button>
      </div>
    </form>
  );
}
