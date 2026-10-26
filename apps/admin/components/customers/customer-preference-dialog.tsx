'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

export function CustomerPreferenceDialog({
  customerId,
  onUpdated,
}: {
  customerId: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [source, setSource] = useState('AGENT_RECORDED');
  const [confidence, setConfidence] = useState('REPORTED');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fetchApiData(
        `/admin/customers/${customerId}/preferences/${encodeURIComponent(key.trim().toLowerCase())}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            value: value.trim(),
            source,
            confidence,
            ...(evidenceReference.trim() ? { evidenceReference: evidenceReference.trim() } : {}),
          }),
        },
      );
      setOpen(false);
      setKey('');
      setValue('');
      setEvidenceReference('');
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preference could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4" /> Preference
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record customer preference</DialogTitle>
          <DialogDescription>
            Record the source and confidence so an agent observation is never presented as
            customer-confirmed fact.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="preference-key">Key</Label>
            <Input
              id="preference-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="preferred_channel"
              pattern="[a-z][a-z0-9_]{1,63}"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preference-value">Value</Label>
            <Textarea
              id="preference-value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="preference-source">Source</Label>
              <NativeSelect
                id="preference-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                {['CUSTOMER_CONFIRMED', 'AGENT_RECORDED', 'COMMERCE_OBSERVED', 'IMPORTED'].map(
                  (item) => (
                    <NativeSelectOption key={item} value={item}>
                      {item.replaceAll('_', ' ')}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preference-confidence">Confidence</Label>
              <NativeSelect
                id="preference-confidence"
                value={confidence}
                onChange={(event) => setConfidence(event.target.value)}
              >
                {['INFERRED', 'REPORTED', 'CONFIRMED'].map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preference-evidence">Evidence reference (optional)</Label>
            <Input
              id="preference-evidence"
              value={evidenceReference}
              onChange={(event) => setEvidenceReference(event.target.value)}
              placeholder="conversation:…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !key.trim() || !value.trim()}>
              {busy ? 'Saving…' : 'Save preference'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
