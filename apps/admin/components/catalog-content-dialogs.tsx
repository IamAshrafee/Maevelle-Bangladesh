'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';

import type {
  CatalogContentFaqValues,
  CatalogContentGroupValues,
} from '@/components/catalog-content-state';
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
import { Textarea } from '@/components/ui/textarea';

export interface GroupEditorState {
  readonly isNew: boolean;
  readonly original: string;
  readonly draft: CatalogContentGroupValues;
}

export interface FaqEditorState {
  readonly isNew: boolean;
  readonly original: string;
  readonly draft: CatalogContentFaqValues;
}

export interface SeoEditorState {
  readonly original: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

interface InformationGroupDialogProps {
  readonly editor: GroupEditorState | undefined;
  readonly error: string;
  readonly onCancel: () => void;
  readonly onChange: (editor: GroupEditorState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function dialogKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function InformationGroupDialog({
  editor,
  error,
  onCancel,
  onChange,
  onSubmit,
}: InformationGroupDialogProps) {
  return (
    <Sheet open={Boolean(editor)} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle>
            {editor?.isNew ? 'Add information group' : 'Edit information group'}
          </SheetTitle>
          <SheetDescription>
            Group related facts so customers can scan them quickly on the Product page.
          </SheetDescription>
        </SheetHeader>
        {editor ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="content-group-title">Group title</Label>
                <Input
                  id="content-group-title"
                  maxLength={120}
                  required
                  value={editor.draft.title}
                  placeholder="Materials & care"
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      draft: { ...editor.draft, title: event.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-3">
                {editor.draft.items.map((item, index) => (
                  <div
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]"
                    key={item.key}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={`content-label-${item.key}`}>Label</Label>
                      <Input
                        id={`content-label-${item.key}`}
                        maxLength={120}
                        required
                        value={item.label}
                        placeholder="Material"
                        onChange={(event) =>
                          onChange({
                            ...editor,
                            draft: {
                              ...editor.draft,
                              items: editor.draft.items.map((current) =>
                                current.key === item.key
                                  ? { ...current, label: event.target.value }
                                  : current,
                              ),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`content-value-${item.key}`}>Customer-facing value</Label>
                      <Textarea
                        id={`content-value-${item.key}`}
                        maxLength={2000}
                        required
                        value={item.value}
                        placeholder="100% organic cotton"
                        onChange={(event) =>
                          onChange({
                            ...editor,
                            draft: {
                              ...editor.draft,
                              items: editor.draft.items.map((current) =>
                                current.key === item.key
                                  ? { ...current, value: event.target.value }
                                  : current,
                              ),
                            },
                          })
                        }
                      />
                    </div>
                    <Button
                      className="self-end"
                      aria-label={`Remove detail ${index + 1}`}
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={editor.draft.items.length === 1}
                      onClick={() =>
                        onChange({
                          ...editor,
                          draft: {
                            ...editor.draft,
                            items: editor.draft.items.filter((current) => current.key !== item.key),
                          },
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={editor.draft.items.length >= 24}
                onClick={() =>
                  onChange({
                    ...editor,
                    draft: {
                      ...editor.draft,
                      items: [
                        ...editor.draft.items,
                        { key: dialogKey('item'), label: '', value: '' },
                      ],
                    },
                  })
                }
              >
                <Plus /> Add detail
              </Button>
            </div>
            <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit">Apply to draft</Button>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface CustomerFaqDialogProps {
  readonly editor: FaqEditorState | undefined;
  readonly error: string;
  readonly onCancel: () => void;
  readonly onChange: (editor: FaqEditorState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CustomerFaqDialog({
  editor,
  error,
  onCancel,
  onChange,
  onSubmit,
}: CustomerFaqDialogProps) {
  return (
    <Sheet open={Boolean(editor)} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle>{editor?.isNew ? 'Add customer FAQ' : 'Edit customer FAQ'}</SheetTitle>
          <SheetDescription>
            Use the wording a customer would naturally ask, then give a direct and complete answer.
          </SheetDescription>
        </SheetHeader>
        {editor ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="faq-question">Question</Label>
                <Input
                  id="faq-question"
                  maxLength={300}
                  required
                  value={editor.draft.question}
                  placeholder="Is this true to size?"
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      draft: { ...editor.draft, question: event.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="faq-answer">Answer</Label>
                <Textarea
                  id="faq-answer"
                  maxLength={3000}
                  required
                  rows={5}
                  value={editor.draft.answer}
                  placeholder="Yes. Choose your usual Maevelle size…"
                  onChange={(event) =>
                    onChange({ ...editor, draft: { ...editor.draft, answer: event.target.value } })
                  }
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit">Apply to draft</Button>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface SearchPreviewDialogProps {
  readonly editor: SeoEditorState | undefined;
  readonly productDescription: string;
  readonly productTitle: string;
  readonly onCancel: () => void;
  readonly onChange: (editor: SeoEditorState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SearchPreviewDialog({
  editor,
  productDescription,
  productTitle,
  onCancel,
  onChange,
  onSubmit,
}: SearchPreviewDialogProps) {
  return (
    <Sheet open={Boolean(editor)} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle>Edit search preview</SheetTitle>
          <SheetDescription>
            Overrides are optional. Keep the title concise and describe the Product benefit without
            keyword stuffing.
          </SheetDescription>
        </SheetHeader>
        {editor ? (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="space-y-1.5">
                <div className="flex justify-between gap-3">
                  <Label htmlFor="seo-title">Search title</Label>
                  <span className="text-xs text-muted-foreground">
                    {editor.seoTitle.length}/180 · about 60 recommended
                  </span>
                </div>
                <Input
                  id="seo-title"
                  maxLength={180}
                  value={editor.seoTitle}
                  placeholder={productTitle}
                  onChange={(event) => onChange({ ...editor, seoTitle: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between gap-3">
                  <Label htmlFor="seo-description">Search description</Label>
                  <span className="text-xs text-muted-foreground">
                    {editor.seoDescription.length}/500 · about 160 recommended
                  </span>
                </div>
                <Textarea
                  id="seo-description"
                  maxLength={500}
                  rows={4}
                  value={editor.seoDescription}
                  placeholder={productDescription || 'Describe the Product and its customer value.'}
                  onChange={(event) => onChange({ ...editor, seoDescription: event.target.value })}
                />
              </div>
            </div>
            <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit">Apply to draft</Button>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
