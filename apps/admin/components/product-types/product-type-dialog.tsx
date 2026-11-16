'use client';

import { type FormEvent, useState } from 'react';

import type { CatalogDefinitionStatusDto } from '@maevelle/contracts';

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
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

import { ErrorNotice } from './error-notice';
import type { ProductTypeEditor } from './product-type-types';

export function ProductTypeDialog(props: {
  editor: Extract<ProductTypeEditor, { kind: 'TYPE' }>;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSaved: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const item = props.editor.item;
  const [name, setName] = useState(item?.name ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [codeEdited, setCodeEdited] = useState(Boolean(item));
  const [status, setStatus] = useState<CatalogDefinitionStatusDto>(item?.status ?? 'ACTIVE');

  const isDirty = item
    ? name !== item.name || status !== item.status
    : Boolean(name.trim() || code.trim());

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    isDirty,
    isSubmitting: props.saving,
    onClose: props.onClose,
    confirmTitle: item ? 'Discard product type changes?' : 'Discard new product type?',
    confirmDescription:
      'You have unsaved changes in this product type form. Closing now will discard them.',
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await props.onSaved(() =>
      item
        ? classificationRequest<void>(`/admin/catalog/product-types/${item.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ version: item.version, name, status }),
          })
        : classificationRequest('/admin/catalog/product-types', {
            method: 'POST',
            body: JSON.stringify({ name, code }),
          }),
    );
  }

  return (
    <>
      <Sheet open onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle>{item ? 'Edit Product Type' : 'Create Product Type'}</SheetTitle>
          <SheetDescription>
            Product Types define the structured fields shared by a family of Products.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <form
            className="grid gap-4"
            id="product-type-form"
            onSubmit={(event) => void submit(event)}
          >
            <ErrorNotice message={props.error} />
            <div className="grid gap-2">
              <Label htmlFor="product-type-name">Name</Label>
              <Input
                id="product-type-name"
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
              <Label htmlFor="product-type-code">Code</Label>
              <Input
                disabled={Boolean(item)}
                id="product-type-code"
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                required
                value={code}
                onChange={(event) => {
                  setCodeEdited(true);
                  setCode(event.target.value.toLowerCase());
                }}
              />
              <p className="text-xs text-muted-foreground">
                Permanent integration key. It cannot be changed after creation.
              </p>
            </div>
            {item ? (
              <div className="grid gap-2">
                <Label htmlFor="product-type-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as CatalogDefinitionStatusDto)}
                >
                  <SelectTrigger id="product-type-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
                {item.productCount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Types used by non-archived Products cannot be archived.
                  </p>
                ) : null}
              </div>
            ) : null}
          </form>
        </div>
        <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
          <Button disabled={props.saving} type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={props.saving} form="product-type-form" type="submit">
            {props.saving ? 'Saving…' : item ? 'Save changes' : 'Create type'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    {discardConfirmDialog}
  </>
);
}
