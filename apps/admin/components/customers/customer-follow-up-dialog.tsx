'use client';

import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

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

  const isDirty = title.trim() !== '' || details.trim() !== '' || dueAt !== '';

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard follow-up draft?',
  });

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
      handleOpenChange(false);
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
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button size="sm" variant="outline" />}>
          <CalendarPlus className="size-4" /> Follow-up
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4 pr-12 text-left">
            <SheetTitle>Create follow-up</SheetTitle>
            <SheetDescription>
              The follow-up is assigned to you by default and appears in the customer timeline.
            </SheetDescription>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
            </div>
            <SheetFooter className="shrink-0 border-t border-border/60 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !title.trim() || !dueAt}>
                {busy ? 'Saving…' : 'Create follow-up'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
  );
}
