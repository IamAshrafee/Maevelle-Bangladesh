'use client';

import { type FormEvent, useState } from 'react';

import type { CatalogDefinitionStatusDto } from '@maevelle/contracts';

import { classificationRequest, slugify } from '@/components/catalog-classification/classification-api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    <Dialog open onOpenChange={(open) => !open && !props.saving && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Product Type' : 'Create Product Type'}</DialogTitle>
          <DialogDescription>
            Product Types define the structured fields shared by a family of Products.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          id="product-type-form"
          onSubmit={(event) => void submit(event)}
        >
          <ErrorNotice message={props.error} />
          <div className="grid gap-2">
            <Label htmlFor="product-type-name">Name</Label>
            <Input
              autoFocus
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
        <DialogFooter>
          <Button disabled={props.saving} type="button" variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={props.saving} form="product-type-form" type="submit">
            {props.saving ? 'Saving…' : item ? 'Save changes' : 'Create type'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
