import type { CatalogProductWorkspaceDto } from '@maevelle/contracts';

export interface CatalogOrganizationValues {
  readonly categoryIds: readonly string[];
  readonly primaryCategoryId: string | null;
  readonly attributeValues: Readonly<Record<string, string | boolean | null>>;
}

export interface CatalogOrganizationConflict {
  readonly key: 'categories' | string;
  readonly label: string;
  readonly local: readonly string[] | string | boolean | null;
  readonly current: readonly string[] | string | boolean | null;
}

function normalizedCategoryIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)].sort();
}

function sameCategoryAssignment(
  left: Pick<CatalogOrganizationValues, 'categoryIds' | 'primaryCategoryId'>,
  right: Pick<CatalogOrganizationValues, 'categoryIds' | 'primaryCategoryId'>,
): boolean {
  const leftIds = normalizedCategoryIds(left.categoryIds);
  const rightIds = normalizedCategoryIds(right.categoryIds);
  return (
    left.primaryCategoryId === right.primaryCategoryId &&
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
}

export function catalogOrganizationFromWorkspace(
  workspace: CatalogProductWorkspaceDto,
): CatalogOrganizationValues {
  return {
    categoryIds: normalizedCategoryIds(workspace.organization.categoryIds),
    primaryCategoryId: workspace.organization.primaryCategoryId,
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
    draft: { categoryIds: normalizedCategoryIds(categoryIds), primaryCategoryId, attributeValues },
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
  const attributeValues = { ...draft.attributeValues };
  for (const conflict of conflicts) {
    if (conflict.key === 'categories') {
      categoryIds = current.categoryIds;
      primaryCategoryId = current.primaryCategoryId;
    } else {
      attributeValues[conflict.key] = conflict.current as string | boolean | null;
    }
  }
  return { categoryIds: normalizedCategoryIds(categoryIds), primaryCategoryId, attributeValues };
}
