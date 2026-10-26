'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
export function CreatePrivacyRequestDialog({ customerId }: { readonly customerId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('ACCESS');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/privacy-requests`, {
        method: 'POST',
        body: JSON.stringify({ requestType: type, reason: reason.trim() }),
      });
      setOpen(false);
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Privacy request could not be created.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <ShieldCheck className="size-4" />
        Privacy request
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create privacy work item</DialogTitle>
          <DialogDescription>
            Record the request first. Authorized staff must verify identity and document the legal
            or operational resolution separately.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="privacy-request-type">Request type</Label>
            <NativeSelect
              id="privacy-request-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {['ACCESS', 'EXPORT', 'CORRECTION', 'ANONYMIZATION', 'RESTRICTION'].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="privacy-request-reason">Request and verification context</Label>
            <Textarea
              id="privacy-request-reason"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy ? 'Creating…' : 'Create work item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
