'use client';

import { FileQuestion, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { CatalogAttributeDefinitionDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { FaqEntry, InformationGroupEntry } from './types';

interface CustomerDetailsCardProps {
  readonly attributes: readonly CatalogAttributeDefinitionDto[];
  readonly attributeValues: Record<string, string | boolean | null>;
  readonly informationGroups: readonly InformationGroupEntry[];
  readonly faqs: readonly FaqEntry[];
  readonly error?: string | undefined;
  readonly onAddGroup: (title?: string) => void;
  readonly onUpdateGroupTitle: (groupId: string, title: string) => void;
  readonly onRemoveGroup: (groupId: string) => void;
  readonly onAddItem: (groupId: string) => void;
  readonly onUpdateItem: (
    groupId: string,
    itemId: string,
    field: 'label' | 'value',
    value: string,
  ) => void;
  readonly onRemoveItem: (groupId: string, itemId: string) => void;
  readonly onAddFaq: () => void;
  readonly onUpdateFaq: (id: string, field: 'question' | 'answer', value: string) => void;
  readonly onRemoveFaq: (id: string) => void;
}

function displayAttributeValue(
  attribute: CatalogAttributeDefinitionDto,
  value: string | boolean | null | undefined,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (attribute.valueType === 'REFERENCE') {
    return attribute.referenceOptions.find((option) => option.id === value)?.label ?? value;
  }
  return value;
}

export function CustomerDetailsCard({
  attributes,
  attributeValues,
  informationGroups,
  faqs,
  error,
  onAddGroup,
  onUpdateGroupTitle,
  onRemoveGroup,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onAddFaq,
  onUpdateFaq,
  onRemoveFaq,
}: CustomerDetailsCardProps) {
  const keyAttributes = attributes.flatMap((attribute) => {
    const value = displayAttributeValue(attribute, attributeValues[attribute.id]);
    return value ? [{ id: attribute.id, label: attribute.name, value }] : [];
  });

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">
              Customer details, specs &amp; FAQ
            </CardTitle>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={informationGroups.length >= 12}
            onClick={() => onAddGroup()}
          >
            <Plus className="size-3.5" /> Add group
          </Button>
        </div>
        <CardDescription>
          Build the grouped specification table customers see on the product page. Classification
          attributes stay authoritative and appear first.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
        <section className="space-y-3 rounded-xl border border-primary/20 bg-primary-subtle p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Key Attributes</h3>
              <p className="text-[11px] text-muted-foreground">
                Live preview from the classification section above.
              </p>
            </div>
            <Badge variant="outline">Automatic</Badge>
          </div>
          {keyAttributes.length > 0 ? (
            <dl className="overflow-hidden rounded-lg border border-border bg-card">
              {keyAttributes.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 border-t border-border px-3 py-2 text-xs first:border-t-0"
                >
                  <dt className="font-medium text-muted-foreground">{item.label}</dt>
                  <dd className="m-0 text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-card p-3 text-xs text-muted-foreground">
              Complete classification attributes to preview them here. Unknown values are omitted
              instead of shown as “No.”
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full gap-1.5"
            disabled={
              (informationGroups.find(
                (group) => group.title.trim().toLocaleLowerCase('en') === 'key attributes',
              )?.items.length ?? 0) >= 24 ||
              (!informationGroups.some(
                (group) => group.title.trim().toLocaleLowerCase('en') === 'key attributes',
              ) &&
                informationGroups.length >= 12)
            }
            onClick={() => onAddGroup('Key Attributes')}
          >
            <Plus className="size-3.5" /> Add a custom row to Key Attributes
          </Button>
        </section>

        <section className="space-y-4">
          {informationGroups.map((group, groupIndex) => (
            <article key={group.id} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Group ${groupIndex + 1} name`}
                  maxLength={120}
                  value={group.title}
                  placeholder="Group name, e.g. Materials & Care"
                  onChange={(event) => onUpdateGroupTitle(group.id, event.target.value)}
                  className="font-semibold"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${group.title || `group ${groupIndex + 1}`}`}
                  className="size-9 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveGroup(group.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_2.25rem]"
                  >
                    <Input
                      aria-label="Specification label"
                      maxLength={120}
                      value={item.label}
                      placeholder="Label, e.g. Fabric"
                      onChange={(event) =>
                        onUpdateItem(group.id, item.id, 'label', event.target.value)
                      }
                    />
                    <Input
                      aria-label="Specification value"
                      maxLength={2000}
                      value={item.value}
                      placeholder="Value, e.g. Mulberry silk"
                      onChange={(event) =>
                        onUpdateItem(group.id, item.id, 'value', event.target.value)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${item.label || 'row'}`}
                      className="size-9 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveItem(group.id, item.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
                {group.items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No rows yet.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={group.items.length >= 24}
                onClick={() => onAddItem(group.id)}
              >
                <Plus className="size-3.5" /> Add key &amp; value
              </Button>
            </article>
          ))}
          {informationGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                No custom information groups yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add groups such as Materials &amp; Care, Dimensions, Packaging, or What’s Included.
              </p>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileQuestion className="size-4 text-primary" />
                <Label className="text-sm font-semibold">Frequently asked questions</Label>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Answer product-specific questions about fit, care, delivery or use.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={faqs.length >= 30}
              onClick={onAddFaq}
            >
              <Plus className="size-3.5" /> Add FAQ
            </Button>
          </div>
          {faqs.map((faq) => (
            <div key={faq.id} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="FAQ question"
                  maxLength={300}
                  value={faq.question}
                  placeholder="Question"
                  onChange={(event) => onUpdateFaq(faq.id, 'question', event.target.value)}
                  className="font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove FAQ"
                  className="size-9 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveFaq(faq.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Textarea
                aria-label="FAQ answer"
                rows={3}
                maxLength={3000}
                value={faq.answer}
                placeholder="Answer"
                onChange={(event) => onUpdateFaq(faq.id, 'answer', event.target.value)}
              />
            </div>
          ))}
        </section>
      </CardContent>
    </Card>
  );
}
