'use client';

import { type FormEvent, useState } from 'react';

import type {
  CatalogAttributeScopeDto,
  CatalogAttributeValueTypeDto,
  CatalogDefinitionStatusDto,
} from '@maevelle/contracts';

import {
  classificationRequest,
  slugify,
} from '@/components/catalog-classification/classification-api';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

import { ErrorNotice } from './error-notice';
import { parseReferenceOptions, type ProductTypeEditor } from './product-type-types';

export function AttributeDialog(props: {
  editor: Extract<ProductTypeEditor, { kind: 'ATTRIBUTE' }>;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSaved: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const item = props.editor.item;
  const [name, setName] = useState(item?.name ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [codeEdited, setCodeEdited] = useState(Boolean(item));
  const [valueType, setValueType] = useState<CatalogAttributeValueTypeDto>(
    item?.valueType ?? 'TEXT',
  );
  const [scope, setScope] = useState<CatalogAttributeScopeDto>(item?.scope ?? 'PRODUCT');
  const [status, setStatus] = useState<CatalogDefinitionStatusDto>(item?.status ?? 'ACTIVE');
  const [required, setRequired] = useState(item?.required ?? false);
  const [filterable, setFilterable] = useState(item?.filterable ?? false);
  const [searchable, setSearchable] = useState(item?.searchable ?? false);
  const [options, setOptions] = useState('');

  const isDirty = item
    ? name !== item.name ||
      status !== item.status ||
      required !== item.required ||
      filterable !== item.filterable ||
      searchable !== item.searchable
    : Boolean(name.trim() || code.trim() || options.trim());

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    isDirty,
    isSubmitting: props.saving,
    onClose: props.onClose,
    confirmTitle: item ? 'Discard attribute changes?' : 'Discard new attribute?',
    confirmDescription:
      'You have unsaved changes in this attribute form. Closing now will discard them.',
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = `/admin/catalog/product-types/${props.editor.productType.id}/attributes${item ? `/${item.id}` : ''}`;
    await props.onSaved(() =>
      classificationRequest(path, {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify(
          item
            ? { version: item.version, name, status, required, filterable, searchable }
            : {
                name,
                code,
                valueType,
                scope,
                required,
                filterable,
                searchable,
                ...(valueType === 'REFERENCE'
                  ? { referenceOptions: parseReferenceOptions(options) }
                  : {}),
              },
        ),
      }),
    );
  }

  return (
    <>
      <Sheet open onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle>
            {item ? 'Edit attribute' : `Add attribute to ${props.editor.productType.name}`}
          </SheetTitle>
          <SheetDescription>
            Attributes capture reusable structured facts for Products or their Variants.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <form className="grid gap-4" id="attribute-form" onSubmit={(event) => void submit(event)}>
            <ErrorNotice message={props.error} />
            <div className="grid gap-2">
              <Label htmlFor="attribute-name">Name</Label>
              <Input
                id="attribute-name"
                maxLength={120}
                required
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!codeEdited) setCode(slugify(event.target.value));
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="attribute-code">Code</Label>
              <Input
                disabled={Boolean(item)}
                id="attribute-code"
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                required
                value={code}
                onChange={(event) => {
                  setCodeEdited(true);
                  setCode(event.target.value.toLowerCase());
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="attribute-type">Value type</Label>
                <Select
                  disabled={Boolean(item)}
                  value={valueType}
                  onValueChange={(value) => setValueType(value as CatalogAttributeValueTypeDto)}
                >
                  <SelectTrigger id="attribute-type">
                    <SelectValue placeholder="Select value type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'REFERENCE'] as const).map(
                      (type) => {
                        const label = type.charAt(0) + type.slice(1).toLowerCase();
                        return (
                          <SelectItem key={type} value={type} label={label}>
                            {label}
                          </SelectItem>
                        );
                      },
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="attribute-scope">Scope</Label>
                <Select
                  disabled={Boolean(item)}
                  value={scope}
                  onValueChange={(value) => setScope(value as CatalogAttributeScopeDto)}
                >
                  <SelectTrigger id="attribute-scope">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRODUCT">Product</SelectItem>
                    <SelectItem value="VARIANT">Variant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {item ? (
              <div className="grid gap-2">
                <Label htmlFor="attribute-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as CatalogDefinitionStatusDto)}
                >
                  <SelectTrigger id="attribute-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <fieldset className="grid gap-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Behavior</legend>
              {[
                ['required', 'Required before publishing', required, setRequired],
                ['filterable', 'Available to merchandising filters', filterable, setFilterable],
                ['searchable', 'Included in catalog search', searchable, setSearchable],
              ].map(([id, label, checked, setter]) => (
                <label
                  className="flex items-center gap-2"
                  htmlFor={`attribute-${id}`}
                  key={String(id)}
                >
                  <input
                    checked={Boolean(checked)}
                    id={`attribute-${id}`}
                    type="checkbox"
                    onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                  />
                  <span>{String(label)}</span>
                </label>
              ))}
            </fieldset>
            {!item && valueType === 'REFERENCE' ? (
              <div className="grid gap-2">
                <Label htmlFor="attribute-options">Initial selector options</Label>
                <Textarea
                  id="attribute-options"
                  placeholder={'silk | Silk\nlinen | Linen'}
                  required
                  rows={5}
                  value={options}
                  onChange={(event) => setOptions(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  One option per line as <code>code | Customer-facing label</code>. More options can
                  be added later.
                </p>
              </div>
            ) : null}
            {item ? (
              <p className="text-xs text-muted-foreground">
                Code, value type, and scope stay immutable so existing structured values remain
                valid.
              </p>
            ) : null}
          </form>
        </div>
        <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
          <Button disabled={props.saving} type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={props.saving} form="attribute-form" type="submit">
            {props.saving ? 'Saving…' : item ? 'Save attribute' : 'Add attribute'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    {discardConfirmDialog}
  </>
);
}
