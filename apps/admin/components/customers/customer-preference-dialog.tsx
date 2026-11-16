'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

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

  const isDirty = key.trim() !== '' || value.trim() !== '' || evidenceReference.trim() !== '';

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard customer preference draft?',
  });

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
      handleOpenChange(false);
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
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button size="sm" variant="outline" />}>
          <Plus className="size-4" /> Preference
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4 pr-12 text-left">
            <SheetTitle>Record customer preference</SheetTitle>
            <SheetDescription>
              Record the source and confidence so an agent observation is never presented as
              customer-confirmed fact.
            </SheetDescription>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="space-y-2">
                <Label htmlFor="preference-key">Preference key</Label>
                <Input
                  id="preference-key"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="e.g. preferred_delivery_slot or fabric_sensitivity"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preference-value">Value</Label>
                <Input
                  id="preference-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="e.g. evening or pure silk only"
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
                    {[
                      'CUSTOMER_EXPLICIT',
                      'AGENT_RECORDED',
                      'SURVEY_RESPONSE',
                      'MARKETING_INTERACTION',
                    ].map((item) => (
                      <NativeSelectOption key={item} value={item}>
                        {item.replaceAll('_', ' ')}
                      </NativeSelectOption>
                    ))}
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
            </div>
            <SheetFooter className="shrink-0 border-t border-border/60 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !key.trim() || !value.trim()}>
                {busy ? 'Saving…' : 'Save preference'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
  );
}
