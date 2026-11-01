import { describe, expect, it } from 'vitest';
import { buildShareRequest } from './share-client';
import type { WishlistItem } from './types';

const piece = (id: string, preferredVariantId: string | null = null): WishlistItem => ({
  id,
  preferredVariantId,
  title: id,
  handle: id,
  subtitle: '',
  category: 'all',
  categoryLabel: 'Saved',
  price: 100,
  imageUrl: '',
  alt: id,
  inStock: true,
});
const common = { operationId: 'operation', expiresAt: '2026-11-30T00:00:00.000Z' };

describe('share request ownership', () => {
  it('keeps account Share All server-authoritative even when only a partial page is loaded', () => {
    const request = buildShareRequest({
      ...common,
      mode: 'account',
      selection: 'all',
      items: [piece('page-one')],
      selected: [],
    });
    expect(request).toEqual({ ...common, selection: 'all', items: [] });
  });
  it('sends every guest saved item with its variant preference', () => {
    const request = buildShareRequest({
      ...common,
      mode: 'guest',
      selection: 'all',
      items: [piece('one', 'variant'), piece('two')],
      selected: [],
    });
    expect(request.items).toEqual([
      { productId: 'one', preferredVariantId: 'variant' },
      { productId: 'two', preferredVariantId: null },
    ]);
  });
  it('retains selected account pieces from earlier pages', () => {
    const selected = [{ productId: 'older-page', preferredVariantId: null }];
    const request = buildShareRequest({
      ...common,
      mode: 'account',
      selection: 'selected',
      items: [piece('current-page')],
      selected,
    });
    expect(request.items).toEqual(selected);
  });
});
