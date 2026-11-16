'use client';

import { useState } from 'react';
import { CircleAlert, Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

export function AddNoteDialog({
  customerId,
  onAdded,
}: {
  readonly customerId: string;
  readonly onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [body, setBody] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setMessage('');

    try {
      await fetchApiData(`/admin/customers/${customerId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim() }),
      });
      setOpen(false);
      setBody('');
      onAdded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Note could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const isDirty = body.trim().length > 0;

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    isDirty,
    isSubmitting: busy,
    onClose: () => {
      setOpen(false);
      setBody('');
    },
    confirmTitle: 'Discard customer note?',
    confirmDescription: 'You have entered an internal note. Closing now will discard it.',
  });

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button variant="ghost" size="sm" />}>
          <Plus className="mr-1 size-3.5" /> Add Note
        </SheetTrigger>
        <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
            <SheetTitle>Add Customer Note</SheetTitle>
            <SheetDescription>
              Record an internal note about this customer. Notes are permanent operational records.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {message && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <p className="leading-tight">{message}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="noteBody">Note</Label>
                <Textarea
                  id="noteBody"
                  rows={4}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="e.g. Customer prefers WhatsApp updates; VIP customer."
                />
              </div>
            </div>

            <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !body.trim()}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save Note'
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
