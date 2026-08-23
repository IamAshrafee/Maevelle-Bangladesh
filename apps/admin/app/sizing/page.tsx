'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SizingPage() {
  const [message, setMessage] = useState('');
  async function createDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/sizing/domains', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: form.get('code'),
          name: form.get('name'),
          subjectType: 'GARMENT',
        }),
      });
      if (!response.ok) throw new Error('Sizing domain could not be created.');
      const body = (await response.json()) as { data: { id: string } };
      setMessage(
        `Sizing domain created: ${body.data.id}. Use this ID to create its system, definitions, and guide revisions through the protected sizing API.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sizing operation failed.');
    }
  }
  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-2xl">
        <Link className="text-sm underline" href="/">
          ← Catalog
        </Link>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Sizing foundations</CardTitle>
            <CardDescription>
              Guides are revisioned. Published revisions are immutable; create a new draft revision
              for changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createDomain} className="grid gap-4">
              <Label htmlFor="code">Domain code</Label>
              <Input id="code" name="code" placeholder="women-dress" required />
              <Label htmlFor="name">Domain name</Label>
              <Input id="name" name="name" placeholder="Women’s dress" required />
              <Button type="submit">Create sizing domain</Button>
            </form>
            {message ? (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
