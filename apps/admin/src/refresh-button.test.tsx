import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { RefreshButton } from '../components/ui/refresh-button';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams(),
}));

describe('RefreshButton Component', () => {
  it('renders an icon-only button with accessible aria-label and no visible text', () => {
    const html = renderToStaticMarkup(<RefreshButton />);

    // Should contain the button
    expect(html).toContain('button');
    // Should have accessible aria-label
    expect(html).toContain('aria-label="Refresh"');
    // Should contain the custom SVG
    expect(html).toContain('<svg');
    // Should NOT have visible "Refresh" text node inside the button
    expect(html).not.toMatch(/>\s*Refresh\s*</);
  });

  it('renders custom tooltip and accessible label when provided', () => {
    const html = renderToStaticMarkup(
      <RefreshButton tooltip="Refresh products catalog" />,
    );

    expect(html).toContain('aria-label="Refresh products catalog"');
    expect(html).toContain('title="Refresh products catalog"');
  });

  it('renders with aria-busy and brand accent styling when loading', () => {
    const html = renderToStaticMarkup(<RefreshButton loading={true} />);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('bg-primary/10');
    expect(html).toContain('aria-label="Refreshing…');
  });

  it('supports size and variant customizations', () => {
    const html = renderToStaticMarkup(
      <RefreshButton variant="ghost" size="icon-sm" className="custom-class" />,
    );

    expect(html).toContain('custom-class');
    expect(html).toContain('size-8'); // icon-sm size in Button
  });
});
