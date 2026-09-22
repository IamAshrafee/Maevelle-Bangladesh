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

export function ReferenceOptionDialog(props: {
  editor: Extract<ProductTypeEditor, { kind: 'OPTION' }>;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSaved: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const item = props.editor.item;
  const [label, setLabel] = useState(item?.label ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [codeEdited, setCodeEdited] = useState(Boolean(item));
  const [status, setStatus] = useState<CatalogDefinitionStatusDto>(item?.status ?? 'ACTIVE');
  const [position, setPosition] = useState(
    item?.position ?? props.editor.attribute.referenceOptions.length,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const base = `/admin/catalog/attributes/${props.editor.attribute.id}/reference-options`;
    await props.onSaved(() =>
      classificationRequest(`${base}${item ? `/${item.id}` : ''}`, {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify(
          item ? { version: item.version, label, status, position } : { code, label, position },
        ),
      }),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !props.saving && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit selector option' : `Add option to ${props.editor.attribute.name}`}
          </DialogTitle>
          <DialogDescription>
            Options are tenant-scoped stable references; archiving one preserves existing Product
            selections.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          id="reference-option-form"
          onSubmit={(event) => void submit(event)}
        >
          <ErrorNotice message={props.error} />
          <div className="grid gap-2">
            <Label htmlFor="reference-option-label">Label</Label>
            <Input
              autoFocus
              id="reference-option-label"
              maxLength={120}
              required
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (!codeEdited) setCode(slugify(event.target.value));
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reference-option-code">Code</Label>
            <Input
              disabled={Boolean(item)}
              id="reference-option-code"
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
              <Label htmlFor="reference-option-position">Display order</Label>
              <Input
                id="reference-option-position"
                min={0}
                required
                type="number"
                value={position}
                onChange={(event) => setPosition(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
            {item ? (
              <div className="grid gap-2">
                <Label htmlFor="reference-option-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as CatalogDefinitionStatusDto)}
                >
                  <SelectTrigger id="reference-option-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button disabled={props.saving} type="button" variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={props.saving} form="reference-option-form" type="submit">
            {props.saving ? 'Saving…' : item ? 'Save option' : 'Add option'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
