'use client';

import { Archive, ListTree, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { CatalogProductTypeDefinitionDto } from '@maevelle/contracts';

import { classificationRequest } from '@/components/catalog-classification/classification-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { AttributeDialog } from './attribute-dialog';
import { ProductTypeDialog } from './product-type-dialog';
import { ErrorNotice } from './error-notice';
import type { ProductTypeEditor } from './product-type-types';
import { ReferenceOptionDialog } from './reference-option-dialog';

export function ProductTypeManager(props: {
  disabled?: boolean;
  compact?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [definitions, setDefinitions] = useState<readonly CatalogProductTypeDefinitionDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editor, setEditor] = useState<ProductTypeEditor>();
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
        <ProductTypeDialog
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
        <ReferenceOptionDialog
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
