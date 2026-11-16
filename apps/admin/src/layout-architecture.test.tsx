import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdminContextDto } from '@maevelle/contracts';

import { AdminCapabilitiesProvider } from '../components/admin-capabilities';
import { AuthBrandMark, AuthGateCard, AuthSplitShell } from '../components/auth/auth-split-shell';
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from '../components/theme-provider';
import { SettingsPageHeader } from '../components/settings/settings-page-header';
import { ModuleNav } from '../components/ui/module-nav';
import { SectionAnchorNav } from '../components/ui/section-anchor-nav';
import { WorkspaceTabs, type WorkspaceTabItem } from '../components/ui/workspace-tabs';
import { formatSupplyUnitCost } from '../lib/supply/api';

let mockPathname = '/settings/general';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

function makePartialContext(overrides: Partial<AdminContextDto> = {}): Partial<AdminContextDto> {
  return {
    actorId: 'actor-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    membershipType: 'STANDARD',
    capabilities: [],
    scopes: [],
    ...overrides,
  };
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('ModuleNav architecture contract', () => {
  it('renders at most 5 primary links plus a More overflow trigger for large modules', () => {
    mockPathname = '/settings/general';
    const owner = makePartialContext({ membershipType: 'OWNER' });

    const html = renderToStaticMarkup(
      <AdminCapabilitiesProvider context={owner}>
        <ModuleNav moduleId="settings" ariaLabel="Settings navigation" />
      </AdminCapabilitiesProvider>,
    );

    expect(html).toContain('aria-label="Settings navigation"');
    const primaryLinks = html.match(/<a\b/g) ?? [];
    expect(primaryLinks.length).toBe(5);
    expect(html).toContain('Overview');
    expect(html).toContain('General');
    expect(html).toContain('Integrations');
    expect(html).toContain('More');
    expect(html).toContain('aria-current="page"');
  });

  it('enforces capability filtering and ownerOnly visibility', () => {
    mockPathname = '/settings';
    const restrictedMember = makePartialContext({
      membershipType: 'STANDARD',
      capabilities: ['settings.view'],
    });

    const restrictedHtml = renderToStaticMarkup(
      <AdminCapabilitiesProvider context={restrictedMember}>
        <ModuleNav moduleId="settings" ariaLabel="Settings navigation" />
      </AdminCapabilitiesProvider>,
    );

    expect(restrictedHtml).toContain('Overview');
    expect(restrictedHtml).toContain('General');
    expect(restrictedHtml).not.toContain('/settings/organization');
    expect(restrictedHtml).not.toContain('/settings/integrations');

    mockPathname = '/orders';
    const viewOnlyOrders = makePartialContext({
      membershipType: 'STANDARD',
      capabilities: ['orders.view'],
    });
    const ordersHtml = renderToStaticMarkup(
      <AdminCapabilitiesProvider context={viewOnlyOrders}>
        <ModuleNav moduleId="orders" ariaLabel="Orders navigation" />
      </AdminCapabilitiesProvider>,
    );
    expect(ordersHtml).not.toContain('/orders/new');

    const createOrders = makePartialContext({
      membershipType: 'STANDARD',
      capabilities: ['orders.view', 'orders.create'],
    });
    const createOrdersHtml = renderToStaticMarkup(
      <AdminCapabilitiesProvider context={createOrders}>
        <ModuleNav moduleId="orders" ariaLabel="Orders navigation" />
      </AdminCapabilitiesProvider>,
    );
    expect(createOrdersHtml).toContain('/orders/new');
  });

  it('matches active prefix paths and indicates active overflow items on More', () => {
    mockPathname = '/sizing/guides/guide-42';
    const sizingCtx = makePartialContext({ capabilities: ['sizing.view'] });
    const guideHtml = renderToStaticMarkup(
      <AdminCapabilitiesProvider context={sizingCtx}>
        <ModuleNav moduleId="sizing" ariaLabel="Sizing navigation" />
      </AdminCapabilitiesProvider>,
    );
    expect(guideHtml).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/sizing\/guides"/);

    mockPathname = '/sizing/measurements';
    const aliasOverflowHtml = renderToStaticMarkup(
      <AdminCapabilitiesProvider context={sizingCtx}>
        <ModuleNav moduleId="sizing" ariaLabel="Sizing navigation" />
      </AdminCapabilitiesProvider>,
    );
    expect(aliasOverflowHtml).toContain('Sizes &amp; Dimensions');
    expect(aliasOverflowHtml).toContain('aria-haspopup="menu"');
  });
});

describe('WorkspaceTabs responsive overflow contract', () => {
  type SampleTab = 'one' | 'two' | 'three' | 'four' | 'five' | 'six' | 'seven';
  const items: readonly WorkspaceTabItem<SampleTab>[] = [
    { value: 'one', label: 'Overview', icon: 'layout-dashboard' },
    { value: 'two', label: 'Queue', icon: 'inbox', count: 12 },
    { value: 'three', label: 'History', icon: 'activity' },
    { value: 'four', label: 'Templates', icon: 'mail' },
    { value: 'five', label: 'Rules', icon: 'settings' },
    { value: 'six', label: 'Channels', icon: 'plug', count: 3 },
    { value: 'seven', label: 'Preferences', icon: 'user-round-cog' },
  ];

  it('caps visible role=tab controls at maxVisible and exposes accessible attributes', () => {
    const html = renderToStaticMarkup(
      <WorkspaceTabs
        items={items}
        value="two"
        onValueChange={() => {}}
        maxVisible={5}
        variant="pill"
        ariaLabel="Sample tabs"
      />,
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Sample tabs"');
    const visibleTabs = html.match(/role="tab"/g) ?? [];
    expect(visibleTabs.length).toBe(5);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Queue');
    expect(html).toContain('12');
    expect(html).toContain('More');
    expect(html).not.toContain('Preferences');
  });

  it('surfaces active overflow indicator when the selected tab sits inside overflow', () => {
    const html = renderToStaticMarkup(
      <WorkspaceTabs
        items={items}
        value="six"
        onValueChange={() => {}}
        maxVisible={5}
        variant="underline"
        ariaLabel="Overflow tabs"
      />,
    );

    expect(html).toContain('Channels');
    expect(html).toContain('aria-haspopup="menu"');
  });
});

describe('ThemeProvider & FOUC prevention init script', () => {
  function ThemeProbe() {
    const { theme, resolvedTheme, setTheme } = useTheme();
    return (
      <span
        data-theme={theme}
        data-resolved={resolvedTheme}
        data-has-setter={String(typeof setTheme === 'function')}
      />
    );
  }

  it('renders ThemeProvider SSR consumer safely without crashing', () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(html).toContain('data-has-setter="true"');
    expect(THEME_STORAGE_KEY).toBeTruthy();
  });

  function runInitScript(storedTheme: string | null, systemDark: boolean) {
    const classSet = new Set<string>();
    const documentElement = {
      classList: {
        add: (token: string) => classSet.add(token),
        remove: (token: string) => classSet.delete(token),
        toggle: (token: string, force?: boolean) => {
          if (force === undefined) {
            if (classSet.has(token)) classSet.delete(token);
            else classSet.add(token);
          } else if (force) {
            classSet.add(token);
          } else {
            classSet.delete(token);
          }
        },
        contains: (token: string) => classSet.has(token),
      },
      style: { colorScheme: '' },
      setAttribute: vi.fn(),
    };

    const storage = new Map<string, string>();
    if (storedTheme !== null) {
      storage.set(THEME_STORAGE_KEY, storedTheme);
    }

    const sandbox = {
      document: { documentElement },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
      },
      matchMedia: (query: string) => ({
        matches: query.includes('dark') ? systemDark : false,
      }),
      window: {} as Record<string, unknown>,
    };
    sandbox.window = sandbox;

    vm.runInNewContext(THEME_INIT_SCRIPT, sandbox);
    return {
      isDark: classSet.has('dark'),
      colorScheme: documentElement.style.colorScheme,
    };
  }

  it('applies light, dark, and system theme preferences before first paint', () => {
    expect(runInitScript('dark', false).isDark).toBe(true);
    expect(runInitScript('light', true).isDark).toBe(false);
    expect(runInitScript('system', true).isDark).toBe(true);
    expect(runInitScript('system', false).isDark).toBe(false);
    expect(runInitScript(null, true).isDark).toBe(true);
    expect(runInitScript(null, false).isDark).toBe(false);
  });
});

describe('Admin visual & layout hygiene guards', () => {
  const adminRoot = path.resolve(__dirname, '..');
  const sourceDirs = [
    path.join(adminRoot, 'app'),
    path.join(adminRoot, 'components'),
    path.join(adminRoot, 'lib'),
  ];
  const files = sourceDirs.flatMap(collectSourceFiles);

  it('forbids transition-all across admin app, components, and lib', () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (/\btransition-all\b/.test(content)) {
        violations.push(path.relative(adminRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('forbids legacy .shell.admin-page and button primary/secondary classes', () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (
        /\bshell\s+admin-page\b/.test(content) ||
        /\badmin-page\b/.test(content) ||
        /className\s*=\s*["'][^"']*\bbutton\s+(primary|secondary)\b/.test(content)
      ) {
        violations.push(path.relative(adminRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps globals.css free of non-reduced-motion !important and non-recursive :root --font-sans', () => {
    const globals = fs.readFileSync(path.join(adminRoot, 'app', 'globals.css'), 'utf8');
    const rootSection = globals.split('@theme inline')[0] ?? '';
    expect(rootSection).toContain('--font-inter');
    expect(rootSection).not.toMatch(/--font-sans:\s*var\(--font-sans\)/);

    const withoutReducedMotion = globals.replace(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/,
      '',
    );
    expect(withoutReducedMotion).not.toContain('!important');
    expect(globals).toMatch(/\[data-shell-chrome=['"]true['"]\]/);
  });

  it('forbids removed OperationalPageHeader, manual history state calls, and data-surface backdrop blur', () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (
        /\bOperationalPageHeader\b/.test(content) ||
        /\bwindow\.history\.(replaceState|pushState)\b/.test(content) ||
        /sm:max-w-[^ ]*!/.test(content)
      ) {
        violations.push(path.relative(adminRoot, file));
      }
    }
    expect(violations).toEqual([]);

    const tableSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'ui', 'table.tsx'),
      'utf8',
    );
    const statsSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'ui', 'stats.tsx'),
      'utf8',
    );
    const sheetSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'ui', 'sheet.tsx'),
      'utf8',
    );
    expect(tableSource).not.toContain('backdrop-blur');
    expect(statsSource).not.toContain('backdrop-blur');
    expect(sheetSource).toContain('max-sm:inset-x-0');
    expect(sheetSource).toContain('sm:max-w-lg');
  });
});

describe('Auth shells, SectionAnchorNav, and supply cost formatting contracts', () => {
  it('renders shared AuthSplitShell and AuthGateCard layout markup', () => {
    const splitHtml = renderToStaticMarkup(
      <AuthSplitShell
        eyebrow="Security"
        heading="Sign in"
        summary="Access admin operations."
        securityNote="Protected session"
      >
        <div>Form body</div>
      </AuthSplitShell>,
    );
    expect(splitHtml).toContain('Sign in');
    expect(splitHtml).toContain('Protected session');

    const gateHtml = renderToStaticMarkup(
      <AuthGateCard headerSlot={<AuthBrandMark subtitle="Verification" />}>
        <p>Challenge content</p>
      </AuthGateCard>,
    );
    expect(gateHtml).toContain('Verification');
    expect(gateHtml).toContain('Challenge content');
  });

  it('renders SectionAnchorNav distinctly from ModuleNav and formats sub-taka supply unit costs', () => {
    const anchorHtml = renderToStaticMarkup(
      <SectionAnchorNav
        sections={[
          { id: 'sec-general', label: 'General' },
          { id: 'sec-pricing', label: 'Pricing', badge: 2 },
        ]}
        activeId="sec-pricing"
        ariaLabel="Product Sections Navigation"
        sticky={false}
      />,
    );
    expect(anchorHtml).toContain('aria-label="Product Sections Navigation"');
    expect(anchorHtml).toContain('aria-current="location"');

    const unitCost = formatSupplyUnitCost('12.345', 'BDT');
    expect(unitCost).toBe('৳12.345');
  });
});

describe('Refactored workspace layout, print, token hygiene & route decomposition contracts', () => {
  const adminRoot = path.resolve(__dirname, '..');

  it('unifies ProductCreator sticky dock and delegates Messaging tabs with mobile bottom bar safely removed', () => {
    const productCreator = fs.readFileSync(
      path.join(adminRoot, 'components', 'products', 'product-creator.tsx'),
      'utf8',
    );
    expect(productCreator).toContain('data-shell-chrome="true"');
    expect(productCreator).toContain('<CreatorHeader');
    expect(productCreator).toContain('sticky={false}');
    expect(productCreator).toContain('<SectionNavStrip');

    const messagingWorkspace = fs.readFileSync(
      path.join(adminRoot, 'components', 'messaging', 'messaging-workspace.tsx'),
      'utf8',
    );
    expect(messagingWorkspace).toContain('<ImmersiveWorkspace>');
    expect(messagingWorkspace).toContain('<WorkspaceTabs');

    const conversationPane = fs.readFileSync(
      path.join(adminRoot, 'components', 'messaging', 'conversation-pane.tsx'),
      'utf8',
    );
    expect(conversationPane).not.toContain('setMobileIslandHidden');

    const adminShell = fs.readFileSync(
      path.join(adminRoot, 'components', 'admin-shell.tsx'),
      'utf8',
    );
    expect(adminShell).not.toContain('mobile-island');
    expect(adminShell).not.toContain('Quick mobile navigation');
    expect(adminShell).not.toContain('!mobileIslandHidden');
  });

  it('marks printable operational documents with .printable-document and removes dead create dialogs', () => {
    const printablePaths = [
      path.join(adminRoot, 'components', 'orders', 'order-printable-invoice.tsx'),
      path.join(adminRoot, 'components', 'fulfillment', 'fulfillment-printable-picklist.tsx'),
      path.join(adminRoot, 'components', 'delivery', 'delivery-printable-label.tsx'),
      path.join(adminRoot, 'components', 'inventory', 'units', 'unit-barcode-modal.tsx'),
    ];
    for (const filePath of printablePaths) {
      expect(fs.readFileSync(filePath, 'utf8')).toContain('printable-document');
    }

    expect(fs.existsSync(path.join(adminRoot, 'components', 'fulfillment-create-dialog.tsx'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(adminRoot, 'components', 'delivery-create-dialog.tsx'))).toBe(
      false,
    );
  });

  it('keeps non-chrome messaging transcript, media cards, and shared tabs free of backdrop-blur', () => {
    const cleanPaths = [
      path.join(adminRoot, 'components', 'messaging', 'message-transcript.tsx'),
      path.join(adminRoot, 'components', 'messaging', 'transcript-message-item.tsx'),
      path.join(adminRoot, 'components', 'messaging', 'transcript-search-bar.tsx'),
      path.join(adminRoot, 'components', 'media', 'media-asset-results.tsx'),
      path.join(adminRoot, 'components', 'products', 'creator', 'media-card.tsx'),
      path.join(adminRoot, 'components', 'ui', 'tabs.tsx'),
    ];
    for (const filePath of cleanPaths) {
      expect(fs.readFileSync(filePath, 'utf8')).not.toContain('backdrop-blur');
    }
  });

  it('keeps extracted /sizing/* route page.tsx entrypoints concise (< 40 lines)', () => {
    const sizingPages = [
      path.join(adminRoot, 'app', 'sizing', 'attention', 'page.tsx'),
      path.join(adminRoot, 'app', 'sizing', 'assignments', 'page.tsx'),
      path.join(adminRoot, 'app', 'sizing', 'mappings', 'page.tsx'),
      path.join(adminRoot, 'app', 'sizing', 'standards', 'page.tsx'),
      path.join(adminRoot, 'app', 'sizing', 'guides', '[guideId]', 'page.tsx'),
    ];
    for (const pagePath of sizingPages) {
      const lineCount = fs.readFileSync(pagePath, 'utf8').split(/\r?\n/).length;
      expect(lineCount).toBeLessThan(40);
    }
  });

  it('uses Layer 4 PageHeader in CustomerHeader and SettingsPageHeader', () => {
    const customerHeader = fs.readFileSync(
      path.join(adminRoot, 'components', 'customers', 'customer-header.tsx'),
      'utf8',
    );
    const settingsHeaderSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'settings', 'settings-page-header.tsx'),
      'utf8',
    );
    expect(customerHeader).toContain('<PageHeader');
    expect(settingsHeaderSource).toContain('<PageHeader');

    const renderedSettingsHeader = renderToStaticMarkup(
      <SettingsPageHeader
        title="General"
        description="Configure store defaults."
        backHref="/settings"
        backLabel="Settings"
        readinessStatus="ready"
      />,
    );
    expect(renderedSettingsHeader).toContain('Platform Settings');
    expect(renderedSettingsHeader).toContain('General');
    expect(renderedSettingsHeader).toContain('Configure store defaults.');
  });

  it('provides root MotionConfig reducedMotion="user" and Motion transitions on overlays and navigation', () => {
    const rootLayout = fs.readFileSync(path.join(adminRoot, 'app', 'layout.tsx'), 'utf8');
    const motionPrimitives = fs.readFileSync(
      path.join(adminRoot, 'components', 'motion', 'motion-primitives.tsx'),
      'utf8',
    );
    expect(rootLayout).toContain('<AdminMotionProvider>');
    expect(motionPrimitives).toContain('<MotionConfig reducedMotion="user"');

    const animatedPrimitives = [
      path.join(adminRoot, 'components', 'admin-shell.tsx'),
      path.join(adminRoot, 'components', 'ui', 'dialog.tsx'),
      path.join(adminRoot, 'components', 'ui', 'sheet.tsx'),
      path.join(adminRoot, 'components', 'ui', 'popover.tsx'),
      path.join(adminRoot, 'components', 'ui', 'select.tsx'),
      path.join(adminRoot, 'components', 'ui', 'combobox.tsx'),
      path.join(adminRoot, 'components', 'ui', 'toast.tsx'),
      path.join(adminRoot, 'components', 'ui', 'tabs.tsx'),
      path.join(adminRoot, 'components', 'ui', 'navigation-menu.tsx'),
      path.join(adminRoot, 'components', 'ui', 'module-nav.tsx'),
      path.join(adminRoot, 'components', 'ui', 'workspace-tabs.tsx'),
    ];
    for (const filePath of animatedPrimitives) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('motion-primitives');
    }

    const sheetFormConversions = [
      path.join(adminRoot, 'components', 'supply', 'create-purchase-dialog.tsx'),
      path.join(adminRoot, 'components', 'finance', 'finance-dialogs.tsx'),
      path.join(adminRoot, 'components', 'team', 'team-roles-presets.tsx'),
      path.join(adminRoot, 'components', 'customers', 'customer-contact-section.tsx'),
      path.join(adminRoot, 'components', 'email', 'email-suppressions-tab.tsx'),
    ];
    for (const filePath of sheetFormConversions) {
      expect(fs.readFileSync(filePath, 'utf8')).toContain('<Sheet');
    }
    expect(
      fs.existsSync(path.join(adminRoot, 'components', 'supply', 'supply-task-dialog-content.tsx')),
    ).toBe(false);

    const stickyTables = [
      path.join(adminRoot, 'components', 'supply', 'purchases-list.tsx'),
      path.join(adminRoot, 'components', 'inventory', 'location-overview.tsx'),
      path.join(adminRoot, 'components', 'delivery', 'delivery-console.tsx'),
      path.join(adminRoot, 'components', 'fulfillment', 'fulfillment-console.tsx'),
    ];
    for (const filePath of stickyTables) {
      expect(fs.readFileSync(filePath, 'utf8')).toContain('stickyHeader');
    }
  });

  it('keeps accessible foreground contrast on bg-primary action and brand surfaces across themes', () => {
    const contrastTargets = [
      path.join(adminRoot, 'components', 'ui', 'button.tsx'),
      path.join(adminRoot, 'components', 'admin-shell.tsx'),
      path.join(adminRoot, 'components', 'auth', 'auth-split-shell.tsx'),
    ];
    for (const filePath of contrastTargets) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('bg-primary text-foreground dark:text-primary-foreground');
    }

    const buttonSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'ui', 'button.tsx'),
      'utf8',
    );
    expect(buttonSource).toContain('hover:text-primary-foreground');
  });

  it('adopts AdminPage across migrated inventory, settings, integrations, and media settings consoles', () => {
    const migratedConsoles = [
      path.join(adminRoot, 'components', 'inventory', 'reservations-list.tsx'),
      path.join(adminRoot, 'components', 'inventory', 'inventory-settings-console.tsx'),
      path.join(adminRoot, 'components', 'inventory', 'inventory-item-detail.tsx'),
      path.join(adminRoot, 'components', 'inventory', 'stocktake-detail.tsx'),
      path.join(adminRoot, 'components', 'inventory', 'location-detail.tsx'),
      path.join(adminRoot, 'components', 'settings', 'integrations-hub.tsx'),
      path.join(adminRoot, 'components', 'settings', 'settings-overview-console.tsx'),
      path.join(adminRoot, 'components', 'settings', 'general-settings-console.tsx'),
      path.join(adminRoot, 'components', 'settings', 'security-settings-console.tsx'),
      path.join(adminRoot, 'components', 'settings', 'storefront-settings-console.tsx'),
      path.join(adminRoot, 'components', 'settings', 'system-settings-console.tsx'),
      path.join(adminRoot, 'components', 'settings', 'resend-integration-console.tsx'),
      path.join(adminRoot, 'components', 'settings', 'configuration-health-console.tsx'),
      path.join(adminRoot, 'components', 'media', 'media-settings-console.tsx'),
    ];
    for (const filePath of migratedConsoles) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('<AdminPage');
    }
  });

  it('enforces Mobile Form & Dialog standard: viewport export and 16px touch inputs', () => {
    const rootLayout = fs.readFileSync(path.join(adminRoot, 'app', 'layout.tsx'), 'utf8');
    expect(rootLayout).toContain('export const viewport: Viewport');
    expect(rootLayout).toContain("interactiveWidget: 'resizes-content'");

    const globalsCss = fs.readFileSync(path.join(adminRoot, 'app', 'globals.css'), 'utf8');
    expect(globalsCss).toContain('@custom-variant pointer-coarse');
    expect(globalsCss).toContain('@custom-variant pointer-fine');

    const touchSafeInputs = [
      path.join(adminRoot, 'components', 'ui', 'input.tsx'),
      path.join(adminRoot, 'components', 'ui', 'textarea.tsx'),
      path.join(adminRoot, 'components', 'ui', 'native-select.tsx'),
      path.join(adminRoot, 'components', 'ui', 'select.tsx'),
      path.join(adminRoot, 'components', 'ui', 'search-input.tsx'),
      path.join(adminRoot, 'components', 'ui', 'combobox.tsx'),
      path.join(adminRoot, 'components', 'ui', 'command.tsx'),
      path.join(adminRoot, 'components', 'ui', 'calendar.tsx'),
      path.join(adminRoot, 'components', 'ui', 'input-otp.tsx'),
    ];
    for (const filePath of touchSafeInputs) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('pointer-coarse:text-base');
      expect(content).toContain('text-base');
    }
  });

  it('enforces Mobile Overlay Geometry standard: bounded flex containers and safe-area footers', () => {
    const sheetSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'sheet.tsx'), 'utf8');
    expect(sheetSource).toContain('max-h-[92dvh]');
    expect(sheetSource).toContain('env(safe-area-inset-bottom');

    const dialogSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'dialog.tsx'), 'utf8');
    expect(dialogSource).toContain('max-h-[calc(100dvh-2rem)]');
    expect(dialogSource).toContain('env(safe-area-inset-bottom');

    const alertDialogSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'ui', 'alert-dialog.tsx'),
      'utf8',
    );
    expect(alertDialogSource).toContain('env(safe-area-inset-bottom');

    const drawerSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'drawer.tsx'), 'utf8');
    expect(drawerSource).toContain('env(safe-area-inset-bottom');

    // Create Account Dialog has zero hardcoded autoFocus
    const createAccountSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'finance', 'create-account-dialog.tsx'),
      'utf8',
    );
    expect(createAccountSource).not.toContain('autoFocus');
  });

  it('enforces Mobile Overlay Stacking Context hierarchy: Sheet/Dialog z-50 < Popover/Select z-[60] < AlertDialog z-[70]', () => {
    const sheetSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'sheet.tsx'), 'utf8');
    expect(sheetSource).toContain('z-50');

    const dialogSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'dialog.tsx'), 'utf8');
    expect(dialogSource).toContain('z-50');

    const selectSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'select.tsx'), 'utf8');
    expect(selectSource).toContain('z-[60]');

    const popoverSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'popover.tsx'), 'utf8');
    expect(popoverSource).toContain('z-[60]');

    const dropdownSource = fs.readFileSync(path.join(adminRoot, 'components', 'ui', 'dropdown-menu.tsx'), 'utf8');
    expect(dropdownSource).toContain('z-[60]');

    const alertDialogSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'ui', 'alert-dialog.tsx'),
      'utf8',
    );
    expect(alertDialogSource).toContain('z-[70]');
  });

  it('guarantees zero un-guarded autoFocus on inputs across all modal dialogs, sheets, and drawers', () => {
    const allComponentFiles = collectSourceFiles(path.join(adminRoot, 'components'));
    const offendingFiles: string[] = [];

    for (const filePath of allComponentFiles) {
      if (!filePath.endsWith('.tsx')) continue;
      // Skip the dedicated hardware scanner input component which explicitly guards autoFocus behind (pointer: fine)
      if (filePath.endsWith('unit-scanner-input.tsx')) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      // Detect hardcoded <Input autoFocus or <textarea autoFocus or <select autoFocus
      if (/<(Input|textarea|select|NativeSelect)\b[^>]*\bautoFocus\b/i.test(content)) {
        offendingFiles.push(path.relative(adminRoot, filePath));
      }
    }

    expect(offendingFiles).toEqual([]);
  });

  it('integrates Mobile Forms & Dialogs lab tab into Design System showcase', () => {
    const designSystemSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'design-system', 'design-system-view.tsx'),
      'utf8',
    );
    expect(designSystemSource).toContain("id: 'mobile-forms'");
    expect(designSystemSource).toContain('Mobile Forms & Dialogs');
    expect(designSystemSource).toContain('<MobileFormsLab />');

    const labSource = fs.readFileSync(
      path.join(adminRoot, 'components', 'design-system', 'mobile-forms-lab.tsx'),
      'utf8',
    );
    expect(labSource).toContain('Pointer Hardware');
    expect(labSource).toContain('iOS Auto-Zoom Guard');
    expect(labSource).toContain('Tier 1: Quick Action Dialog');
    expect(labSource).toContain('Tier 2: Standard Form Sheet');
    expect(labSource).toContain('Authoritative 4-Tier Z-Index Architecture');
  });
});
