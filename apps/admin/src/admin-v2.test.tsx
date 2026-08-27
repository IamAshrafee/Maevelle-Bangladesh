import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '../components/status-badge';
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
