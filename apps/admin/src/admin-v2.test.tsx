import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '../components/status-badge';
import { isCatalogOverviewDirty, mergeCatalogOverview } from '../components/catalog-overview-state';
import {
  isCatalogOrganizationDirty,
  mergeCatalogOrganization,
} from '../components/catalog-organization-state';
import { parseCatalogImportCsv } from '../components/operations-console';
import {
  filterAndSortWorklist,
  OperationalEmptyState,
  OperationalPageHeader,
} from '../components/operational-worklist';

describe('Admin V2 interface contracts', () => {
  it.each([
    ['PUBLISHED', 'status-success'],
    ['READY', 'status-success'],
    ['ATTENTION', 'status-warning'],
    ['BLOCKED', 'status-danger'],
    ['IN_TRANSIT', 'status-warning'],
    ['FAILED', 'status-danger'],
    ['DRAFT', 'status-neutral'],
  ])('renders %s with a consistent semantic tone', (status, expectedClass) => {
    expect(renderToStaticMarkup(<StatusBadge status={status} />)).toContain(expectedClass);
  });

  it('renders machine statuses as readable labels', () => {
    expect(renderToStaticMarkup(<StatusBadge status="PARTIALLY_PAID" />)).toContain(
      'PARTIALLY PAID',
    );
  });

  it('merges non-conflicting Product edits and exposes true stale-field conflicts', () => {
    const baseline = {
      title: 'Linen Dress',
      handle: 'linen-dress',
      description: 'Original copy',
      productTypeId: 'dress',
    };
    const merged = mergeCatalogOverview(
      baseline,
      { ...baseline, title: 'Linen Wrap Dress', description: 'My revised copy' },
      { ...baseline, handle: 'linen-midi-dress', description: 'Another operator copy' },
    );

    expect(merged.draft).toMatchObject({
      title: 'Linen Wrap Dress',
      handle: 'linen-midi-dress',
      description: 'My revised copy',
    });
    expect(merged.conflicts).toEqual({
      description: { local: 'My revised copy', current: 'Another operator copy' },
    });
    expect(isCatalogOverviewDirty(baseline, merged.draft)).toBe(true);
  });

  it('preserves local Product organization edits while merging unrelated current changes', () => {
    const baseline = {
      categoryIds: ['dresses'],
      primaryCategoryId: 'dresses',
      attributeValues: { material: 'Cotton', washable: false },
    };
    const merged = mergeCatalogOrganization(
      baseline,
      {
        ...baseline,
        categoryIds: ['dresses', 'occasion'],
        attributeValues: { ...baseline.attributeValues, material: 'Linen' },
      },
      {
        ...baseline,
        attributeValues: { material: 'Silk', washable: true },
      },
      { material: 'Material', washable: 'Machine washable' },
    );

    expect(merged.draft).toEqual({
      categoryIds: ['dresses', 'occasion'],
      primaryCategoryId: 'dresses',
      attributeValues: { material: 'Linen', washable: true },
    });
    expect(merged.conflicts).toEqual([
      { key: 'material', label: 'Material', local: 'Linen', current: 'Silk' },
    ]);
    expect(isCatalogOrganizationDirty(baseline, merged.draft)).toBe(true);
  });

  it('drops attributes that do not belong to the current Product Type during recovery', () => {
    const previous = {
      categoryIds: [],
      primaryCategoryId: null,
      attributeValues: { obsolete: 'Old type value' },
    };
    const merged = mergeCatalogOrganization(
      previous,
      previous,
      { categoryIds: [], primaryCategoryId: null, attributeValues: { current: null } },
      { current: 'Current field' },
    );

    expect(merged.draft.attributeValues).toEqual({ current: null });
    expect(merged.conflicts).toEqual([]);
  });

  it('filters and sorts operational worklists without changing the source array', () => {
    const source = [
      { reference: 'FUL-002', status: 'PACKED', search: 'Linen dress Dhaka', at: '2026-08-02' },
      {
        reference: 'FUL-001',
        status: 'READY',
        search: 'Cotton shirt Chattogram',
        at: '2026-08-01',
      },
      { reference: 'FUL-003', status: 'PACKED', search: 'Cotton dress Dhaka', at: '2026-08-03' },
    ] as const;
    const visible = filterAndSortWorklist(source, {
      query: 'dhaka',
      status: 'PACKED',
      sort: 'reference',
      getSearchText: (item) => item.search,
      getStatus: (item) => item.status,
      getReference: (item) => item.reference,
      getTimestamp: (item) => item.at,
    });

    expect(visible.map((item) => item.reference)).toEqual(['FUL-002', 'FUL-003']);
    expect(source.map((item) => item.reference)).toEqual(['FUL-002', 'FUL-001', 'FUL-003']);
  });

  it('renders consistent operational page and empty-state semantics', () => {
    const header = renderToStaticMarkup(
      <OperationalPageHeader
        eyebrow="Operations / Fulfillment"
        title="Fulfillment worklist"
        description="Pick, pack, and dispatch."
      />,
    );
    const empty = renderToStaticMarkup(
      <OperationalEmptyState title="No matching records" description="Clear the filters." />,
    );

    expect(header).toContain('<h1>Fulfillment worklist</h1>');
    expect(empty).toContain('No matching records');
  });

  it('parses quoted Catalog CSV without requiring operators to paste internal IDs', () => {
    expect(
      parseCatalogImportCsv(
        'title,handle,description\r\n"Linen, Wrap Dress",linen-wrap,"Light, breathable"',
      ),
    ).toEqual([
      {
        title: 'Linen, Wrap Dress',
        handle: 'linen-wrap',
        description: 'Light, breathable',
      },
    ]);
  });
});
