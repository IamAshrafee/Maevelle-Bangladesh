'use client';

import { Archive, ListTree, Pencil, Plus } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type {
  CatalogAttributeDefinitionDto,
  CatalogAttributeScopeDto,
  CatalogAttributeValueTypeDto,
  CatalogDefinitionStatusDto,
  CatalogProductTypeDefinitionDto,
  CatalogReferenceOptionDto,
} from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
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

import { classificationRequest, slugify } from '../catalog-classification/classification-api';

type Editor =
  | { readonly kind: 'TYPE'; readonly item?: CatalogProductTypeDefinitionDto }
  | {
      readonly kind: 'ATTRIBUTE';
      readonly productType: CatalogProductTypeDefinitionDto;
      readonly item?: CatalogAttributeDefinitionDto;
    }
  | {
      readonly kind: 'OPTION';
      readonly attribute: CatalogAttributeDefinitionDto;
      readonly item?: CatalogReferenceOptionDto;
    };

function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function TypeDialog(props: {
  editor: Extract<Editor, { kind: 'TYPE' }>;
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
                  <SelectValue />
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

function parseReferenceOptions(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, position) => {
      const separator = line.indexOf('|');
      const label = separator >= 0 ? line.slice(separator + 1).trim() : line;
      const code = separator >= 0 ? line.slice(0, separator).trim().toLowerCase() : slugify(line);
      return { code, label, position };
    });
}

function AttributeDialog(props: {
  editor: Extract<Editor, { kind: 'ATTRIBUTE' }>;
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
    <Dialog open onOpenChange={(open) => !open && !props.saving && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit attribute' : `Add attribute to ${props.editor.productType.name}`}
          </DialogTitle>
          <DialogDescription>
            Attributes capture reusable structured facts for Products or their Variants.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" id="attribute-form" onSubmit={(event) => void submit(event)}>
          <ErrorNotice message={props.error} />
          <div className="grid gap-2">
            <Label htmlFor="attribute-name">Name</Label>
            <Input
              autoFocus
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'REFERENCE'] as const).map(
                    (type) => (
                      <SelectItem key={type} value={type}>
                        {type.toLowerCase()}
                      </SelectItem>
                    ),
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
                  <SelectValue />
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
                  <SelectValue />
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
              Code, value type, and scope stay immutable so existing structured values remain valid.
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button disabled={props.saving} type="button" variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={props.saving} form="attribute-form" type="submit">
            {props.saving ? 'Saving…' : item ? 'Save attribute' : 'Add attribute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionDialog(props: {
  editor: Extract<Editor, { kind: 'OPTION' }>;
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
                    <SelectValue />
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

export function ProductTypeManager(props: {
  disabled?: boolean;
  compact?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [definitions, setDefinitions] = useState<readonly CatalogProductTypeDefinitionDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editor, setEditor] = useState<Editor>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = useMemo(
    () => definitions.find((definition) => definition.id === selectedId) ?? definitions[0],
    [definitions, selectedId],
  );

  async function load() {
    setLoading(true);
    try {
      const next = await classificationRequest<readonly CatalogProductTypeDefinitionDto[]>(
        '/admin/catalog/product-type-definitions',
      );
      setDefinitions(next);
      setSelectedId((current) =>
        next.some((item) => item.id === current) ? current : (next[0]?.id ?? ''),
      );
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Product Types.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open]);

  async function saved(operation: () => Promise<unknown>) {
    setSaving(true);
    try {
      await operation();
      await load();
      await props.onChanged();
      setEditor(undefined);
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The Product Type change could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        disabled={props.disabled}
        size={props.compact ? 'sm' : 'default'}
        title={
          props.disabled
            ? 'Save or discard the current Product draft before managing Product Types.'
            : undefined
        }
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <ListTree /> Manage Product Types
      </Button>
      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b p-5 pr-12">
            <DialogTitle>Product Types and attributes</DialogTitle>
            <DialogDescription>
              Define reusable structured data, publishing requirements, filters, and normalized
              selectors.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 md:grid-cols-[16rem_1fr]">
            <aside className="max-h-[70vh] overflow-y-auto border-r bg-muted/30 p-3">
              <Button
                className="mb-3 w-full"
                size="sm"
                type="button"
                onClick={() => setEditor({ kind: 'TYPE' })}
              >
                <Plus /> New Product Type
              </Button>
              <div className="grid gap-2">
                {definitions.map((definition) => (
                  <button
                    className={`rounded-lg border p-3 text-left transition-colors ${selected?.id === definition.id ? 'border-primary bg-background' : 'bg-background/60 hover:bg-background'}`}
                    key={definition.id}
                    type="button"
                    onClick={() => setSelectedId(definition.id)}
                  >
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {definition.name}
                      {definition.status === 'ARCHIVED' ? (
                        <Archive className="size-3.5 text-muted-foreground" />
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {definition.code} · {definition.productCount} Products ·{' '}
                      {definition.attributes.length} fields
                    </span>
                  </button>
                ))}
                {!loading && definitions.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    Create the first Product Type to structure your catalog.
                  </p>
                ) : null}
              </div>
            </aside>
            <section className="max-h-[70vh] overflow-y-auto p-5">
              <ErrorNotice message={error} />
              {loading && definitions.length === 0 ? (
                <p className="text-muted-foreground">Loading definitions…</p>
              ) : null}
              {selected ? (
                <div className="grid gap-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold">{selected.name}</h3>
                        <Badge variant={selected.status === 'ACTIVE' ? 'secondary' : 'outline'}>
                          {selected.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selected.code} · {selected.productCount} connected Products
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => setEditor({ kind: 'TYPE', item: selected })}
                      >
                        <Pencil /> Edit type
                      </Button>
                      <Button
                        disabled={selected.status !== 'ACTIVE'}
                        size="sm"
                        type="button"
                        onClick={() => setEditor({ kind: 'ATTRIBUTE', productType: selected })}
                      >
                        <Plus /> Add attribute
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {selected.attributes.map((attribute) => (
                      <article className="rounded-xl border p-4" key={attribute.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-medium">{attribute.name}</h4>
                              <Badge variant="outline">{attribute.valueType.toLowerCase()}</Badge>
                              <Badge variant="outline">{attribute.scope.toLowerCase()}</Badge>
                              {attribute.required ? (
                                <Badge variant="secondary">required</Badge>
                              ) : null}
                              {attribute.status === 'ARCHIVED' ? (
                                <Badge variant="outline">archived</Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {attribute.code} · {attribute.valueCount} stored values
                              {attribute.filterable ? ' · filterable' : ''}
                              {attribute.searchable ? ' · searchable' : ''}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setEditor({
                                kind: 'ATTRIBUTE',
                                productType: selected,
                                item: attribute,
                              })
                            }
                          >
                            <Pencil /> Edit
                          </Button>
                        </div>
                        {attribute.valueType === 'REFERENCE' ? (
                          <div className="mt-4 rounded-lg bg-muted/40 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <strong className="text-sm">Selector options</strong>
                              <Button
                                disabled={attribute.status !== 'ACTIVE'}
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => setEditor({ kind: 'OPTION', attribute })}
                              >
                                <Plus /> Add option
                              </Button>
                            </div>
                            <div className="grid gap-1">
                              {attribute.referenceOptions.map((option) => (
                                <button
                                  className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-background"
                                  key={option.id}
                                  type="button"
                                  onClick={() =>
                                    setEditor({ kind: 'OPTION', attribute, item: option })
                                  }
                                >
                                  <span>
                                    <span className="font-medium">{option.label}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {option.code} · {option.selectionCount} uses
                                    </span>
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {option.status.toLowerCase()} · order {option.position}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}
                    {selected.attributes.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                        No structured attributes yet. Add Product or Variant fields to this type.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </DialogContent>
      </Dialog>
      {editor?.kind === 'TYPE' ? (
        <TypeDialog
          editor={editor}
          error={error}
          saving={saving}
          onClose={() => setEditor(undefined)}
          onSaved={saved}
        />
      ) : editor?.kind === 'ATTRIBUTE' ? (
        <AttributeDialog
          editor={editor}
          error={error}
          saving={saving}
          onClose={() => setEditor(undefined)}
          onSaved={saved}
        />
      ) : editor?.kind === 'OPTION' ? (
        <OptionDialog
          editor={editor}
          error={error}
          saving={saving}
          onClose={() => setEditor(undefined)}
          onSaved={saved}
        />
      ) : null}
    </>
  );
}
