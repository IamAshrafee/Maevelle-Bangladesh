import fs from 'node:fs';
import path from 'node:path';
import type { AdminContextDto } from '@maevelle/contracts';
import { describe, expect, it } from 'vitest';
import {
  getCommandPaletteEntries,
  getModuleNavItems,
  getPlatformUtilityItems,
  getRouteEntry,
  getSidebarPillars,
  isSidebarItemActive,
  MODULE_NAV_CONFIGS,
  PLATFORM_UTILITY_ITEMS,
  QUICK_COMMAND_ITEMS,
  resolveBreadcrumbTrail,
  ROUTE_REGISTRY,
  SIDEBAR_PILLARS,
  toAppRoutePath,
  toBrowserUrl,
  type ModuleNavId,
} from './route-registry';

function collectAppPageRoutes(appDir: string): string[] {
  const routes: string[] = [];

  function walk(currentDir: string, segments: string[]) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name === 'page.tsx') {
        const publicSegments = segments.filter((segment) => !/^\(.*\)$/.test(segment));
        routes.push(publicSegments.length === 0 ? '/' : `/${publicSegments.join('/')}`);
      } else if (entry.isDirectory()) {
        if (entry.name.startsWith('@') || entry.name === 'api') continue;
        walk(path.join(currentDir, entry.name), [...segments, entry.name]);
      }
    }
  }

  walk(appDir, []);
  return routes.sort();
}

function makeAdminContext(overrides: Partial<AdminContextDto> = {}): AdminContextDto {
  return {
    actorId: 'actor-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    membershipType: 'STANDARD',
    capabilities: [],
    scopes: [],
    user: {
      email: 'member@maevelle.com',
      name: 'Ops Member',
    },
    twoFactor: {
      isEnabled: true,
      isRequired: false,
      enrollmentRequired: false,
      accessRestricted: false,
      enrollmentDeadline: null,
    },
    ...overrides,
  };
}

describe('route-registry', () => {
  const appDir = path.resolve(__dirname, '../../app');
  const diskRoutes = collectAppPageRoutes(appDir);

  it('registers every page.tsx under apps/admin/app with zero unregistered or stale patterns', () => {
    const registeredPatterns = ROUTE_REGISTRY.map((entry) => entry.pattern);
    const uniquePatterns = new Set(registeredPatterns);
    expect(registeredPatterns.length).toBe(uniquePatterns.size);

    const diskSet = new Set(diskRoutes);
    const missingFromDisk = registeredPatterns.filter((pattern) => !diskSet.has(pattern));
    expect(missingFromDisk).toEqual([]);

    const missingFromRegistry = diskRoutes.filter((route) => !getRouteEntry(route));
    expect(missingFromRegistry).toEqual([]);
  });

  it('ensures every sidebar, utility, quick command, and module nav href resolves to a real page', () => {
    const diskSet = new Set(diskRoutes);
    const allTargets: string[] = [
      ...SIDEBAR_PILLARS.flatMap((group) => group.items.map((item) => item.href)),
      ...PLATFORM_UTILITY_ITEMS.map((item) => item.href),
      ...QUICK_COMMAND_ITEMS.map((item) => item.href),
      ...Object.values(MODULE_NAV_CONFIGS).flatMap((items) => items.map((item) => item.href)),
    ];

    const broken = allTargets.filter((href) => !diskSet.has(href));
    expect(broken).toEqual([]);
  });

  it('caps primary (non-overflow) ModuleNav items at 5 per module', () => {
    for (const moduleId of Object.keys(MODULE_NAV_CONFIGS) as ModuleNavId[]) {
      const primaryCount = MODULE_NAV_CONFIGS[moduleId].filter((item) => !item.overflow).length;
      expect(primaryCount, `module ${moduleId} primary tab count`).toBeLessThanOrEqual(5);
    }
  });

  it('normalizes internal Next app paths and full browser URLs cleanly', () => {
    expect(toAppRoutePath('/admin/orders/123?tab=items#notes')).toBe('/orders/123?tab=items#notes');
    expect(toAppRoutePath('/admin')).toBe('/');
    expect(toAppRoutePath('/orders')).toBe('/orders');
    expect(toAppRoutePath(null)).toBe('/');
    expect(toAppRoutePath('https://external.example')).toBe('/');

    expect(toBrowserUrl('/')).toBe('/admin');
    expect(toBrowserUrl('/orders')).toBe('/admin/orders');
    expect(toBrowserUrl('/admin/orders?page=2')).toBe('/admin/orders?page=2');
    expect(toBrowserUrl('/?focus=1')).toBe('/admin?focus=1');
  });

  it('enforces capability gating for orders.create and ownerOnly for /settings/checkout', () => {
    const viewOnlyOrders = makeAdminContext({ capabilities: ['orders.view'] });
    const createOrders = makeAdminContext({ capabilities: ['orders.view', 'orders.create'] });
    const memberSettings = makeAdminContext({ capabilities: ['settings.view'] });
    const owner = makeAdminContext({ membershipType: 'OWNER', capabilities: [] });

    expect(getModuleNavItems('orders', viewOnlyOrders).map((i) => i.href)).not.toContain(
      '/orders/new',
    );
    expect(getModuleNavItems('orders', createOrders).map((i) => i.href)).toContain('/orders/new');

    expect(getCommandPaletteEntries(viewOnlyOrders).map((i) => i.href)).not.toContain(
      '/orders/new',
    );
    expect(getCommandPaletteEntries(createOrders).map((i) => i.href)).toContain('/orders/new');

    expect(getModuleNavItems('settings', memberSettings).map((i) => i.href)).not.toContain(
      '/settings/checkout',
    );
    expect(getModuleNavItems('settings', owner).map((i) => i.href)).toContain('/settings/checkout');
    expect(getSidebarPillars(owner).length).toBe(SIDEBAR_PILLARS.length);
    expect(getPlatformUtilityItems(owner).length).toBe(PLATFORM_UTILITY_ITEMS.length);
    expect(PLATFORM_UTILITY_ITEMS.map((item) => item.id)).toEqual(['settings']);
  });

  it('resolves breadcrumbs and sidebar active states accurately', () => {
    expect(resolveBreadcrumbTrail('/orders/ord-123')).toEqual([
      { label: 'Orders', href: '/orders' },
      { label: 'Order Details' },
    ]);

    const sidebarItems = SIDEBAR_PILLARS.flatMap((g) => g.items);
    const deliveriesItem = sidebarItems.find((i) => i.id === 'deliveries')!;
    expect(isSidebarItemActive('/admin/delivery/couriers', deliveriesItem)).toBe(true);
    expect(isSidebarItemActive('/orders', deliveriesItem)).toBe(false);

    const inventoryItem = sidebarItems.find((i) => i.id === 'inventory')!;
    const warehousesItem = sidebarItems.find((i) => i.id === 'warehouses')!;
    const stockItem = sidebarItems.find((i) => i.id === 'inventory-stock')!;
    const supplyItem = sidebarItems.find((i) => i.id === 'supply')!;
    const suppliersItem = sidebarItems.find((i) => i.id === 'suppliers')!;
    const integrationsItem = sidebarItems.find((i) => i.id === 'integrations')!;
    const settingsItem = PLATFORM_UTILITY_ITEMS.find((i) => i.id === 'settings')!;

    expect(isSidebarItemActive('/admin/inventory', inventoryItem)).toBe(true);
    expect(isSidebarItemActive('/admin/inventory/warehouses', inventoryItem)).toBe(false);
    expect(isSidebarItemActive('/admin/inventory/warehouses/loc-1', warehousesItem)).toBe(true);
    expect(isSidebarItemActive('/admin/inventory/stock/item-1', stockItem)).toBe(true);
    expect(isSidebarItemActive('/admin/inventory/stock/item-1', inventoryItem)).toBe(false);

    expect(isSidebarItemActive('/admin/supply', supplyItem)).toBe(true);
    expect(isSidebarItemActive('/admin/suppliers', supplyItem)).toBe(false);
    expect(isSidebarItemActive('/admin/suppliers', suppliersItem)).toBe(true);

    expect(isSidebarItemActive('/admin/settings/integrations/resend', integrationsItem)).toBe(true);
    expect(isSidebarItemActive('/admin/settings/integrations/resend', settingsItem)).toBe(false);
    expect(isSidebarItemActive('/admin/settings/general', settingsItem)).toBe(true);
  });
});
