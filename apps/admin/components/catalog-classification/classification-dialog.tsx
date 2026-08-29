'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type {
  CatalogCategoryDto,
  CatalogCategoryStatusDto,
  CatalogVocabularyItemDto,
  CatalogVocabularyKindDto,
} from '@maevelle/contracts';

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
import { Textarea } from '@/components/ui/textarea';

import { slugify } from './classification-api';

type EditableItem = CatalogCategoryDto | CatalogVocabularyItemDto;

export interface ClassificationFormValue {
  readonly name: string;
  readonly handle: string;
  readonly description?: string;
  readonly status: CatalogCategoryStatusDto;
  readonly parentCategoryId?: string;
  readonly position: number;
}

const kindNames: Record<CatalogVocabularyKindDto, string> = {
  TAG: 'tag',
  OCCASION: 'occasion',
  COLLECTION: 'collection',
};

export function ClassificationDialog(props: {
  open: boolean;
  categoryMode: boolean;
  kind: CatalogVocabularyKindDto;
  item?: EditableItem;
  categories: readonly CatalogCategoryDto[];
  saving: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (value: ClassificationFormValue) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleEdited, setHandleEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CatalogCategoryStatusDto>('ACTIVE');
  const [parentCategoryId, setParentCategoryId] = useState('NONE');
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const category = props.item && 'path' in props.item ? props.item : undefined;
    const vocabulary = props.item && 'kind' in props.item ? props.item : undefined;
    setName(props.item?.name ?? '');
    setHandle(props.item?.handle ?? '');
    setHandleEdited(Boolean(props.item));
    setDescription(vocabulary?.description ?? '');
    setStatus(props.item?.status ?? 'ACTIVE');
    setParentCategoryId(category?.parentCategoryId ?? 'NONE');
    setPosition(props.item?.position ?? 0);
  }, [props.item, props.open]);

  const noun = props.categoryMode ? 'category' : kindNames[props.kind];
  const editedCategory = props.item && 'path' in props.item ? props.item : undefined;
  const invalidParentIds = new Set(
    editedCategory
      ? props.categories
          .filter(
            (category) =>
              category.id === editedCategory.id ||
              category.path.startsWith(`${editedCategory.path} / `),
          )
          .map((category) => category.id)
      : [],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onSave({
      name: name.trim(),
      handle: handle.trim(),
      description: description.trim(),
      status,
      ...(parentCategoryId === 'NONE' ? {} : { parentCategoryId }),
      position,
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => !props.saving && props.onOpenChange(open)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{props.item ? `Edit ${noun}` : `Create ${noun}`}</DialogTitle>
          <DialogDescription>
            {props.categoryMode
              ? 'Categories build the store browsing tree. A child category appears below its parent.'
              : props.kind === 'OCCASION'
                ? 'Occasions describe when a product is suitable, such as Wedding, Eid, or Party.'
                : props.kind === 'COLLECTION'
                  ? 'Collections group products for merchandising, campaigns, or seasonal events.'
                  : 'Tags are flexible internal labels that help teams find and group products.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" id="classification-form" onSubmit={submit}>
          {props.error ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {props.error}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="classification-name">Name</Label>
            <Input
              autoFocus
              id="classification-name"
              maxLength={160}
              placeholder={props.categoryMode ? 'Example: Evening Dresses' : `Example: ${noun}`}
              required
              value={name}
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                if (!handleEdited) setHandle(slugify(next));
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="classification-slug" title="A short, URL-safe identifier.">
              Slug
            </Label>
            <Input
              id="classification-slug"
              maxLength={160}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              placeholder="evening-dresses"
              required
              title="Use lowercase letters, numbers, and single hyphens."
              value={handle}
              onChange={(event) => {
                setHandleEdited(true);
                setHandle(event.target.value.toLowerCase());
              }}
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs and integrations. Changing a category slug keeps redirect history.
            </p>
          </div>
          {!props.categoryMode ? (
            <div className="grid gap-2">
              <Label htmlFor="classification-description">Description</Label>
              <Textarea
                id="classification-description"
                maxLength={1000}
                placeholder="Explain when your team should use this label."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          ) : null}
          {props.categoryMode ? (
            <div className="grid gap-2">
              <Label
                htmlFor="classification-parent"
                title="Leave empty to create a top-level category."
              >
                Parent category
              </Label>
              <Select
                value={parentCategoryId}
                onValueChange={(value) => setParentCategoryId(value ?? 'NONE')}
              >
                <SelectTrigger id="classification-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No parent — top level</SelectItem>
                  {props.categories
                    .filter((category) => !invalidParentIds.has(category.id))
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.path}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="classification-status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as CatalogCategoryStatusDto)}
              >
                <SelectTrigger id="classification-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {props.categoryMode || props.kind === 'COLLECTION' ? (
              <div className="grid gap-2">
                <Label htmlFor="classification-position" title="Smaller numbers appear first.">
                  Display order
                </Label>
                <Input
                  id="classification-position"
                  min={0}
                  required
                  type="number"
                  value={position}
                  onChange={(event) => setPosition(Math.max(0, Number(event.target.value) || 0))}
                />
              </div>
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button
            disabled={props.saving}
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={props.saving} form="classification-form" type="submit">
            {props.saving ? 'Saving…' : props.item ? 'Save changes' : `Create ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
