import type {
  CatalogProductContentUpdateDto,
  CatalogProductWorkspaceDto,
} from '@maevelle/contracts';

export type CatalogContentField = 'informationGroups' | 'faqs' | 'seoTitle' | 'seoDescription';

export interface CatalogContentItemValues {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface CatalogContentGroupValues {
  readonly key: string;
  readonly title: string;
  readonly items: readonly CatalogContentItemValues[];
}

export interface CatalogContentFaqValues {
  readonly key: string;
  readonly question: string;
  readonly answer: string;
}

export interface CatalogContentValues {
  readonly informationGroups: readonly CatalogContentGroupValues[];
  readonly faqs: readonly CatalogContentFaqValues[];
  readonly seoTitle: string;
  readonly seoDescription: string;
}

export interface CatalogContentConflict {
  readonly field: CatalogContentField;
  readonly label: string;
}

const contentFieldLabels: Record<CatalogContentField, string> = {
  informationGroups: 'Product information',
  faqs: 'Customer FAQs',
  seoTitle: 'Search title',
  seoDescription: 'Search description',
};

function contentFieldValue(content: CatalogContentValues, field: CatalogContentField): unknown {
  if (field === 'informationGroups')
    return content.informationGroups.map((group) => ({
      title: group.title,
      items: group.items.map((item) => ({ label: item.label, value: item.value })),
    }));
  if (field === 'faqs')
    return content.faqs.map((faq) => ({ question: faq.question, answer: faq.answer }));
  return content[field];
}

function sameContentField(
  left: CatalogContentValues,
  right: CatalogContentValues,
  field: CatalogContentField,
): boolean {
  return (
    JSON.stringify(contentFieldValue(left, field)) ===
    JSON.stringify(contentFieldValue(right, field))
  );
}

export function catalogContentFromWorkspace(
  workspace: CatalogProductWorkspaceDto,
): CatalogContentValues {
  return {
    informationGroups: workspace.content.informationGroups.map((group) => ({
      key: group.id,
      title: group.title,
      items: group.items.map((item) => ({ key: item.id, label: item.label, value: item.value })),
    })),
    faqs: workspace.content.faqs.map((faq) => ({
      key: faq.id,
      question: faq.question,
      answer: faq.answer,
    })),
    seoTitle: workspace.content.seoTitle ?? '',
    seoDescription: workspace.content.seoDescription ?? '',
  };
}

export function catalogContentPayload(
  content: CatalogContentValues,
): CatalogProductContentUpdateDto {
  return {
    informationGroups: content.informationGroups.map((group) => ({
      title: group.title,
      items: group.items.map((item) => ({ label: item.label, value: item.value })),
    })),
    faqs: content.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
    seoTitle: content.seoTitle.trim() || null,
    seoDescription: content.seoDescription.trim() || null,
  };
}

export function isCatalogContentDirty(
  baseline: CatalogContentValues | undefined,
  draft: CatalogContentValues | undefined,
): boolean {
  if (!baseline || !draft) return false;
  return (
    !sameContentField(baseline, draft, 'informationGroups') ||
    !sameContentField(baseline, draft, 'faqs') ||
    !sameContentField(baseline, draft, 'seoTitle') ||
    !sameContentField(baseline, draft, 'seoDescription')
  );
}

/** Three-way merge keeps independent local edits when another operator saves first. */
export function mergeCatalogContent(
  baseline: CatalogContentValues,
  local: CatalogContentValues,
  current: CatalogContentValues,
): { readonly draft: CatalogContentValues; readonly conflicts: readonly CatalogContentConflict[] } {
  const draft = { ...local };
  const conflicts: CatalogContentConflict[] = [];
  for (const field of Object.keys(contentFieldLabels) as CatalogContentField[]) {
    const localChanged = !sameContentField(baseline, local, field);
    const currentChanged = !sameContentField(baseline, current, field);
    if (!localChanged) Object.assign(draft, { [field]: current[field] });
    else if (currentChanged && !sameContentField(local, current, field))
      conflicts.push({ field, label: contentFieldLabels[field] });
  }
  return { draft, conflicts };
}

export function useCurrentCatalogContentConflicts(
  draft: CatalogContentValues,
  current: CatalogContentValues,
  conflicts: readonly CatalogContentConflict[],
): CatalogContentValues {
  const next = { ...draft };
  for (const conflict of conflicts)
    Object.assign(next, { [conflict.field]: current[conflict.field] });
  return next;
}
