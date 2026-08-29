import { describe, expect, it } from 'vitest';

import {
  catalogContentPayload,
  isCatalogContentDirty,
  mergeCatalogContent,
  useCurrentCatalogContentConflicts,
  type CatalogContentValues,
} from '../components/catalog-content-state';

const baseline: CatalogContentValues = {
  informationGroups: [
    {
      key: 'materials',
      title: 'Materials',
      items: [{ key: 'shell', label: 'Shell', value: 'Cotton' }],
    },
  ],
  faqs: [{ key: 'care', question: 'How do I wash it?', answer: 'Hand wash.' }],
  seoTitle: 'Cotton dress',
  seoDescription: 'A breathable cotton dress.',
};

describe('catalog content draft state', () => {
  it('ignores client keys in semantic comparisons and API payloads', () => {
    const draft = {
      ...baseline,
      informationGroups: [
        {
          key: 'replacement-group-key',
          title: 'Materials',
          items: [{ key: 'replacement-item-key', label: 'Shell', value: 'Cotton' }],
        },
      ],
    };
    expect(isCatalogContentDirty(baseline, draft)).toBe(false);
    expect(catalogContentPayload(draft).informationGroups[0]).toEqual({
      title: 'Materials',
      items: [{ label: 'Shell', value: 'Cotton' }],
    });
  });

  it('merges independent fields and reports competing edits', () => {
    const local = { ...baseline, seoTitle: 'Local search title' };
    const current = { ...baseline, seoDescription: 'Current search description.' };
    expect(mergeCatalogContent(baseline, local, current)).toMatchObject({
      draft: {
        seoTitle: 'Local search title',
        seoDescription: 'Current search description.',
      },
      conflicts: [],
    });

    const competing = mergeCatalogContent(baseline, local, {
      ...baseline,
      seoTitle: 'Another operator title',
    });
    expect(competing.conflicts).toEqual([{ field: 'seoTitle', label: 'Search title' }]);
    expect(
      useCurrentCatalogContentConflicts(local, competing.draft, competing.conflicts).seoTitle,
    ).toBe('Local search title');
    expect(
      useCurrentCatalogContentConflicts(
        local,
        { ...baseline, seoTitle: 'Current' },
        competing.conflicts,
      ).seoTitle,
    ).toBe('Current');
  });
});
