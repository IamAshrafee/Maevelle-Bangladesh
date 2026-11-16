'use client';

import { useEffect, useState } from 'react';
import type { CustomerCustomFieldValueDto } from '@maevelle/contracts';
import { SlidersHorizontal } from 'lucide-react';
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

function initialValuesMap(fields: readonly CustomerCustomFieldValueDto[]) {
  return Object.fromEntries(
    fields.map((field) => [
      field.definition.id,
      field.value == null
        ? ''
        : Array.isArray(field.value)
          ? field.value.join(', ')
          : String(field.value),
    ]),
  );
}

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
    setValues(initialValuesMap(fields));
    setError('');
  }, [fields, open]);

  const initial = initialValuesMap(fields);
  const isDirty = fields.some((f) => (values[f.definition.id] ?? '') !== (initial[f.definition.id] ?? ''));

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard custom field changes?',
  });

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
      handleOpenChange(false);
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Custom fields could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button size="sm" variant="outline" />}>
          <SlidersHorizontal className="size-4" /> Edit fields
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4 pr-12 text-left">
            <SheetTitle>Edit custom fields</SheetTitle>
            <SheetDescription>
              Values are validated against each organization-defined schema and edit capability.
            </SheetDescription>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
                      <NativeSelectOption value="true">Yes / True</NativeSelectOption>
                      <NativeSelectOption value="false">No / False</NativeSelectOption>
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
            </div>
            <SheetFooter className="shrink-0 border-t border-border/60 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save fields'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
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
