import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '../components/status-badge';

describe('Admin V2 interface contracts', () => {
  it.each([
    ['PUBLISHED', 'status-success'],
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
});
