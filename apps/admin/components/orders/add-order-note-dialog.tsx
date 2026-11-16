'use client';

import { CircleAlert, Loader2, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
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

  const isDirty = body.trim().length > 0;

  const lifecycle = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard note draft?',
    description: 'You have entered unsaved note text. Are you sure you want to dismiss?',
  });

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
    <Sheet open={open} onOpenChange={lifecycle.handleOpenChange}>
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        <MessageSquarePlus aria-hidden="true" /> Add note
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle>Add order note</SheetTitle>
          <SheetDescription>
            Internal notes stay in Admin. Customer-visible notes may be used by customer
            communication surfaces.
          </SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {message ? (
              <div
                className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{message}</p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="order-note-type">Visibility</Label>
              <NativeSelect
                id="order-note-type"
                value={noteType}
                onChange={(event) => setNoteType(event.target.value as typeof noteType)}
              >
                <NativeSelectOption value="INTERNAL">Internal only</NativeSelectOption>
                <NativeSelectOption value="CUSTOMER_VISIBLE">Customer visible</NativeSelectOption>
              </NativeSelect>
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
          </div>
          <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => lifecycle.handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!body.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Save note
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
      {lifecycle.discardConfirmDialog}
    </Sheet>
  );
}
