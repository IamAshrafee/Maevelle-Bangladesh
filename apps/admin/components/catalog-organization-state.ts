import type { CatalogProductWorkspaceDto } from '@maevelle/contracts';

export interface CatalogOrganizationValues {
  readonly categoryIds: readonly string[];
  readonly primaryCategoryId: string | null;
  readonly tagIds: readonly string[];
  readonly occasionIds: readonly string[];
  readonly collectionIds: readonly string[];
  readonly attributeValues: Readonly<Record<string, string | boolean | null>>;
}

export interface CatalogOrganizationConflict {
  readonly key: 'categories' | string;
  readonly label: string;
  readonly local: readonly string[] | string | boolean | null;
  readonly current: readonly string[] | string | boolean | null;
}

function normalizedIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)].sort();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = normalizedIds(left);
  const normalizedRight = normalizedIds(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((id, index) => id === normalizedRight[index])
  );
}

function sameCategoryAssignment(
  left: Pick<CatalogOrganizationValues, 'categoryIds' | 'primaryCategoryId'>,
  right: Pick<CatalogOrganizationValues, 'categoryIds' | 'primaryCategoryId'>,
): boolean {
  return (
    left.primaryCategoryId === right.primaryCategoryId &&
    sameIds(left.categoryIds, right.categoryIds)
  );
}

function sameVocabulary(
  left: CatalogOrganizationValues,
  right: CatalogOrganizationValues,
): boolean {
  return (
    sameIds(left.tagIds, right.tagIds) &&
    sameIds(left.occasionIds, right.occasionIds) &&
    sameIds(left.collectionIds, right.collectionIds)
  );
}

export function catalogOrganizationFromWorkspace(
  workspace: CatalogProductWorkspaceDto,
): CatalogOrganizationValues {
  return {
    categoryIds: normalizedIds(workspace.organization.categoryIds),
    primaryCategoryId: workspace.organization.primaryCategoryId,
    tagIds: normalizedIds(workspace.organization.tagIds),
    occasionIds: normalizedIds(workspace.organization.occasionIds),
    collectionIds: normalizedIds(workspace.organization.collectionIds),
    attributeValues: Object.fromEntries(
      workspace.organization.attributes.map((attribute) => [attribute.id, attribute.value]),
    ),
  };
}

export function isCatalogOrganizationDirty(
  baseline: CatalogOrganizationValues | undefined,
  draft: CatalogOrganizationValues | undefined,
): boolean {
  if (!baseline || !draft) return false;
  if (!sameCategoryAssignment(baseline, draft)) return true;
  if (!sameVocabulary(baseline, draft)) return true;
  const keys = new Set([
    ...Object.keys(baseline.attributeValues),
    ...Object.keys(draft.attributeValues),
  ]);
  return [...keys].some((key) => baseline.attributeValues[key] !== draft.attributeValues[key]);
}

export function areCatalogCategoriesDirty(
  baseline: CatalogOrganizationValues | undefined,
  draft: CatalogOrganizationValues | undefined,
): boolean {
  return Boolean(baseline && draft && !sameCategoryAssignment(baseline, draft));
}

export function areCatalogAttributesDirty(
  baseline: CatalogOrganizationValues | undefined,
  draft: CatalogOrganizationValues | undefined,
): boolean {
  if (!baseline || !draft) return false;
  const keys = new Set([
    ...Object.keys(baseline.attributeValues),
    ...Object.keys(draft.attributeValues),
  ]);
  return [...keys].some((key) => baseline.attributeValues[key] !== draft.attributeValues[key]);
}

export function areCatalogVocabularyDirty(
  baseline: CatalogOrganizationValues | undefined,
  draft: CatalogOrganizationValues | undefined,
): boolean {
  return Boolean(baseline && draft && !sameVocabulary(baseline, draft));
}

/** Three-way merge used when another operator updates the Product workspace first. */
export function mergeCatalogOrganization(
  baseline: CatalogOrganizationValues,
  local: CatalogOrganizationValues,
  current: CatalogOrganizationValues,
  attributeLabels: Readonly<Record<string, string>>,
): {
  readonly draft: CatalogOrganizationValues;
  readonly conflicts: CatalogOrganizationConflict[];
} {
  let categoryIds = local.categoryIds;
  let primaryCategoryId = local.primaryCategoryId;
  let tagIds = local.tagIds;
  let occasionIds = local.occasionIds;
  let collectionIds = local.collectionIds;
  const conflicts: CatalogOrganizationConflict[] = [];
  const localCategoriesChanged = !sameCategoryAssignment(baseline, local);
  const currentCategoriesChanged = !sameCategoryAssignment(baseline, current);
  if (!localCategoriesChanged) {
    categoryIds = current.categoryIds;
    primaryCategoryId = current.primaryCategoryId;
  } else if (currentCategoriesChanged && !sameCategoryAssignment(local, current)) {
    conflicts.push({
      key: 'categories',
      label: 'Categories',
      local: local.categoryIds,
      current: current.categoryIds,
    });
  }

  const localVocabularyChanged = !sameVocabulary(baseline, local);
  const currentVocabularyChanged = !sameVocabulary(baseline, current);
  if (!localVocabularyChanged) {
    tagIds = current.tagIds;
    occasionIds = current.occasionIds;
    collectionIds = current.collectionIds;
  } else if (currentVocabularyChanged && !sameVocabulary(local, current)) {
    conflicts.push({
      key: 'classifications',
      label: 'Tags, occasions, and collections',
      local: [...local.tagIds, ...local.occasionIds, ...local.collectionIds],
      current: [...current.tagIds, ...current.occasionIds, ...current.collectionIds],
    });
  }

  const attributeValues: Record<string, string | boolean | null> = {};
  // The current Product Type is authoritative for which definitions remain editable.
  // Dropping stale keys prevents old-Type values from becoming phantom dirty fields.
  const keys = Object.keys(current.attributeValues);
  for (const key of keys) {
    const baseValue = baseline.attributeValues[key] ?? null;
    const localValue = local.attributeValues[key] ?? null;
    const currentValue = current.attributeValues[key] ?? null;
    if (localValue === baseValue) attributeValues[key] = currentValue;
    else {
      attributeValues[key] = localValue;
      if (currentValue !== baseValue && currentValue !== localValue)
        conflicts.push({
          key,
          label: attributeLabels[key] ?? 'Product attribute',
          local: localValue,
          current: currentValue,
        });
    }
  }

  return {
    draft: {
      categoryIds: normalizedIds(categoryIds),
      primaryCategoryId,
      tagIds: normalizedIds(tagIds),
      occasionIds: normalizedIds(occasionIds),
      collectionIds: normalizedIds(collectionIds),
      attributeValues,
    },
    conflicts,
  };
}

export function useCurrentCatalogOrganizationConflicts(
  draft: CatalogOrganizationValues,
  current: CatalogOrganizationValues,
  conflicts: readonly CatalogOrganizationConflict[],
): CatalogOrganizationValues {
  let categoryIds = draft.categoryIds;
  let primaryCategoryId = draft.primaryCategoryId;
  let tagIds = draft.tagIds;
  let occasionIds = draft.occasionIds;
  let collectionIds = draft.collectionIds;
  const attributeValues = { ...draft.attributeValues };
  for (const conflict of conflicts) {
    if (conflict.key === 'categories') {
      categoryIds = current.categoryIds;
      primaryCategoryId = current.primaryCategoryId;
    } else if (conflict.key === 'classifications') {
      tagIds = current.tagIds;
      occasionIds = current.occasionIds;
      collectionIds = current.collectionIds;
    } else {
      attributeValues[conflict.key] = conflict.current as string | boolean | null;
    }
  }
  return {
    categoryIds: normalizedIds(categoryIds),
    primaryCategoryId,
    tagIds: normalizedIds(tagIds),
    occasionIds: normalizedIds(occasionIds),
    collectionIds: normalizedIds(collectionIds),
    attributeValues,
  };
}
