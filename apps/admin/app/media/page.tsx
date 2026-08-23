'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MediaPage() {
  const [message, setMessage] = useState('');
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('image');
    if (!(file instanceof File)) return;
    try {
      const response = await fetch('/api/admin/media/images', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': file.type, 'x-media-visibility': 'private' },
        body: file,
      });
      if (!response.ok)
        throw new Error(
          'Upload was rejected. Use a JPEG, PNG, or WebP image within the configured size limit.',
        );
      const payload = (await response.json()) as { data: { id: string } };
      setMessage(
        `Upload complete. Asset ${payload.data.id} is private until attached or made public by workflow.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
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
            <CardTitle>Media library</CardTitle>
            <CardDescription>
              Images are stored locally for development, validated by file signature, and default to
              private.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={upload} className="grid gap-4">
              <Label htmlFor="image">JPEG, PNG, or WebP</Label>
              <Input
                id="image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
              <Button type="submit">Upload image</Button>
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
