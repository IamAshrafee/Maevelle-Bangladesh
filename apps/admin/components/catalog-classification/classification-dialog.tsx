'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type {
  CatalogCategoryDto,
  CatalogCategoryStatusDto,
  CatalogVocabularyItemDto,
  CatalogVocabularyKindDto,
} from '@maevelle/contracts';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

import { slugify } from './classification-api';

type EditableItem = CatalogCategoryDto | CatalogVocabularyItemDto;

export interface ClassificationFormValue {
  readonly name: string;
  readonly handle: string;
  readonly description?: string;
  readonly status: CatalogCategoryStatusDto;
  readonly parentCategoryId?: string;
  readonly defaultSizeGuideId?: string | null;
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
  sizeGuides?: readonly { readonly id: string; readonly name: string }[];
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
  const [defaultSizeGuideId, setDefaultSizeGuideId] = useState('NONE');
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
    setDefaultSizeGuideId(category?.defaultSizeGuideId ?? 'NONE');
    setPosition(props.item?.position ?? 0);
  }, [props.item, props.open]);

  const noun = props.categoryMode ? 'category' : kindNames[props.kind];
  const editedCategory = props.item && 'path' in props.item ? props.item : undefined;
  const editedVocabulary = props.item && 'kind' in props.item ? props.item : undefined;

  const isDirty = props.item
    ? name !== props.item.name ||
      handle !== props.item.handle ||
      description !== (editedVocabulary?.description ?? '') ||
      status !== props.item.status ||
      (editedCategory && parentCategoryId !== (editedCategory.parentCategoryId ?? 'NONE'))
    : Boolean(name.trim() || handle.trim() || description.trim() || parentCategoryId !== 'NONE');

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    isDirty,
    isSubmitting: props.saving,
    onClose: () => props.onOpenChange(false),
    confirmTitle: props.item ? `Discard changes to ${noun}?` : `Discard new ${noun}?`,
    confirmDescription: `You have unsaved changes in this ${noun} form. Closing now will discard them.`,
  });

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
      defaultSizeGuideId: defaultSizeGuideId === 'NONE' ? null : defaultSizeGuideId,
      position,
    });
  }

  return (
    <>
      <Sheet open={props.open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle>{props.item ? `Edit ${noun}` : `Create ${noun}`}</SheetTitle>
          <SheetDescription>
            {props.categoryMode
              ? 'Categories build the store browsing tree. A child category appears below its parent.'
              : props.kind === 'OCCASION'
                ? 'Occasions describe when a product is suitable, such as Wedding, Eid, or Party.'
                : props.kind === 'COLLECTION'
                  ? 'Collections group products for merchandising, campaigns, or seasonal events.'
                  : 'Tags are flexible internal labels that help teams find and group products.'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <form className="grid gap-5" id="classification-form" onSubmit={submit}>
            {props.error ? (
              <Alert variant="destructive">
                <AlertDescription>{props.error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="classification-name">Name</FieldLabel>
              <Input
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
            </Field>
            <Field>
              <FieldLabel htmlFor="classification-handle">Slug</FieldLabel>
              <Input
                id="classification-handle"
                maxLength={160}
                placeholder="example-name"
                required
                value={handle}
                onChange={(event) => {
                  setHandleEdited(true);
                  setHandle(slugify(event.target.value));
                }}
              />
              <FieldDescription>A unique, URL-safe identifier for this item.</FieldDescription>
            </Field>
            {!props.categoryMode ? (
              <Field>
                <FieldLabel htmlFor="classification-description">Description</FieldLabel>
                <Textarea
                  id="classification-description"
                  maxLength={1000}
                  placeholder={`A helpful description for this ${noun}…`}
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <FieldDescription>
                  Visible to buyers when browsing collections or used by merchandisers internally.
                </FieldDescription>
              </Field>
            ) : null}
            {props.categoryMode ? (
              <>
                <Field>
                  <FieldLabel htmlFor="classification-parent">Parent category</FieldLabel>
                  <Select
                    value={parentCategoryId}
                    onValueChange={(value) => setParentCategoryId(value ?? 'NONE')}
                  >
                    <SelectTrigger id="classification-parent">
                      <SelectValue placeholder="Select parent category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No parent — top level</SelectItem>
                      {props.categories
                        .filter((category) => !invalidParentIds.has(category.id))
                        .map((category) => (
                          <SelectItem key={category.id} value={category.id} label={category.path}>
                            {category.path}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Select a parent category to nest under, or leave as top-level.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="classification-size-guide">Default Size Guide</FieldLabel>
                  <Select
                    value={defaultSizeGuideId}
                    onValueChange={(value) => setDefaultSizeGuideId(value ?? 'NONE')}
                  >
                    <SelectTrigger id="classification-size-guide">
                      <SelectValue placeholder="No default size guide" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None / Inherit from parent</SelectItem>
                      {props.sizeGuides?.map((guide) => (
                        <SelectItem key={guide.id} value={guide.id} label={guide.name}>
                          {guide.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Products in this category inherit this size guide unless specifically
                    overridden.
                  </FieldDescription>
                </Field>
              </>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="classification-status">Status</FieldLabel>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as CatalogCategoryStatusDto)}
                >
                  <SelectTrigger id="classification-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {props.categoryMode || props.kind === 'COLLECTION' ? (
                <Field>
                  <FieldLabel htmlFor="classification-position">Display order</FieldLabel>
                  <Input
                    id="classification-position"
                    min={0}
                    required
                    type="number"
                    value={position}
                    onChange={(event) => setPosition(Math.max(0, Number(event.target.value) || 0))}
                  />
                  <FieldDescription>Smaller numbers appear first.</FieldDescription>
                </Field>
              ) : null}
            </div>
          </form>
        </div>
        <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
          <Button
            disabled={props.saving}
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={props.saving} form="classification-form" type="submit">
            {props.saving ? 'Saving…' : props.item ? 'Save changes' : `Create ${noun}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    {discardConfirmDialog}
  </>
);
}
