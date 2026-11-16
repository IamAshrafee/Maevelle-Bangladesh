'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, Loader2, Pencil } from 'lucide-react';
import type { CustomerNoteDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

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

  useEffect(() => {
    if (open) {
      setBody(note.body);
      setIsPinned(note.isPinned);
      setMessage('');
    }
  }, [open, note]);

  const isDirty = body !== note.body || isPinned !== note.isPinned;

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard note changes?',
  });

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
      handleOpenChange(false);
      onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Note could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={<Button type="button" variant="ghost" size="sm" aria-label="Edit note" />}
        >
          <Pencil className="size-3.5" />
        </SheetTrigger>
        <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
            <SheetTitle>Edit customer note</SheetTitle>
            <SheetDescription>
              The previous content remains available in the immutable note revision history.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {message ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>{message}</p>
                </div>
              ) : null}
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
            </div>
            <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={busy}
              >
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
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
  );
}
