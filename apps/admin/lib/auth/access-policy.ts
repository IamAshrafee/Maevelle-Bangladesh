import type { AdminContextDto } from '@maevelle/contracts';

export type AdminAccessDecision =
  | { kind: 'AUTHORIZED'; context: AdminContextDto }
  | { kind: 'TWO_FACTOR_ENROLLMENT_REQUIRED'; context: AdminContextDto }
  | { kind: 'AUTH_REQUIRED' | 'ACCESS_DENIED' | 'AUTH_UNAVAILABLE' };

export const adminPathHeader = 'x-maevelle-admin-path';
export const publicAdminPaths = new Set([
  '/login',
  '/two-factor',
  '/accept-invitation',
  '/access-status',
]);

export function internalAdminPath(path: string): string {
  const normalized = path === '/admin' ? '/' : path.startsWith('/admin/') ? path.slice(6) : path;
  return normalized.replace(/\/+$/, '') || '/';
}

/** Return destinations are always absolute paths within this application's basePath. */
function hasUnsafeUrlCharacters(value: string): boolean {
  return (
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  );
}

export function safeAdminReturnUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || hasUnsafeUrlCharacters(raw)) return '/admin';
  try {
    // Inspect decoded paths too: encoded separators must not escape the Admin namespace.
    const decoded = decodeURIComponent(raw.split(/[?#]/, 1)[0]!);
    if (decoded.startsWith('//') || hasUnsafeUrlCharacters(decoded)) return '/admin';
    const url = new URL(raw, 'https://admin.invalid');
    if (/%(?:2f|5c|25)/i.test(url.pathname)) return '/admin';
    if (url.origin !== 'https://admin.invalid') return '/admin';
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return '/admin';
    const path = internalAdminPath(decodeURIComponent(url.pathname));
    if (
      [...publicAdminPaths].some(
        (publicPath) => path === publicPath || path.startsWith(`${publicPath}/`),
      )
    )
      return '/admin';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/admin';
  }
}

// Page visibility is an additional gate. APIs still authorize each operation separately.
const pageCapabilities: readonly (readonly [string, string])[] = [
  ['/products/new', 'catalog.manage'],
  ['/products/price-review', 'pricing.view'],
  ['/products', 'catalog.view'],
  ['/categories', 'catalog.manage'],
  ['/recommendations', 'recommendations.view'],
  ['/media/settings', 'media.manage'],
  ['/media', 'media.view'],
  ['/orders/new', 'orders.create'],
  ['/orders', 'orders.view'],
  ['/customers', 'customers.view'],
  ['/reviews', 'reviews.view'],
  ['/pricing', 'pricing.view'],
  ['/promotions', 'promotions.view'],
  ['/inventory/warehouses', 'warehouse.view'],
  ['/inventory/transfers', 'inventory.transfer'],
  ['/inventory/stocktakes', 'inventory.stocktake'],
  ['/inventory/units', 'inventory.units.view'],
  ['/inventory', 'inventory.view'],
  ['/sizing', 'sizing.view'],
  ['/supply', 'procurement.view'],
  ['/suppliers', 'procurement.view'],
  ['/purchases', 'procurement.view'],
  ['/inbound-shipments', 'inbound_shipment.view'],
  ['/receiving', 'receiving.view'],
  ['/landed-cost', 'landed_cost.view'],
  ['/fulfillments', 'fulfillment.view'],
  ['/deliveries', 'delivery.view'],
  ['/delivery', 'delivery.view'],
  ['/rto', 'returns.view'],
  ['/returns', 'returns.view'],
  ['/payments', 'payments.view'],
  ['/finance', 'finance.view'],
  ['/costing', 'finance.view'],
  ['/assets', 'assets.view'],
  ['/operations', 'admin.operations.view'],
  ['/analytics', 'analytics.view'],
  ['/integrity', 'admin.integrity.view'],
  ['/messaging', 'messaging.inbox.view_assigned'],
  ['/notifications', 'notifications.view'],
  ['/email', 'notifications.view'],
  ['/sms', 'notifications.sms.view'],
  ['/team', 'admin.team.view'],
  ['/settings/organization', 'settings.organization.manage'],
  ['/settings/colors', 'catalog.view'],
  ['/settings/integrations', 'integrations.view'],
  ['/integrations', 'integrations.view'],
  ['/settings/security', 'settings.view'],
  ['/settings/health', 'settings.view'],
  ['/settings/system', 'settings.view'],
  ['/settings/storefront', 'settings.view'],
];

export function pageCapability(pathname: string): string | undefined {
  const path = internalAdminPath(pathname);
  if (/^\/products\/[^/]+\/edit$/.test(path)) return 'catalog.manage';
  return pageCapabilities.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
}

export function decideAdminAccess(context: AdminContextDto, pathname: string): AdminAccessDecision {
  if (context.twoFactor.accessRestricted)
    return { kind: 'TWO_FACTOR_ENROLLMENT_REQUIRED', context };
  const capability = pageCapability(pathname);
  if (
    capability &&
    context.membershipType !== 'OWNER' &&
    !context.capabilities.includes(capability)
  ) {
    return { kind: 'ACCESS_DENIED' };
  }
  return { kind: 'AUTHORIZED', context };
}
