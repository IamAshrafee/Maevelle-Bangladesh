import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WishlistButton } from './wishlist-button';

describe('Wishlist heart semantics', () => {
  it('keeps one accessible toggle name while its pressed state changes', () => {
    const unsaved = renderToStaticMarkup(<WishlistButton active={false} productTitle="Pearl clip" />);
    const saved = renderToStaticMarkup(<WishlistButton active productTitle="Pearl clip" />);
    expect(unsaved).toContain('aria-label="Save Pearl clip to wishlist"');
    expect(unsaved).toContain('aria-pressed="false"');
    expect(saved).toContain('aria-label="Save Pearl clip to wishlist"');
    expect(saved).toContain('aria-pressed="true"');
    expect(saved).toContain('type="button"');
  });

  it('does not announce an unknown account state as unsaved', () => {
    const pending = renderToStaticMarkup(<WishlistButton active={null} disabled pending productTitle="Pearl clip" />);
    expect(pending).not.toContain('aria-pressed=');
    expect(pending).toContain('aria-busy="true"');
    expect(pending).toContain('disabled=""');
  });
});
