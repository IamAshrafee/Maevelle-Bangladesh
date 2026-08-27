import type { CatalogProductWorkspaceDto } from '@maevelle/contracts';

export interface CatalogOverviewValues {
  readonly title: string;
  readonly handle: string;
  readonly description: string;
  readonly productTypeId: string;
}

export type CatalogOverviewField = keyof CatalogOverviewValues;

export interface CatalogOverviewConflict {
  readonly local: string;
  readonly current: string;
}

export function catalogOverviewFromWorkspace(
  workspace: CatalogProductWorkspaceDto,
): CatalogOverviewValues {
  return {
    title: workspace.title,
    handle: workspace.handle,
    description: workspace.description ?? '',
    productTypeId: workspace.productTypeId,
  };
}

export function isCatalogOverviewDirty(
  baseline: CatalogOverviewValues | undefined,
  draft: CatalogOverviewValues | undefined,
): boolean {
  if (!baseline || !draft) return false;
  return (Object.keys(baseline) as CatalogOverviewField[]).some(
    (field) => baseline[field] !== draft[field],
  );
}

/** Three-way merge used after an optimistic-concurrency conflict. */
export function mergeCatalogOverview(
  baseline: CatalogOverviewValues,
  local: CatalogOverviewValues,
  current: CatalogOverviewValues,
): {
  readonly draft: CatalogOverviewValues;
  readonly conflicts: Partial<Record<CatalogOverviewField, CatalogOverviewConflict>>;
} {
  const draft = { ...local };
  const conflicts: Partial<Record<CatalogOverviewField, CatalogOverviewConflict>> = {};
  for (const field of Object.keys(baseline) as CatalogOverviewField[]) {
    if (local[field] === baseline[field]) {
      draft[field] = current[field];
    } else if (current[field] !== baseline[field] && current[field] !== local[field]) {
      conflicts[field] = { local: local[field], current: current[field] };
    }
  }
  return { draft, conflicts };
}
