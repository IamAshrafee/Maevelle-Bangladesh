'use client';

import { useState } from 'react';
import { CircleAlert, Loader2, Pencil } from 'lucide-react';
import type { CustomerNoteDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

export function EditNoteDialog({
  customerId,
  note,
  onUpdated,
}: {
  readonly customerId: string;
  readonly note: CustomerNoteDto;
  readonly onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [body, setBody] = useState(note.body);
  const [isPinned, setIsPinned] = useState(note.isPinned);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: body.trim(), isPinned, expectedVersion: note.version }),
      });
      setOpen(false);
      onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Note could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="sm" aria-label="Edit note" />}
      >
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit customer note</DialogTitle>
          <DialogDescription>
            The previous content remains available in the immutable note revision history.
          </DialogDescription>
        </DialogHeader>
        {message ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        ) : null}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`note-${note.id}`}>Note</Label>
            <Textarea
              id={`note-${note.id}`}
              rows={5}
              required
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <Checkbox
              checked={isPinned}
              onCheckedChange={(checked) => setIsPinned(checked === true)}
            />
            <span>Pin this note to the top</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !body.trim()}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
