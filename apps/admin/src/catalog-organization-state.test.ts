import { describe, expect, it } from 'vitest';

import {
  areCatalogVocabularyDirty,
  isCatalogOrganizationDirty,
  mergeCatalogOrganization,
  type CatalogOrganizationValues,
} from '../components/catalog-organization-state';

const baseline: CatalogOrganizationValues = {
  categoryIds: ['category'],
  primaryCategoryId: 'category',
  tagIds: ['tag-a'],
  occasionIds: [],
  collectionIds: [],
  attributeValues: { material: 'Cotton' },
};

describe('catalog organization draft state', () => {
  it('tracks tags, occasions, and collections as unsaved organization changes', () => {
    const draft = { ...baseline, occasionIds: ['wedding'] };
    expect(areCatalogVocabularyDirty(baseline, draft)).toBe(true);
    expect(isCatalogOrganizationDirty(baseline, draft)).toBe(true);
  });

  it('three-way merges independent vocabulary changes and reports competing changes', () => {
    const local = { ...baseline, tagIds: ['tag-a', 'tag-b'] };
    const current = { ...baseline, categoryIds: ['category', 'child'] };
    expect(mergeCatalogOrganization(baseline, local, current, {}).draft).toMatchObject({
      categoryIds: ['category', 'child'],
      tagIds: ['tag-a', 'tag-b'],
    });

    const competing = mergeCatalogOrganization(
      baseline,
      local,
      { ...baseline, tagIds: ['tag-c'] },
      {},
    );
    expect(competing.conflicts).toContainEqual(expect.objectContaining({ key: 'classifications' }));
  });
});
