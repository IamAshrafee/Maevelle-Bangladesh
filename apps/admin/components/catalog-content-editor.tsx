'use client';

import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import {
  type CatalogContentConflict,
  type CatalogContentFaqValues,
  type CatalogContentGroupValues,
  type CatalogContentValues,
} from '@/components/catalog-content-state';
import {
  CustomerFaqDialog,
  InformationGroupDialog,
  SearchPreviewDialog,
  type FaqEditorState,
  type GroupEditorState,
  type SeoEditorState,
} from '@/components/catalog-content-dialogs';
import { Button } from '@/components/ui/button';

interface CatalogContentEditorProps {
  readonly productTitle: string;
  readonly productDescription: string;
  readonly handle: string;
  readonly draft: CatalogContentValues;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly error: string;
  readonly conflicts: readonly CatalogContentConflict[];
  readonly onChange: (content: CatalogContentValues) => void;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onResolveConflicts: (choice: 'LOCAL' | 'CURRENT') => void;
  readonly onTransientDirtyChange: (dirty: boolean) => void;
}

function newKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): readonly T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function hasUnsavedDialogChanges(original: string, value: unknown): boolean {
  return original !== JSON.stringify(value);
}

export function CatalogContentEditor({
  productTitle,
  productDescription,
  handle,
  draft,
  dirty,
  busy,
  error,
  conflicts,
  onChange,
  onSave,
  onDiscard,
  onResolveConflicts,
  onTransientDirtyChange,
}: CatalogContentEditorProps) {
  const [groupEditor, setGroupEditor] = useState<GroupEditorState>();
  const [groupError, setGroupError] = useState('');
  const [faqEditor, setFaqEditor] = useState<FaqEditorState>();
  const [faqError, setFaqError] = useState('');
  const [seoEditor, setSeoEditor] = useState<SeoEditorState>();

  const transientDirty = Boolean(
    (groupEditor && hasUnsavedDialogChanges(groupEditor.original, groupEditor.draft)) ||
    (faqEditor && hasUnsavedDialogChanges(faqEditor.original, faqEditor.draft)) ||
    (seoEditor &&
      hasUnsavedDialogChanges(seoEditor.original, {
        seoTitle: seoEditor.seoTitle,
        seoDescription: seoEditor.seoDescription,
      })),
  );

  useEffect(() => {
    onTransientDirtyChange(transientDirty);
    return () => onTransientDirtyChange(false);
  }, [onTransientDirtyChange, transientDirty]);

  function openGroup(group?: CatalogContentGroupValues) {
    const value = group ?? {
      key: newKey('group'),
      title: '',
      items: [{ key: newKey('item'), label: '', value: '' }],
    };
    setGroupEditor({ isNew: !group, original: JSON.stringify(value), draft: value });
    setGroupError('');
  }

  function closeGroup() {
    if (
      groupEditor &&
      hasUnsavedDialogChanges(groupEditor.original, groupEditor.draft) &&
      !window.confirm('Discard the unsaved information group?')
    )
      return;
    setGroupEditor(undefined);
    setGroupError('');
  }

  function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupEditor) return;
    const group = {
      ...groupEditor.draft,
      title: groupEditor.draft.title.trim(),
      items: groupEditor.draft.items.map((item) => ({
        ...item,
        label: item.label.trim(),
        value: item.value.trim(),
      })),
    };
    if (!group.title || group.items.some((item) => !item.label || !item.value)) {
      setGroupError('Add a title, label, and customer-facing value for every item.');
      return;
    }
    const labels = group.items.map((item) => item.label.toLocaleLowerCase('en'));
    if (new Set(labels).size !== labels.length) {
      setGroupError('Each label in this information group must be unique.');
      return;
    }
    const nextGroups = draft.informationGroups.some((item) => item.key === group.key)
      ? draft.informationGroups.map((item) => (item.key === group.key ? group : item))
      : [...draft.informationGroups, group];
    const titles = nextGroups.map((item) => item.title.toLocaleLowerCase('en'));
    if (new Set(titles).size !== titles.length) {
      setGroupError('Each information group title must be unique.');
      return;
    }
    onChange({ ...draft, informationGroups: nextGroups });
    setGroupEditor(undefined);
    setGroupError('');
  }

  function openFaq(faq?: CatalogContentFaqValues) {
    const value = faq ?? { key: newKey('faq'), question: '', answer: '' };
    setFaqEditor({ isNew: !faq, original: JSON.stringify(value), draft: value });
    setFaqError('');
  }

  function closeFaq() {
    if (
      faqEditor &&
      hasUnsavedDialogChanges(faqEditor.original, faqEditor.draft) &&
      !window.confirm('Discard the unsaved FAQ?')
    )
      return;
    setFaqEditor(undefined);
    setFaqError('');
  }

  function saveFaq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!faqEditor) return;
    const faq = {
      ...faqEditor.draft,
      question: faqEditor.draft.question.trim(),
      answer: faqEditor.draft.answer.trim(),
    };
    if (!faq.question || !faq.answer) {
      setFaqError('Add both the customer question and its answer.');
      return;
    }
    const nextFaqs = draft.faqs.some((item) => item.key === faq.key)
      ? draft.faqs.map((item) => (item.key === faq.key ? faq : item))
      : [...draft.faqs, faq];
    const questions = nextFaqs.map((item) => item.question.toLocaleLowerCase('en'));
    if (new Set(questions).size !== questions.length) {
      setFaqError('Each FAQ question must be unique.');
      return;
    }
    onChange({ ...draft, faqs: nextFaqs });
    setFaqEditor(undefined);
    setFaqError('');
  }

  function openSeo() {
    setSeoEditor({
      original: JSON.stringify({ seoTitle: draft.seoTitle, seoDescription: draft.seoDescription }),
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
    });
  }

  function closeSeo() {
    if (
      seoEditor &&
      hasUnsavedDialogChanges(seoEditor.original, {
        seoTitle: seoEditor.seoTitle,
        seoDescription: seoEditor.seoDescription,
      }) &&
      !window.confirm('Discard the unsaved search preview changes?')
    )
      return;
    setSeoEditor(undefined);
  }

  function saveSeo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seoEditor) return;
    onChange({
      ...draft,
      seoTitle: seoEditor.seoTitle.trim(),
      seoDescription: seoEditor.seoDescription.trim(),
    });
    setSeoEditor(undefined);
  }

  const searchTitle = draft.seoTitle.trim() || productTitle;
  const searchDescription = draft.seoDescription.trim() || productDescription;

  return (
    <section className="space-y-5 rounded-xl border bg-card p-4" id="content">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Customer content
          </p>
          <h3 className="mt-1 text-lg font-semibold">Information, FAQs & search preview</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Build scannable Product details, answer buying questions, and control how this Product
            appears in search results. Changes remain drafts until you save this section.
          </p>
        </div>
        <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {draft.informationGroups.length} groups · {draft.faqs.length} FAQs
        </span>
      </div>

      {conflicts.length > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="alert"
        >
          <strong>
            Another operator changed {conflicts.map((item) => item.label).join(', ')}.
          </strong>
          <p className="mt-1">Choose which values to keep before saving this section.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onResolveConflicts('LOCAL')}>
              Keep my draft
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onResolveConflicts('CURRENT')}
            >
              Use current saved values
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 font-semibold">
                <FileText className="size-4" /> Product information
              </h4>
              <p className="text-xs text-muted-foreground">
                Materials, care, fit, origin, and other structured facts.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={draft.informationGroups.length >= 12}
              onClick={() => openGroup()}
            >
              <Plus /> Add group
            </Button>
          </div>
          {draft.informationGroups.length === 0 ? (
            <button
              className="w-full rounded-lg border border-dashed p-6 text-left text-sm text-muted-foreground hover:bg-muted/50"
              type="button"
              onClick={() => openGroup()}
            >
              <strong className="block text-foreground">No structured details yet</strong>
              Add a customer-friendly group such as Materials & care.
            </button>
          ) : (
            <div className="space-y-2">
              {draft.informationGroups.map((group, index) => (
                <article className="rounded-lg border bg-background p-3" key={group.key}>
                  <div className="flex items-start gap-2">
                    <GripVertical
                      className="mt-1 size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate">{group.title}</strong>
                      <p className="text-xs text-muted-foreground">
                        {group.items.length} detail{group.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Button
                      aria-label={`Move ${group.title} up`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() =>
                        onChange({
                          ...draft,
                          informationGroups: moveItem(draft.informationGroups, index, -1),
                        })
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      aria-label={`Move ${group.title} down`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === draft.informationGroups.length - 1}
                      onClick={() =>
                        onChange({
                          ...draft,
                          informationGroups: moveItem(draft.informationGroups, index, 1),
                        })
                      }
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      aria-label={`Edit ${group.title}`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openGroup(group)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={`Remove ${group.title}`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        onChange({
                          ...draft,
                          informationGroups: draft.informationGroups.filter(
                            (item) => item.key !== group.key,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 font-semibold">
                <CircleHelp className="size-4" /> Customer FAQs
              </h4>
              <p className="text-xs text-muted-foreground">
                Resolve common questions before they block purchase.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={draft.faqs.length >= 30}
              onClick={() => openFaq()}
            >
              <Plus /> Add FAQ
            </Button>
          </div>
          {draft.faqs.length === 0 ? (
            <button
              className="w-full rounded-lg border border-dashed p-6 text-left text-sm text-muted-foreground hover:bg-muted/50"
              type="button"
              onClick={() => openFaq()}
            >
              <strong className="block text-foreground">No customer FAQs yet</strong>
              Add questions about fit, care, availability, or delivery expectations.
            </button>
          ) : (
            <div className="space-y-2">
              {draft.faqs.map((faq, index) => (
                <article className="rounded-lg border bg-background p-3" key={faq.key}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate">{faq.question}</strong>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{faq.answer}</p>
                    </div>
                    <Button
                      aria-label={`Move ${faq.question} up`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => onChange({ ...draft, faqs: moveItem(draft.faqs, index, -1) })}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      aria-label={`Move ${faq.question} down`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === draft.faqs.length - 1}
                      onClick={() => onChange({ ...draft, faqs: moveItem(draft.faqs, index, 1) })}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      aria-label={`Edit ${faq.question}`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openFaq(faq)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={`Remove ${faq.question}`}
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        onChange({
                          ...draft,
                          faqs: draft.faqs.filter((item) => item.key !== faq.key),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="flex items-center gap-2 font-semibold">
              <Search className="size-4" /> Search preview
            </h4>
            <p className="text-xs text-muted-foreground">
              Blank overrides automatically fall back to the Product name and description.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={openSeo}>
            <Pencil /> Edit preview
          </Button>
        </div>
        <div className="mt-3 max-w-2xl rounded-lg bg-background p-3 ring-1 ring-border">
          <p className="truncate text-xs text-emerald-700">maevelle.com/products/{handle}</p>
          <strong className="mt-1 block truncate text-base text-blue-800">{searchTitle}</strong>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {searchDescription || 'Add a Product description or a dedicated search description.'}
          </p>
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {dirty ? 'Unsaved customer content changes' : 'Customer content is saved'}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={!dirty || busy} onClick={onDiscard}>
            Discard changes
          </Button>
          <Button type="button" disabled={!dirty || busy || conflicts.length > 0} onClick={onSave}>
            {busy ? 'Saving…' : 'Save customer content'}
          </Button>
        </div>
      </footer>

      <InformationGroupDialog
        editor={groupEditor}
        error={groupError}
        onCancel={closeGroup}
        onChange={setGroupEditor}
        onSubmit={saveGroup}
      />
      <CustomerFaqDialog
        editor={faqEditor}
        error={faqError}
        onCancel={closeFaq}
        onChange={setFaqEditor}
        onSubmit={saveFaq}
      />
      <SearchPreviewDialog
        editor={seoEditor}
        productDescription={productDescription}
        productTitle={productTitle}
        onCancel={closeSeo}
        onChange={setSeoEditor}
        onSubmit={saveSeo}
      />
    </section>
  );
}
