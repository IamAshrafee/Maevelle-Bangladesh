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
          <Input id="displayName" name="displayName" required disabled={busy} placeholder="e.g. Jane Doe" />
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
