'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
import type { CustomerDetailDto } from '@maevelle/contracts';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function EditCustomerDialog({
  customer,
  onUpdated,
}: {
  customer: CustomerDetailDto;
  onUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [displayName, setDisplayName] = useState(customer.displayName);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'BLOCKED'>(
    customer.status === 'INACTIVE' || customer.status === 'BLOCKED' ? customer.status : 'ACTIVE',
  );

  useEffect(() => {
    if (open) {
      setDisplayName(customer.displayName);
      setStatus(
        customer.status === 'INACTIVE' || customer.status === 'BLOCKED'
          ? customer.status
          : 'ACTIVE',
      );
      setMessage('');
    }
  }, [open, customer]);

  const isDirty = displayName !== customer.displayName || status !== customer.status;

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard customer changes?',
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');

    const payload = {
      expectedVersion: customer.version,
      displayName: displayName.trim(),
      status,
    };

    try {
      await fetchApiData(`/admin/customers/${customer.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      handleOpenChange(false);
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button variant="secondary" />}>Edit Details</SheetTrigger>
        <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
            <SheetTitle>Edit Customer</SheetTitle>
            <SheetDescription>Update the customer's display name or status.</SheetDescription>
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
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Account Status</Label>
                <NativeSelect
                  id="status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | 'BLOCKED')}
                  required
                >
                  <NativeSelectOption value="ACTIVE">Active</NativeSelectOption>
                  <NativeSelectOption value="INACTIVE">Inactive</NativeSelectOption>
                  <NativeSelectOption value="BLOCKED">Blocked</NativeSelectOption>
                </NativeSelect>
                <p className="text-xs text-muted-foreground mt-1">
                  Blocked customers cannot place new orders or have manual orders created for them.
                </p>
              </div>
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
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Changes
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
  );
}
