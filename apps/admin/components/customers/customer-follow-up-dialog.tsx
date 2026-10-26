'use client';

import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

export function CustomerFollowUpDialog({
  customerId,
  onUpdated,
}: {
  customerId: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/follow-ups`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          ...(details.trim() ? { details: details.trim() } : {}),
          dueAt: new Date(dueAt).toISOString(),
        }),
      });
      setOpen(false);
      setTitle('');
      setDetails('');
      setDueAt('');
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Follow-up could not be created.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <CalendarPlus className="size-4" /> Follow-up
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create follow-up</DialogTitle>
          <DialogDescription>
            The follow-up is assigned to you by default and appears in the customer timeline.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="follow-up-title">Title</Label>
            <Input
              id="follow-up-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="follow-up-due">Due at</Label>
            <Input
              id="follow-up-due"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="follow-up-details">Details</Label>
            <Textarea
              id="follow-up-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim() || !dueAt}>
              {busy ? 'Saving…' : 'Create follow-up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
