'use client';

import { useEffect, useState } from 'react';
import type { CustomerCustomFieldValueDto } from '@maevelle/contracts';
import { SlidersHorizontal } from 'lucide-react';
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
import { fetchApiData } from '@/lib/api';

export function CustomerCustomFieldsDialog({
  customerId,
  fields,
  onUpdated,
}: {
  customerId: string;
  fields: readonly CustomerCustomFieldValueDto[];
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setValues(
      Object.fromEntries(
        fields.map((field) => [
          field.definition.id,
          field.value == null
            ? ''
            : Array.isArray(field.value)
              ? field.value.join(', ')
              : String(field.value),
        ]),
      ),
    );
    setError('');
  }, [fields, open]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await Promise.all(
        fields.map((field) =>
          fetchApiData(`/admin/customers/${customerId}/custom-fields/${field.definition.id}`, {
            method: 'PUT',
            body: JSON.stringify({ value: parseValue(field, values[field.definition.id] ?? '') }),
          }),
        ),
      );
      setOpen(false);
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Custom fields could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <SlidersHorizontal className="size-4" /> Edit fields
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit custom fields</DialogTitle>
          <DialogDescription>
            Values are validated against each organization-defined schema and edit capability.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={submit}>
          {fields.map((field) => (
            <div key={field.definition.id} className="space-y-2">
              <Label htmlFor={`custom-${field.definition.id}`}>
                {field.definition.label}
                {field.definition.isRequired ? ' *' : ''}
              </Label>
              {field.definition.valueType === 'BOOLEAN' ? (
                <NativeSelect
                  id={`custom-${field.definition.id}`}
                  value={values[field.definition.id] ?? 'false'}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.definition.id]: event.target.value,
                    }))
                  }
                >
                  <NativeSelectOption value="true">Yes</NativeSelectOption>
                  <NativeSelectOption value="false">No</NativeSelectOption>
                </NativeSelect>
              ) : field.definition.valueType === 'SINGLE_CHOICE' ? (
                <NativeSelect
                  id={`custom-${field.definition.id}`}
                  value={values[field.definition.id] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.definition.id]: event.target.value,
                    }))
                  }
                >
                  <NativeSelectOption value="" disabled>
                    Select a value
                  </NativeSelectOption>
                  {field.definition.choices.map((choice) => (
                    <NativeSelectOption key={choice} value={choice}>
                      {choice}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  id={`custom-${field.definition.id}`}
                  type={
                    field.definition.valueType === 'NUMBER'
                      ? 'number'
                      : field.definition.valueType === 'DATE'
                        ? 'date'
                        : 'text'
                  }
                  value={values[field.definition.id] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.definition.id]: event.target.value,
                    }))
                  }
                  placeholder={
                    field.definition.valueType === 'MULTI_CHOICE'
                      ? `Comma-separated: ${field.definition.choices.join(', ')}`
                      : undefined
                  }
                  required={field.definition.isRequired}
                />
              )}
              {field.definition.description ? (
                <p className="text-xs text-muted-foreground">{field.definition.description}</p>
              ) : null}
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save fields'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function parseValue(field: CustomerCustomFieldValueDto, value: string): unknown {
  if (field.definition.valueType === 'NUMBER') return Number(value);
  if (field.definition.valueType === 'BOOLEAN') return value === 'true';
  if (field.definition.valueType === 'MULTI_CHOICE')
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return value;
}
