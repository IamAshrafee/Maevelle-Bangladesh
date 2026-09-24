'use client';

import { CircleAlert, Loader2, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

export function AddOrderNoteDialog({
  orderId,
  onCompleted,
}: {
  readonly orderId: string;
  readonly onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [noteType, setNoteType] = useState<'INTERNAL' | 'CUSTOMER_VISIBLE'>('INTERNAL');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/orders/${orderId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ noteType, body }),
      });
      setBody('');
      setOpen(false);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Note could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <MessageSquarePlus aria-hidden="true" /> Add note
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add order note</DialogTitle>
          <DialogDescription>
            Internal notes stay in Admin. Customer-visible notes may be used by customer
            communication surfaces.
          </DialogDescription>
        </DialogHeader>
        {message ? (
          <div
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        ) : null}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="order-note-type">Visibility</Label>
            <select
              id="order-note-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={noteType}
              onChange={(event) => setNoteType(event.target.value as typeof noteType)}
            >
              <option value="INTERNAL">Internal only</option>
              <option value="CUSTOMER_VISIBLE">Customer visible</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-note-body">Note</Label>
            <Textarea
              id="order-note-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!body.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Save note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
