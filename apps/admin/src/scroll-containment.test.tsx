import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdminCapabilitiesProvider } from '../components/admin-capabilities';
import { Table } from '../components/ui/table';
import { WorkspaceTabs, type WorkspaceTabItem } from '../components/ui/workspace-tabs';
import { ModuleNav } from '../components/ui/module-nav';
import { Breadcrumb } from '../components/ui/breadcrumb';
import { SectionAnchorNav } from '../components/ui/section-anchor-nav';
import { SheetBody } from '../components/ui/sheet';

let mockPathname = '/orders';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

describe('iOS Scroll Containment Architecture Contract', () => {
  it('enforces root-level lateral containment in globals.css without breaking sticky positioning', () => {
    const globalsCssPath = path.resolve(__dirname, '../app/globals.css');
    const css = fs.readFileSync(globalsCssPath, 'utf8');

    // HTML root containment
    expect(css).toMatch(/html\s*\{[^}]*overscroll-behavior-x:\s*none/);
    expect(css).toMatch(/html\s*\{[^}]*overflow-x:\s*clip/);

    // Body containment
    expect(css).toMatch(/body\s*\{[^}]*overscroll-behavior-x:\s*none/);
  });

  it('contains horizontal table scroll boundaries while strictly preserving bidirectional touch panning', () => {
    const markup = renderToStaticMarkup(
      <Table>
        <tbody>
          <tr>
            <td>Cell 1</td>
            <td>Cell 2</td>
          </tr>
        </tbody>
      </Table>,
    );

    expect(markup).toContain('overscroll-x-contain');
    expect(markup).toContain('overflow-x-auto');
    // Rule 1: Tables must NEVER have touch-pan-y because that breaks horizontal swiping
    expect(markup).not.toContain('touch-pan-y');
  });

  it('contains sticky table headers on both X and Y overscroll axes', () => {
    const markup = renderToStaticMarkup(
      <Table stickyHeader>
        <tbody>
          <tr>
            <td>Sticky Cell</td>
          </tr>
        </tbody>
      </Table>,
    );

    expect(markup).toContain('overscroll-x-contain');
    expect(markup).toContain('overscroll-y-contain');
  });

  it('contains horizontal view tabs at scroll boundaries without root chaining', () => {
    const items: readonly WorkspaceTabItem[] = [
      { value: 'all', label: 'All Orders' },
      { value: 'pending', label: 'Pending' },
      { value: 'shipped', label: 'Shipped' },
    ];
    const markup = renderToStaticMarkup(
      <WorkspaceTabs items={items} value="all" onValueChange={() => undefined} />,
    );

    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('overscroll-x-contain');
    expect(markup).not.toContain('touch-pan-y');
  });

  it('contains route-level ModuleNav navigation pills at scroll boundaries', () => {
    mockPathname = '/settings/general';
    const markup = renderToStaticMarkup(
      <AdminCapabilitiesProvider context={{ membershipType: 'OWNER', actorId: '1', capabilities: [] }}>
        <ModuleNav moduleId="settings" ariaLabel="Settings navigation" />
      </AdminCapabilitiesProvider>,
    );

    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('overscroll-x-contain');
    expect(markup).not.toContain('touch-pan-y');
  });

  it('contains mobile scrollable breadcrumbs without leaking momentum to root document', () => {
    const markup = renderToStaticMarkup(
      <Breadcrumb
        mobileMode="scroll"
        items={[
          { label: 'Home', href: '/' },
          { label: 'Supply', href: '/supply' },
          { label: 'Shipments', href: '/supply/shipments' },
          { label: 'SHP-001', current: true },
        ]}
      />,
    );

    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('overscroll-x-contain');
  });

  it('contains form section anchor navigators at horizontal limits', () => {
    const markup = renderToStaticMarkup(
      <SectionAnchorNav
        sections={[
          { id: 'sec-1', label: 'General Info' },
          { id: 'sec-2', label: 'Pricing & Taxes' },
          { id: 'sec-3', label: 'Logistics' },
        ]}
        activeId="sec-1"
      />,
    );

    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('overscroll-x-contain');
  });

  it('enforces vertical touch locking and overscroll containment on SheetBody scroll container', () => {
    const markup = renderToStaticMarkup(
      <SheetBody>
        <p>Form Content</p>
      </SheetBody>,
    );

    expect(markup).toContain('overflow-y-auto');
    expect(markup).toContain('overflow-x-hidden');
    expect(markup).toContain('overscroll-contain');
    expect(markup).toContain('touch-pan-y');
  });
});
