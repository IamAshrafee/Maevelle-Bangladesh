import type { AdminContextDto } from '@maevelle/contracts';
import { internalAdminPath, pageCapability } from '@/lib/auth/access-policy';

export type NavIconKey =
  | 'activity'
  | 'bar-chart'
  | 'bell'
  | 'boxes'
  | 'briefcase'
  | 'building'
  | 'circle-dollar'
  | 'clipboard-check'
  | 'credit-card'
  | 'folder-tree'
  | 'gauge'
  | 'hand-coins'
  | 'heart-handshake'
  | 'image'
  | 'inbox'
  | 'landmark'
  | 'laptop'
  | 'layout-dashboard'
  | 'mail'
  | 'message-square'
  | 'package-check'
  | 'package-open'
  | 'package-search'
  | 'palette'
  | 'plug'
  | 'receipt'
  | 'refresh-cw'
  | 'ruler'
  | 'scan-barcode'
  | 'settings'
  | 'shield-check'
  | 'shopping-bag'
  | 'sparkles'
  | 'tags'
  | 'truck'
  | 'user'
  | 'user-round-cog'
  | 'users'
  | 'warehouse';

export type PageWidthVariant = 'wide' | 'standard' | 'narrow' | 'immersive';

export type OperationalPillarId =
  | 'command'
  | 'inbox'
  | 'sales-delivery'
  | 'customers'
  | 'catalog'
  | 'inventory'
  | 'warehouses'
  | 'supply-procurement'
  | 'channels'
  | 'finance-intel'
  | 'platform-admin'
  | 'personal'
  | 'public-auth';

export type ModuleNavId =
  | 'orders'
  | 'delivery'
  | 'customers'
  | 'products'
  | 'sizing'
  | 'inventory'
  | 'supply'
  | 'finance'
  | 'settings';

export interface RouteEntry {
  /** Pattern matching app route path without /admin basePath (e.g. '/orders/[id]'). */
  readonly pattern: string;
  /** Canonical concrete path for static routes & navigation links. */
  readonly href?: string;
  readonly label: string;
  readonly description: string;
  readonly pillar: OperationalPillarId;
  readonly pageVariant: PageWidthVariant;
  readonly moduleId?: ModuleNavId;
  readonly capability?: string;
  readonly ownerOnly?: boolean;
  readonly breadcrumbParent?: string;
  readonly aliases?: readonly string[];
  readonly icon: NavIconKey;
  readonly keywords?: string;
}

export interface SidebarNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: NavIconKey;
  readonly capability?: string;
  readonly ownerOnly?: boolean;
  readonly exactPrefixes?: readonly string[];
  readonly matchPrefixes?: readonly string[];
  readonly excludePrefixes?: readonly string[];
  readonly keywords?: string;
}

export interface SidebarPillarGroup {
  readonly id: OperationalPillarId;
  readonly label: string;
  readonly items: readonly SidebarNavItem[];
}

export interface ModuleNavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: NavIconKey;
  readonly capability?: string;
  readonly ownerOnly?: boolean;
  readonly exact?: boolean;
  readonly aliases?: readonly string[];
  /** Overflow items render inside the ModuleNav `More` popover to keep <= 5 primary pills. */
  readonly overflow?: boolean;
}

/**
 * Authoritative registry of all App Router pages under `apps/admin/app`.
 * Drives sidebar generation, Layer 2 `<ModuleNav>`, `⌘K` search, and breadcrumb trails.
 */
export const ROUTE_REGISTRY: readonly RouteEntry[] = [
  // Public & Auth Bypass
  {
    pattern: '/login',
    href: '/login',
    label: 'Sign in',
    description: 'Sign in to Maevelle Admin.',
    pillar: 'public-auth',
    pageVariant: 'standard',
    icon: 'shield-check',
  },
  {
    pattern: '/two-factor',
    href: '/two-factor',
    label: 'Two-factor verification',
    description: 'Confirm your session with an authenticator or recovery code.',
    pillar: 'public-auth',
    pageVariant: 'standard',
    icon: 'shield-check',
  },
  {
    pattern: '/accept-invitation',
    href: '/accept-invitation',
    label: 'Accept invitation',
    description: 'Activate your invited administrator membership.',
    pillar: 'public-auth',
    pageVariant: 'standard',
    icon: 'user',
  },
  {
    pattern: '/access-status',
    href: '/access-status',
    label: 'Access status',
    description: 'Session and organization access status.',
    pillar: 'public-auth',
    pageVariant: 'narrow',
    icon: 'shield-check',
  },

  // 1. Command & Alerts
  {
    pattern: '/',
    href: '/',
    label: 'Dashboard',
    description: 'Live operating signals across commerce, inventory, delivery, and money.',
    pillar: 'command',
    pageVariant: 'standard',
    icon: 'layout-dashboard',
    keywords: 'home overview kpi snapshot',
  },
  {
    pattern: '/operations',
    href: '/operations',
    label: 'Attention',
    description: 'Priority queue for operational exceptions, imports, and system notices.',
    pillar: 'command',
    pageVariant: 'wide',
    capability: 'admin.operations.view',
    breadcrumbParent: '/',
    icon: 'gauge',
    keywords: 'alerts attention queue imports exports jobs',
  },

  // 2. Inbox (Standalone Immersive App)
  {
    pattern: '/messaging',
    href: '/messaging',
    label: 'Live Inbox',
    description: 'Omnichannel customer conversations, follow-ups, and chat-to-order workflows.',
    pillar: 'inbox',
    pageVariant: 'immersive',
    capability: 'messaging.inbox.view_assigned',
    icon: 'inbox',
    keywords: 'inbox chat messenger instagram conversations support',
  },

  // 3. Sales & Delivery
  {
    pattern: '/orders',
    href: '/orders',
    label: 'Orders',
    description: 'Search, review, confirm, and manage customer orders.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'orders',
    capability: 'orders.view',
    icon: 'shopping-bag',
    keywords: 'sales orders manual draft cod checkout',
  },
  {
    pattern: '/orders/new',
    href: '/orders/new',
    label: 'Create Manual Order',
    description: 'Place a new order on behalf of a buyer.',
    pillar: 'sales-delivery',
    pageVariant: 'narrow',
    moduleId: 'orders',
    capability: 'orders.create',
    breadcrumbParent: '/orders',
    icon: 'shopping-bag',
    keywords: 'manual phone chat order create',
  },
  {
    pattern: '/orders/delivery-pricing',
    href: '/orders/delivery-pricing',
    label: 'Delivery Pricing',
    description: 'Configure shipping zone rates and delivery fee rules.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'orders',
    capability: 'orders.view',
    breadcrumbParent: '/orders',
    icon: 'circle-dollar',
    keywords: 'delivery fee dhaka suburbs zone rate shipping charge',
  },
  {
    pattern: '/orders/[id]',
    label: 'Order Details',
    description: 'Order items, verification, courier dispatch, and timeline.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    capability: 'orders.view',
    breadcrumbParent: '/orders',
    icon: 'shopping-bag',
  },
  {
    pattern: '/payments',
    href: '/payments',
    label: 'Payments',
    description: 'Verify bKash/Nagad claims, destinations, and cash policies.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    capability: 'payments.view',
    icon: 'credit-card',
    keywords: 'bkash nagad trxid verify verification cash collection',
  },
  {
    pattern: '/payments/[paymentId]',
    label: 'Payment Detail',
    description: 'Inspect payment claims, settlement status, and adjustments.',
    pillar: 'sales-delivery',
    pageVariant: 'standard',
    capability: 'payments.view',
    breadcrumbParent: '/payments',
    icon: 'credit-card',
  },
  {
    pattern: '/fulfillments',
    href: '/fulfillments',
    label: 'Fulfillment',
    description: 'Warehouse pick, pack, and dispatch preparation.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'delivery',
    capability: 'fulfillment.view',
    icon: 'boxes',
    keywords: 'pick pack packing slip dispatch warehouse',
  },
  {
    pattern: '/deliveries',
    href: '/deliveries',
    label: 'Deliveries',
    description: 'Courier consignments, bookings, and in-transit parcels.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'delivery',
    capability: 'delivery.view',
    icon: 'truck',
    keywords: 'courier bookings pathao steadfast parcels shipping',
  },
  {
    pattern: '/delivery',
    href: '/delivery',
    label: 'Delivery Operations',
    description: 'Unified command overview for dispatch, exceptions, and returns intake.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'delivery',
    capability: 'delivery.view',
    breadcrumbParent: '/deliveries',
    icon: 'truck',
    keywords: 'delivery exceptions overview logistics',
  },
  {
    pattern: '/delivery/couriers',
    href: '/delivery/couriers',
    label: 'Couriers',
    description: 'Carrier performance, booking health, and courier configurations.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'delivery',
    capability: 'delivery.view',
    breadcrumbParent: '/deliveries',
    icon: 'bar-chart',
    keywords: 'pathao steadfast courier performance carrier',
  },
  {
    pattern: '/returns',
    href: '/returns',
    label: 'Returns',
    description: 'Customer return authorization, reverse transport, and receipt grading.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'delivery',
    capability: 'returns.view',
    icon: 'package-open',
    keywords: 'returns refunds reverse logistics',
  },
  {
    pattern: '/rto',
    href: '/rto',
    label: 'Return to Origin (RTO)',
    description: 'Track failed-delivery parcels returning from couriers.',
    pillar: 'sales-delivery',
    pageVariant: 'wide',
    moduleId: 'delivery',
    capability: 'returns.view',
    breadcrumbParent: '/returns',
    icon: 'truck',
    keywords: 'rto failed delivery undelivered parcel',
  },

  // 4. Customers & Reviews
  {
    pattern: '/customers',
    href: '/customers',
    label: 'Customers',
    description: 'Buyer directory, order history, and risk flags.',
    pillar: 'customers',
    pageVariant: 'wide',
    moduleId: 'customers',
    capability: 'customers.view',
    icon: 'users',
    keywords: 'crm buyers directory phone profiles',
  },
  {
    pattern: '/customers/new',
    href: '/customers/new',
    label: 'New Customer',
    description: 'Create a customer profile manually.',
    pillar: 'customers',
    pageVariant: 'narrow',
    moduleId: 'customers',
    capability: 'customers.manage',
    breadcrumbParent: '/customers',
    icon: 'user',
  },
  {
    pattern: '/customers/[id]',
    label: 'Customer Profile',
    description: 'Customer 360 profile, order stream, communications, and restrictions.',
    pillar: 'customers',
    pageVariant: 'wide',
    capability: 'customers.view',
    breadcrumbParent: '/customers',
    icon: 'user',
  },
  {
    pattern: '/customers/segments',
    href: '/customers/segments',
    label: 'Segments',
    description: 'Dynamic buyer cohorts and audience targeting.',
    pillar: 'customers',
    pageVariant: 'wide',
    moduleId: 'customers',
    capability: 'customers.view',
    breadcrumbParent: '/customers',
    icon: 'users',
  },
  {
    pattern: '/customers/segments/[segmentId]',
    label: 'Segment Detail',
    description: 'Segment rules and matching customer accounts.',
    pillar: 'customers',
    pageVariant: 'wide',
    capability: 'customers.view',
    breadcrumbParent: '/customers/segments',
    icon: 'users',
  },
  {
    pattern: '/customers/duplicates',
    href: '/customers/duplicates',
    label: 'Duplicates & Merge',
    description: 'Identify and merge duplicate buyer profiles.',
    pillar: 'customers',
    pageVariant: 'wide',
    moduleId: 'customers',
    capability: 'customers.view',
    breadcrumbParent: '/customers',
    icon: 'users',
  },
  {
    pattern: '/customers/identities',
    href: '/customers/identities',
    label: 'Identities',
    description: 'Verify cross-channel buyer identities and claims.',
    pillar: 'customers',
    pageVariant: 'wide',
    moduleId: 'customers',
    capability: 'customers.view',
    breadcrumbParent: '/customers',
    icon: 'shield-check',
  },
  {
    pattern: '/customers/privacy',
    href: '/customers/privacy',
    label: 'Privacy Requests',
    description: 'Export and anonymization requests for buyer privacy compliance.',
    pillar: 'customers',
    pageVariant: 'standard',
    moduleId: 'customers',
    capability: 'customers.view',
    breadcrumbParent: '/customers',
    icon: 'shield-check',
  },
  {
    pattern: '/customers/analytics',
    href: '/customers/analytics',
    label: 'CRM Analytics',
    description: 'Cohort retention, repeat purchase, and lifetime value metrics.',
    pillar: 'customers',
    pageVariant: 'standard',
    moduleId: 'customers',
    capability: 'customers.view',
    breadcrumbParent: '/customers',
    icon: 'bar-chart',
  },
  {
    pattern: '/customers/settings',
    href: '/customers/settings',
    label: 'CRM Settings',
    description: 'Custom CRM fields, customer preferences, and CRM policies.',
    pillar: 'customers',
    pageVariant: 'standard',
    moduleId: 'customers',
    capability: 'customers.view',
    breadcrumbParent: '/customers',
    icon: 'settings',
  },
  {
    pattern: '/reviews',
    href: '/reviews',
    label: 'Reviews',
    description: 'Moderate customer ratings, feedback, and published reviews.',
    pillar: 'customers',
    pageVariant: 'wide',
    capability: 'reviews.view',
    icon: 'heart-handshake',
    keywords: 'ratings testimonials moderation feedback',
  },

  // 5. Catalog & Merchandising
  {
    pattern: '/products',
    href: '/products',
    label: 'Products',
    description: 'Master catalog, SKUs, variant attributes, and publication status.',
    pillar: 'catalog',
    pageVariant: 'wide',
    moduleId: 'products',
    capability: 'catalog.view',
    icon: 'package-search',
    keywords: 'catalog sku items products variants',
  },
  {
    pattern: '/products/new',
    href: '/products/new',
    label: 'New Product',
    description: 'Create and configure a new catalog item and variants.',
    pillar: 'catalog',
    pageVariant: 'wide',
    capability: 'catalog.manage',
    breadcrumbParent: '/products',
    icon: 'sparkles',
  },
  {
    pattern: '/products/[productId]',
    label: 'Product Workspace',
    description: 'Product readiness, inventory, pricing, and configuration summary.',
    pillar: 'catalog',
    pageVariant: 'wide',
    capability: 'catalog.view',
    breadcrumbParent: '/products',
    icon: 'package-search',
  },
  {
    pattern: '/products/[productId]/edit',
    label: 'Edit Product',
    description: 'Modify catalog content, media, pricing, and variants.',
    pillar: 'catalog',
    pageVariant: 'wide',
    capability: 'catalog.manage',
    breadcrumbParent: '/products',
    icon: 'package-search',
  },
  {
    pattern: '/products/price-review',
    href: '/products/price-review',
    label: 'Price Review',
    description: 'Review margin protection, pricing parity, and discrepancies.',
    pillar: 'catalog',
    pageVariant: 'wide',
    moduleId: 'products',
    capability: 'pricing.view',
    breadcrumbParent: '/products',
    icon: 'tags',
  },
  {
    pattern: '/categories',
    href: '/categories',
    label: 'Product Organization',
    description: 'Categories, tags, occasions, and merchandising collections.',
    pillar: 'catalog',
    pageVariant: 'wide',
    moduleId: 'products',
    capability: 'catalog.manage',
    breadcrumbParent: '/products',
    icon: 'folder-tree',
    keywords: 'categories tags occasions collections taxonomy',
  },
  {
    pattern: '/recommendations',
    href: '/recommendations',
    label: 'Recommendations',
    description: 'Compatibility rules, upsell pairings, and coverage.',
    pillar: 'catalog',
    pageVariant: 'wide',
    capability: 'recommendations.view',
    icon: 'bar-chart',
    keywords: 'upsell cross sell pairings bundles',
  },
  {
    pattern: '/pricing',
    href: '/pricing',
    label: 'Pricing',
    description: 'Variant pricing schedules, adjustments, and price history.',
    pillar: 'catalog',
    pageVariant: 'wide',
    moduleId: 'products',
    capability: 'pricing.view',
    icon: 'tags',
    keywords: 'price list books scheduled price',
  },
  {
    pattern: '/promotions',
    href: '/promotions',
    label: 'Promotions',
    description: 'Discount campaigns, promo codes, and conditional offers.',
    pillar: 'catalog',
    pageVariant: 'wide',
    capability: 'promotions.view',
    icon: 'hand-coins',
    keywords: 'coupons codes flash sales discounts',
  },
  {
    pattern: '/media',
    href: '/media',
    label: 'Media Library',
    description: 'Central library for product and brand visual assets.',
    pillar: 'catalog',
    pageVariant: 'wide',
    capability: 'media.view',
    icon: 'image',
    keywords: 'photos images uploads derivatives cdn',
  },
  {
    pattern: '/media/settings',
    href: '/media/settings',
    label: 'Media Settings',
    description: 'Configure upload limits, expiry, and image runtime policy.',
    pillar: 'catalog',
    pageVariant: 'standard',
    capability: 'media.manage',
    breadcrumbParent: '/media',
    icon: 'settings',
  },
  {
    pattern: '/sizing',
    href: '/sizing',
    label: 'Sizing & Fit',
    description: 'Size guides, measurement specifications, and category sizing.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    icon: 'ruler',
    keywords: 'size chart measurements fit tolerance',
  },
  {
    pattern: '/sizing/guides',
    href: '/sizing/guides',
    label: 'Size Guides',
    description: 'Create and maintain measurement charts.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/guides/[guideId]',
    label: 'Size Guide Detail',
    description: 'Inspect and edit chart rows and publishing status.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing/guides',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/assignments',
    href: '/sizing/assignments',
    label: 'Sizing Assignments',
    description: 'Assign size guides to catalog categories and products.',
    pillar: 'catalog',
    pageVariant: 'wide',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/attention',
    href: '/sizing/attention',
    label: 'Sizing Attention',
    description: 'Review missing size guides and measurement mismatches.',
    pillar: 'catalog',
    pageVariant: 'wide',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/standards',
    href: '/sizing/standards',
    label: 'Sizing Standards',
    description: 'Global measurement scales and tolerance baselines.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/categories',
    href: '/sizing/categories',
    label: 'Sizing Categories',
    description: 'Configure category-level sizing behavior.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'folder-tree',
  },
  {
    pattern: '/sizing/domains',
    href: '/sizing/domains',
    label: 'Sizing Domains',
    description: 'Manage sizing domain definitions.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/mappings',
    href: '/sizing/mappings',
    label: 'Size Mappings',
    description: 'Cross-standard size conversion tables.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/measurements',
    href: '/sizing/measurements',
    label: 'Measurements',
    description: 'Dimension definitions and unit types.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/sizes',
    href: '/sizing/sizes',
    label: 'Sizes Dictionary',
    description: 'Canonical size codes and ordering.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'ruler',
  },
  {
    pattern: '/sizing/settings',
    href: '/sizing/settings',
    label: 'Sizing Settings',
    description: 'Configure default sizing workflows.',
    pillar: 'catalog',
    pageVariant: 'standard',
    moduleId: 'sizing',
    capability: 'sizing.view',
    breadcrumbParent: '/sizing',
    icon: 'settings',
  },

  // 6. Inventory & Supply
  {
    pattern: '/inventory',
    href: '/inventory',
    label: 'Inventory',
    description: 'Operational stock overview, alerts, and warehouse readiness.',
    pillar: 'inventory',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.view',
    icon: 'boxes',
    keywords: 'inventory stock warehouse stocktake barcode',
  },
  {
    pattern: '/inventory/stock',
    href: '/inventory/stock',
    label: 'Stock Positions',
    description: 'On-hand, reserved, and available quantities by facility.',
    pillar: 'inventory',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.view',
    breadcrumbParent: '/inventory',
    icon: 'boxes',
  },
  {
    pattern: '/inventory/stock/[inventoryItemId]',
    label: 'Stock Item Detail',
    description: 'Facility allocations, movements, and unit ledger for one item.',
    pillar: 'inventory',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.view',
    breadcrumbParent: '/inventory/stock',
    icon: 'boxes',
  },
  {
    pattern: '/inventory/warehouses',
    href: '/inventory/warehouses',
    label: 'Locations',
    description: 'Warehouses, retail locations, and holding zones.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'warehouse.view',
    breadcrumbParent: '/inventory',
    icon: 'warehouse',
  },
  {
    pattern: '/inventory/warehouses/new',
    href: '/inventory/warehouses/new',
    label: 'New Location',
    description: 'Register a new warehouse or storage location.',
    pillar: 'warehouses',
    pageVariant: 'narrow',
    moduleId: 'inventory',
    capability: 'warehouse.manage',
    breadcrumbParent: '/inventory/warehouses',
    icon: 'warehouse',
  },
  {
    pattern: '/inventory/warehouses/[locationId]',
    label: 'Location Detail',
    description: 'Facility capabilities, positions, and active transfers.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'warehouse.view',
    breadcrumbParent: '/inventory/warehouses',
    icon: 'warehouse',
  },
  {
    pattern: '/inventory/transfers',
    href: '/inventory/transfers',
    label: 'Transfers',
    description: 'Inter-location stock transfers, transit receipts, and discrepancies.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.transfer',
    breadcrumbParent: '/inventory',
    icon: 'refresh-cw',
  },
  {
    pattern: '/inventory/transfers/new',
    href: '/inventory/transfers/new',
    label: 'New Transfer',
    description: 'Create an inter-warehouse inventory transfer.',
    pillar: 'warehouses',
    pageVariant: 'standard',
    moduleId: 'inventory',
    capability: 'inventory.transfer',
    breadcrumbParent: '/inventory/transfers',
    icon: 'refresh-cw',
  },
  {
    pattern: '/inventory/transfers/[transferId]',
    label: 'Transfer Detail',
    description: 'Inspect dispatch, receiving progress, and variance handling.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.transfer',
    breadcrumbParent: '/inventory/transfers',
    icon: 'refresh-cw',
  },
  {
    pattern: '/inventory/transfers/[transferId]/edit',
    label: 'Edit Transfer',
    description: 'Update draft inventory transfer lines.',
    pillar: 'warehouses',
    pageVariant: 'standard',
    moduleId: 'inventory',
    capability: 'inventory.transfer',
    breadcrumbParent: '/inventory/transfers',
    icon: 'refresh-cw',
  },
  {
    pattern: '/inventory/stocktakes',
    href: '/inventory/stocktakes',
    label: 'Stocktakes',
    description: 'Cycle counts and physical inventory reconciliations.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.stocktake',
    breadcrumbParent: '/inventory',
    icon: 'clipboard-check',
  },
  {
    pattern: '/inventory/stocktakes/new',
    href: '/inventory/stocktakes/new',
    label: 'New Stocktake',
    description: 'Start a physical count session.',
    pillar: 'warehouses',
    pageVariant: 'standard',
    moduleId: 'inventory',
    capability: 'inventory.stocktake',
    breadcrumbParent: '/inventory/stocktakes',
    icon: 'clipboard-check',
  },
  {
    pattern: '/inventory/stocktakes/[stocktakeId]',
    label: 'Stocktake Session',
    description: 'Record counts and reconcile inventory variances.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.stocktake',
    breadcrumbParent: '/inventory/stocktakes',
    icon: 'clipboard-check',
  },
  {
    pattern: '/inventory/units',
    href: '/inventory/units',
    label: 'Unit QC & Barcodes',
    description: 'Serialized item quality inspection, custody, and barcode queue.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.units.view',
    breadcrumbParent: '/inventory',
    icon: 'scan-barcode',
  },
  {
    pattern: '/inventory/units/repairs',
    href: '/inventory/units/repairs',
    label: 'Unit Repairs',
    description: 'Manage units undergoing refurbishment or repair.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.units.view',
    breadcrumbParent: '/inventory/units',
    icon: 'scan-barcode',
  },
  {
    pattern: '/inventory/units/scan',
    href: '/inventory/units/scan',
    label: 'Scan Unit',
    description: 'Focused scanner terminal for rapid unit barcode lookup.',
    pillar: 'warehouses',
    pageVariant: 'immersive',
    capability: 'inventory.units.view',
    breadcrumbParent: '/inventory/units',
    icon: 'scan-barcode',
    keywords: 'scanner camera barcode lookup mvu',
  },
  {
    pattern: '/inventory/units/[id]',
    label: 'Unit Detail',
    description: 'Unit barcode lifecycle, QC checks, and location trace.',
    pillar: 'warehouses',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.units.view',
    breadcrumbParent: '/inventory/units',
    icon: 'scan-barcode',
  },
  {
    pattern: '/inventory/adjustments',
    href: '/inventory/adjustments',
    label: 'Adjustments',
    description: 'Manual stock adjustments and correction audits.',
    pillar: 'inventory',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.adjust',
    breadcrumbParent: '/inventory',
    icon: 'boxes',
  },
  {
    pattern: '/inventory/history',
    href: '/inventory/history',
    label: 'Movement History',
    description: 'Chronological inventory movement ledger.',
    pillar: 'inventory',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.view',
    breadcrumbParent: '/inventory',
    icon: 'activity',
  },
  {
    pattern: '/inventory/replenishment',
    href: '/inventory/replenishment',
    label: 'Replenishment',
    description: 'Low-stock alerts and restock rules.',
    pillar: 'inventory',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.view',
    breadcrumbParent: '/inventory',
    icon: 'boxes',
  },
  {
    pattern: '/inventory/reservations',
    href: '/inventory/reservations',
    label: 'Reservations',
    description: 'Allocated and held stock reservations per order.',
    pillar: 'inventory',
    pageVariant: 'wide',
    moduleId: 'inventory',
    capability: 'inventory.view',
    breadcrumbParent: '/inventory',
    icon: 'boxes',
  },
  {
    pattern: '/inventory/settings',
    href: '/inventory/settings',
    label: 'Inventory Settings',
    description: 'Configure stock threshold policies.',
    pillar: 'inventory',
    pageVariant: 'standard',
    moduleId: 'inventory',
    capability: 'inventory.view',
    breadcrumbParent: '/inventory',
    icon: 'settings',
  },
  {
    pattern: '/supply',
    href: '/supply',
    label: 'Supply & Procurement',
    description: 'Overview across suppliers, purchase orders, shipments, and dock intake.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'procurement.view',
    icon: 'building',
    keywords: 'procurement purchasing po vendors freight receiving',
  },
  {
    pattern: '/suppliers',
    href: '/suppliers',
    label: 'Suppliers',
    description: 'Vendor directory, commercial agreements, and lead times.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'procurement.view',
    breadcrumbParent: '/supply',
    icon: 'building',
  },
  {
    pattern: '/suppliers/[supplierId]',
    label: 'Supplier Detail',
    description: 'Vendor details, agreements, and purchase history.',
    pillar: 'supply-procurement',
    pageVariant: 'standard',
    moduleId: 'supply',
    capability: 'procurement.view',
    breadcrumbParent: '/suppliers',
    icon: 'building',
  },
  {
    pattern: '/purchases',
    href: '/purchases',
    label: 'Purchase Orders',
    description: 'Manage supplier purchase orders and line allocations.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'procurement.view',
    breadcrumbParent: '/supply',
    icon: 'shopping-bag',
  },
  {
    pattern: '/purchases/[purchaseId]',
    label: 'Purchase Detail',
    description: 'Purchase order lines, invoices, and linked shipments.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'procurement.view',
    breadcrumbParent: '/purchases',
    icon: 'shopping-bag',
  },
  {
    pattern: '/inbound-shipments',
    href: '/inbound-shipments',
    label: 'Inbound Shipments',
    description: 'Track supplier freight shipments and arrival notices.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'inbound_shipment.view',
    breadcrumbParent: '/supply',
    icon: 'truck',
  },
  {
    pattern: '/inbound-shipments/[shipmentId]',
    label: 'Shipment Detail',
    description: 'Freight lines, landed cost allocations, and warehouse receipt status.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'inbound_shipment.view',
    breadcrumbParent: '/inbound-shipments',
    icon: 'truck',
  },
  {
    pattern: '/receiving',
    href: '/receiving',
    label: 'Goods Receiving',
    description: 'Dock intake, physical inspection, and inventory posting.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'receiving.view',
    breadcrumbParent: '/supply',
    icon: 'package-check',
  },
  {
    pattern: '/receiving/[receiptId]',
    label: 'Receiving Worksheet',
    description: 'Inspect and post received units to stock.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'receiving.view',
    breadcrumbParent: '/receiving',
    icon: 'package-check',
  },
  {
    pattern: '/landed-cost',
    href: '/landed-cost',
    label: 'Landed Cost',
    description: 'Allocate freight, customs duty, and handling across stock units.',
    pillar: 'supply-procurement',
    pageVariant: 'wide',
    moduleId: 'supply',
    capability: 'landed_cost.view',
    breadcrumbParent: '/supply',
    icon: 'landmark',
  },

  // 7. Finance & Intelligence
  {
    pattern: '/finance',
    href: '/finance',
    label: 'Finance',
    description: 'Treasury, cash accounts, expenses, COD settlements, and ledger summary.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'finance.view',
    icon: 'landmark',
    keywords: 'treasury money bank bkash ledger accounting',
  },
  {
    pattern: '/finance/accounts',
    href: '/finance/accounts',
    label: 'Accounts & Wallets',
    description: 'Bank, merchant wallet, and cash registers.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'finance.accounts.view',
    breadcrumbParent: '/finance',
    icon: 'landmark',
  },
  {
    pattern: '/finance/accounts/[accountId]',
    label: 'Account Detail',
    description: 'Account balances, transfers, and entry history.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'finance.accounts.view',
    breadcrumbParent: '/finance/accounts',
    icon: 'landmark',
  },
  {
    pattern: '/finance/expenses',
    href: '/finance/expenses',
    label: 'Operating Expenses',
    description: 'Record and settle business operating expenses.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'finance.expenses.view',
    breadcrumbParent: '/finance',
    icon: 'receipt',
  },
  {
    pattern: '/finance/expenses/[expenseId]',
    label: 'Expense Detail',
    description: 'Expense categorization, settlement status, and receipts.',
    pillar: 'finance-intel',
    pageVariant: 'standard',
    moduleId: 'finance',
    capability: 'finance.expenses.view',
    breadcrumbParent: '/finance/expenses',
    icon: 'receipt',
  },
  {
    pattern: '/finance/cod-settlements',
    href: '/finance/cod-settlements',
    label: 'COD Settlements',
    description: 'Reconcile courier COD remittances against shipped orders.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'finance.cod_settlements.view',
    breadcrumbParent: '/finance',
    icon: 'circle-dollar',
  },
  {
    pattern: '/finance/movements',
    href: '/finance/movements',
    label: 'Cash Movements',
    description: 'Chronological financial transactions across all accounts.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'finance.view',
    breadcrumbParent: '/finance',
    icon: 'briefcase',
  },
  {
    pattern: '/finance/transfers',
    href: '/finance/transfers',
    label: 'Internal Transfers',
    description: 'Transfer funds between bank, cash, and mobile wallet accounts.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'finance.view',
    breadcrumbParent: '/finance',
    icon: 'refresh-cw',
  },
  {
    pattern: '/finance/reconciliation',
    href: '/finance/reconciliation',
    label: 'Reconciliation',
    description: 'Bank and wallet balance matching and discrepancy closures.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    moduleId: 'finance',
    capability: 'reconciliation.view',
    breadcrumbParent: '/finance',
    icon: 'clipboard-check',
  },
  {
    pattern: '/finance/capital',
    href: '/finance/capital',
    label: 'Capital & Equity',
    description: 'Owner contributions, drawings, and equity ledger.',
    pillar: 'finance-intel',
    pageVariant: 'standard',
    moduleId: 'finance',
    capability: 'finance.capital.view',
    breadcrumbParent: '/finance',
    icon: 'landmark',
  },
  {
    pattern: '/costing',
    href: '/costing',
    label: 'Costing & Margins',
    description: 'Unit landed costs, weighted COGS, and gross margins.',
    pillar: 'finance-intel',
    pageVariant: 'standard',
    capability: 'costing.view',
    icon: 'landmark',
    keywords: 'cogs landed cost unit margin',
  },
  {
    pattern: '/assets',
    href: '/assets',
    label: 'Fixed Assets',
    description: 'Register and track equipment, maintenance, and custody.',
    pillar: 'finance-intel',
    pageVariant: 'wide',
    capability: 'assets.view',
    icon: 'briefcase',
    keywords: 'equipment furniture fixed assets depreciation',
  },
  {
    pattern: '/assets/[assetId]',
    label: 'Asset Detail',
    description: 'Equipment custody, service logs, and valuation lifecycle.',
    pillar: 'finance-intel',
    pageVariant: 'standard',
    capability: 'assets.view',
    breadcrumbParent: '/assets',
    icon: 'briefcase',
  },
  {
    pattern: '/analytics',
    href: '/analytics',
    label: 'Analytics',
    description: 'Sales, commercial integrity, wishlist, cart, and operational reports.',
    pillar: 'finance-intel',
    pageVariant: 'standard',
    capability: 'analytics.view',
    icon: 'bar-chart',
    keywords: 'reports kpi revenue ltv wishlist cart analytics bi',
  },
  {
    pattern: '/integrity',
    href: '/integrity',
    label: 'System Integrity',
    description: 'Cross-module health scans, findings, and projection recovery.',
    pillar: 'finance-intel',
    pageVariant: 'standard',
    capability: 'admin.integrity.view',
    icon: 'shield-check',
    keywords: 'audit consistency checks anomaly repair diagnostics',
  },

  // Platform & Channels Admin (Sidebar Utility Footer)
  {
    pattern: '/notifications',
    href: '/notifications',
    label: 'Notifications',
    description: 'Alert inbox, delivery history, multi-channel templates, and dispatch rules.',
    pillar: 'channels',
    pageVariant: 'wide',
    capability: 'notifications.view',
    icon: 'bell',
    keywords: 'alerts templates dispatch rules worker health',
  },
  {
    pattern: '/email',
    href: '/email',
    label: 'Email Operations',
    description: 'Transactional email delivery logs, templates, suppressions, and diagnostics.',
    pillar: 'channels',
    pageVariant: 'wide',
    capability: 'notifications.view',
    icon: 'mail',
    keywords: 'resend email smtp deliverability dkim spf bounces',
  },
  {
    pattern: '/email/settings',
    href: '/email/settings',
    label: 'Email Settings',
    description: 'Configure Resend sender identities and default dispatch policies.',
    pillar: 'channels',
    pageVariant: 'standard',
    capability: 'settings.email.manage',
    breadcrumbParent: '/email',
    icon: 'settings',
  },
  {
    pattern: '/sms',
    href: '/sms',
    label: 'SMS Operations',
    description: 'SMS gateway delivery, credits, templates, BTRC policies, and suppressions.',
    pillar: 'channels',
    pageVariant: 'wide',
    capability: 'notifications.sms.view',
    icon: 'message-square',
    keywords: 'sms otp masking telecom carrier gateway',
  },
  {
    pattern: '/integrations',
    href: '/integrations',
    label: 'Integrations Directory',
    description: 'Overview of external courier, email, SMS, and social integrations.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'integrations.view',
    breadcrumbParent: '/settings/integrations',
    icon: 'plug',
  },
  {
    pattern: '/team',
    href: '/team',
    label: 'Team & Permissions',
    description: 'Staff memberships, roles, invitations, and access audit logs.',
    pillar: 'platform-admin',
    pageVariant: 'wide',
    capability: 'admin.team.view',
    icon: 'user-round-cog',
    keywords: 'staff users permissions rbac invitations roles',
  },
  {
    pattern: '/team/[id]',
    label: 'Member Profile',
    description: 'Staff capability grants, sessions, 2FA, and lifecycle actions.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    capability: 'admin.team.view',
    breadcrumbParent: '/team',
    icon: 'user',
  },
  {
    pattern: '/settings',
    href: '/settings',
    label: 'Settings',
    description: 'Central administration hub for workspace, security, and platform defaults.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'settings.view',
    icon: 'settings',
    keywords: 'configuration preferences setup defaults',
  },
  {
    pattern: '/settings/general',
    href: '/settings/general',
    label: 'General Settings',
    description: 'Store name, support contact, timezone, and session defaults.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'settings.view',
    breadcrumbParent: '/settings',
    icon: 'settings',
  },
  {
    pattern: '/settings/organization',
    href: '/settings/organization',
    label: 'Organization',
    description: 'Organization metadata and business profile.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'settings.organization.manage',
    breadcrumbParent: '/settings',
    icon: 'building',
  },
  {
    pattern: '/settings/security',
    href: '/settings/security',
    label: 'Security & Policies',
    description: 'Two-factor enforcement policy and security controls.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'settings.view',
    breadcrumbParent: '/settings',
    icon: 'shield-check',
  },
  {
    pattern: '/settings/integrations',
    href: '/settings/integrations',
    label: 'Integrations',
    description: 'Configure Resend, SMS gateway, courier, and webhook credentials.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'integrations.view',
    breadcrumbParent: '/settings',
    icon: 'plug',
  },
  {
    pattern: '/settings/integrations/resend',
    href: '/settings/integrations/resend',
    label: 'Resend Integration',
    description: 'Configure Resend API key and webhook signing secrets.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'integrations.view',
    breadcrumbParent: '/settings/integrations',
    icon: 'mail',
  },
  {
    pattern: '/settings/health',
    href: '/settings/health',
    label: 'Configuration Health',
    description: 'Verify runtime health of critical workspace configuration.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'settings.view',
    breadcrumbParent: '/settings',
    icon: 'activity',
  },
  {
    pattern: '/settings/system',
    href: '/settings/system',
    label: 'System Settings',
    description: 'Operational runtime flags and system controls.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'settings.view',
    breadcrumbParent: '/settings',
    icon: 'settings',
  },
  {
    pattern: '/settings/storefront',
    href: '/settings/storefront',
    label: 'Storefront Settings',
    description: 'Public shopping site toggles and merchandising flags.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'settings.view',
    breadcrumbParent: '/settings',
    icon: 'sparkles',
  },
  {
    pattern: '/settings/checkout',
    href: '/settings/checkout',
    label: 'Checkout Control',
    description: 'Owner-only checkout operational controls and activation boundaries.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    ownerOnly: true,
    breadcrumbParent: '/settings',
    icon: 'shopping-bag',
  },
  {
    pattern: '/settings/colors',
    href: '/settings/colors',
    label: 'Color Library',
    description: 'Manage global swatch library tokens for product variants.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'catalog.view',
    breadcrumbParent: '/settings',
    icon: 'palette',
  },
  {
    pattern: '/settings/sizing',
    href: '/settings/sizing',
    label: 'Sizing Defaults',
    description: 'Workspace sizing policy and unit scale preferences.',
    pillar: 'platform-admin',
    pageVariant: 'standard',
    moduleId: 'settings',
    capability: 'sizing.view',
    breadcrumbParent: '/settings',
    icon: 'ruler',
  },
  {
    pattern: '/settings/design-system',
    href: '/settings/design-system',
    label: 'Design System (Settings)',
    description: 'UI tokens, components, and light/dark verification gallery.',
    pillar: 'platform-admin',
    pageVariant: 'wide',
    moduleId: 'settings',
    breadcrumbParent: '/settings',
    icon: 'sparkles',
  },
  {
    pattern: '/design-system',
    href: '/design-system',
    label: 'Design System Lab',
    description: 'Interactive showcase of Admin design tokens, components, and themes.',
    pillar: 'platform-admin',
    pageVariant: 'wide',
    icon: 'sparkles',
  },

  // Personal Account (User Menu)
  {
    pattern: '/account',
    href: '/account',
    label: 'My Account',
    description: 'Personal operator profile, active sessions, and notification preferences.',
    pillar: 'personal',
    pageVariant: 'standard',
    icon: 'user',
    keywords: 'profile preferences sessions password 2fa',
  },
  {
    pattern: '/account/security',
    href: '/account/security',
    label: 'Account Security',
    description: 'Manage two-factor authentication, password, and active login devices.',
    pillar: 'personal',
    pageVariant: 'standard',
    breadcrumbParent: '/account',
    icon: 'shield-check',
  },
] as const;

export const SIDEBAR_PILLARS: readonly SidebarPillarGroup[] = [
  {
    id: 'command',
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/',
        icon: 'layout-dashboard',
        matchPrefixes: ['/'],
      },
      {
        id: 'attention',
        label: 'Attention',
        href: '/operations',
        icon: 'gauge',
        capability: 'admin.operations.view',
      },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    items: [
      {
        id: 'messaging',
        label: 'Live Inbox',
        href: '/messaging',
        icon: 'inbox',
        capability: 'messaging.inbox.view_assigned',
      },
    ],
  },
  {
    id: 'sales-delivery',
    label: 'Sales & Delivery',
    items: [
      {
        id: 'orders',
        label: 'Orders',
        href: '/orders',
        icon: 'shopping-bag',
        capability: 'orders.view',
      },
      {
        id: 'payments',
        label: 'Payments',
        href: '/payments',
        icon: 'credit-card',
        capability: 'payments.view',
      },
      {
        id: 'fulfillments',
        label: 'Fulfillment',
        href: '/fulfillments',
        icon: 'boxes',
        capability: 'fulfillment.view',
      },
      {
        id: 'deliveries',
        label: 'Deliveries',
        href: '/deliveries',
        icon: 'truck',
        capability: 'delivery.view',
        matchPrefixes: ['/deliveries', '/delivery'],
      },
      {
        id: 'returns',
        label: 'Returns & RTO',
        href: '/returns',
        icon: 'package-open',
        capability: 'returns.view',
        matchPrefixes: ['/returns', '/rto'],
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers & Reviews',
    items: [
      {
        id: 'customers',
        label: 'Customers',
        href: '/customers',
        icon: 'users',
        capability: 'customers.view',
      },
      {
        id: 'reviews',
        label: 'Reviews',
        href: '/reviews',
        icon: 'heart-handshake',
        capability: 'reviews.view',
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog & Merchandising',
    items: [
      {
        id: 'products',
        label: 'Products',
        href: '/products',
        icon: 'package-search',
        capability: 'catalog.view',
      },
      {
        id: 'categories',
        label: 'Organization',
        href: '/categories',
        icon: 'folder-tree',
        capability: 'catalog.manage',
      },
      {
        id: 'sizing',
        label: 'Sizing & Fit',
        href: '/sizing',
        icon: 'ruler',
        capability: 'sizing.view',
      },
      {
        id: 'pricing',
        label: 'Pricing',
        href: '/pricing',
        icon: 'tags',
        capability: 'pricing.view',
      },
      {
        id: 'promotions',
        label: 'Promotions',
        href: '/promotions',
        icon: 'hand-coins',
        capability: 'promotions.view',
      },
      {
        id: 'media',
        label: 'Media Library',
        href: '/media',
        icon: 'image',
        capability: 'media.view',
      },
      {
        id: 'recommendations',
        label: 'Recommendations',
        href: '/recommendations',
        icon: 'bar-chart',
        capability: 'recommendations.view',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      {
        id: 'inventory',
        label: 'Inventory Overview',
        href: '/inventory',
        icon: 'boxes',
        capability: 'inventory.view',
        exactPrefixes: ['/inventory'],
        matchPrefixes: [
          '/inventory/adjustments',
          '/inventory/history',
          '/inventory/reservations',
          '/inventory/settings',
        ],
        excludePrefixes: [
          '/inventory/stock',
          '/inventory/replenishment',
          '/inventory/warehouses',
          '/inventory/transfers',
          '/inventory/stocktakes',
          '/inventory/units',
        ],
      },
      {
        id: 'inventory-stock',
        label: 'Stock Levels',
        href: '/inventory/stock',
        icon: 'boxes',
        capability: 'inventory.view',
        matchPrefixes: ['/inventory/stock'],
      },
      {
        id: 'inventory-replenishment',
        label: 'Replenishment',
        href: '/inventory/replenishment',
        icon: 'activity',
        capability: 'inventory.view',
        matchPrefixes: ['/inventory/replenishment'],
      },
    ],
  },
  {
    id: 'warehouses',
    label: 'Warehouses',
    items: [
      {
        id: 'warehouses',
        label: 'Warehouses',
        href: '/inventory/warehouses',
        icon: 'warehouse',
        capability: 'warehouse.view',
        matchPrefixes: ['/inventory/warehouses'],
      },
      {
        id: 'transfers',
        label: 'Transfers',
        href: '/inventory/transfers',
        icon: 'refresh-cw',
        capability: 'inventory.transfer',
        matchPrefixes: ['/inventory/transfers'],
      },
      {
        id: 'stocktakes',
        label: 'Stocktakes',
        href: '/inventory/stocktakes',
        icon: 'clipboard-check',
        capability: 'inventory.stocktake',
        matchPrefixes: ['/inventory/stocktakes'],
      },
      {
        id: 'unit-qc',
        label: 'Unit QC & Barcodes',
        href: '/inventory/units',
        icon: 'scan-barcode',
        capability: 'inventory.units.view',
        matchPrefixes: ['/inventory/units'],
      },
    ],
  },
  {
    id: 'supply-procurement',
    label: 'Supply & Procurement',
    items: [
      {
        id: 'supply',
        label: 'Supply Overview',
        href: '/supply',
        icon: 'briefcase',
        capability: 'procurement.view',
        exactPrefixes: ['/supply'],
      },
      {
        id: 'suppliers',
        label: 'Suppliers',
        href: '/suppliers',
        icon: 'building',
        capability: 'procurement.view',
        matchPrefixes: ['/suppliers'],
      },
      {
        id: 'purchases',
        label: 'Purchases',
        href: '/purchases',
        icon: 'shopping-bag',
        capability: 'procurement.view',
        matchPrefixes: ['/purchases'],
      },
      {
        id: 'receiving',
        label: 'Receiving & Inbound',
        href: '/receiving',
        icon: 'package-check',
        capability: 'receiving.view',
        matchPrefixes: ['/receiving', '/inbound-shipments', '/landed-cost'],
      },
    ],
  },
  {
    id: 'finance-intel',
    label: 'Finance & Intelligence',
    items: [
      {
        id: 'finance',
        label: 'Finance',
        href: '/finance',
        icon: 'landmark',
        capability: 'finance.view',
        matchPrefixes: ['/finance'],
      },
      {
        id: 'costing',
        label: 'Costing & Margins',
        href: '/costing',
        icon: 'circle-dollar',
        capability: 'costing.view',
      },
      {
        id: 'assets',
        label: 'Fixed Assets',
        href: '/assets',
        icon: 'briefcase',
        capability: 'assets.view',
      },
      {
        id: 'analytics',
        label: 'Analytics',
        href: '/analytics',
        icon: 'bar-chart',
        capability: 'analytics.view',
      },
      {
        id: 'integrity',
        label: 'System Integrity',
        href: '/integrity',
        icon: 'shield-check',
        capability: 'admin.integrity.view',
      },
    ],
  },
  {
    id: 'channels',
    label: 'Channels & Alerts',
    items: [
      {
        id: 'notifications',
        label: 'Notifications',
        href: '/notifications',
        icon: 'bell',
        capability: 'notifications.view',
      },
      {
        id: 'email',
        label: 'Email Ops',
        href: '/email',
        icon: 'mail',
        capability: 'notifications.view',
      },
      {
        id: 'sms',
        label: 'SMS Ops',
        href: '/sms',
        icon: 'message-square',
        capability: 'notifications.sms.view',
      },
    ],
  },
  {
    id: 'platform-admin',
    label: 'Workspace & Access',
    items: [
      {
        id: 'team',
        label: 'Team members',
        href: '/team',
        icon: 'user-round-cog',
        capability: 'admin.team.view',
      },
      {
        id: 'integrations',
        label: 'Integrations',
        href: '/settings/integrations',
        icon: 'plug',
        capability: 'integrations.view',
        matchPrefixes: ['/settings/integrations', '/integrations'],
      },
    ],
  },
] as const;

export const PLATFORM_UTILITY_ITEMS: readonly SidebarNavItem[] = [
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    icon: 'settings',
    capability: 'settings.view',
    matchPrefixes: ['/settings'],
    excludePrefixes: ['/settings/integrations'],
  },
] as const;

export const MODULE_NAV_CONFIGS: Record<ModuleNavId, readonly ModuleNavItem[]> = {
  orders: [
    {
      label: 'All Orders',
      href: '/orders',
      icon: 'shopping-bag',
      capability: 'orders.view',
      exact: true,
    },
    {
      label: 'Create Order',
      href: '/orders/new',
      icon: 'sparkles',
      capability: 'orders.create',
      exact: true,
    },
    {
      label: 'Delivery Pricing',
      href: '/orders/delivery-pricing',
      icon: 'circle-dollar',
      capability: 'orders.view',
      exact: true,
    },
  ],
  delivery: [
    {
      label: 'Deliveries',
      href: '/deliveries',
      icon: 'truck',
      capability: 'delivery.view',
      exact: true,
    },
    {
      label: 'Delivery Overview',
      href: '/delivery',
      icon: 'layout-dashboard',
      capability: 'delivery.view',
      exact: true,
    },
    {
      label: 'Fulfillment',
      href: '/fulfillments',
      icon: 'boxes',
      capability: 'fulfillment.view',
      exact: true,
    },
    {
      label: 'Returns',
      href: '/returns',
      icon: 'package-open',
      capability: 'returns.view',
      exact: true,
    },
    { label: 'RTO Queue', href: '/rto', icon: 'truck', capability: 'returns.view', exact: true },
    {
      label: 'Couriers',
      href: '/delivery/couriers',
      icon: 'bar-chart',
      capability: 'delivery.view',
      exact: true,
      overflow: true,
    },
  ],
  customers: [
    {
      label: 'Directory',
      href: '/customers',
      icon: 'users',
      capability: 'customers.view',
      exact: true,
    },
    {
      label: 'Segments',
      href: '/customers/segments',
      icon: 'users',
      capability: 'customers.view',
      aliases: ['/customers/segments/'],
    },
    {
      label: 'Duplicates',
      href: '/customers/duplicates',
      icon: 'users',
      capability: 'customers.view',
    },
    {
      label: 'Identities',
      href: '/customers/identities',
      icon: 'shield-check',
      capability: 'customers.view',
    },
    {
      label: 'CRM Analytics',
      href: '/customers/analytics',
      icon: 'bar-chart',
      capability: 'customers.view',
      overflow: true,
    },
    {
      label: 'Privacy Requests',
      href: '/customers/privacy',
      icon: 'shield-check',
      capability: 'customers.view',
      overflow: true,
    },
    {
      label: 'CRM Settings',
      href: '/customers/settings',
      icon: 'settings',
      capability: 'customers.view',
      overflow: true,
    },
  ],
  products: [
    {
      label: 'All Products',
      href: '/products',
      icon: 'package-search',
      capability: 'catalog.view',
      exact: true,
    },
    {
      label: 'Price Review',
      href: '/products/price-review',
      icon: 'tags',
      capability: 'pricing.view',
      exact: true,
    },
    {
      label: 'Pricing Books',
      href: '/pricing',
      icon: 'circle-dollar',
      capability: 'pricing.view',
      exact: true,
    },
    {
      label: 'Organization',
      href: '/categories',
      icon: 'folder-tree',
      capability: 'catalog.manage',
      exact: true,
    },
  ],
  sizing: [
    {
      label: 'Overview',
      href: '/sizing',
      icon: 'layout-dashboard',
      capability: 'sizing.view',
      exact: true,
    },
    {
      label: 'Size Guides',
      href: '/sizing/guides',
      icon: 'ruler',
      capability: 'sizing.view',
      aliases: ['/sizing/guides/'],
    },
    { label: 'Assignments', href: '/sizing/assignments', icon: 'boxes', capability: 'sizing.view' },
    { label: 'Attention', href: '/sizing/attention', icon: 'gauge', capability: 'sizing.view' },
    {
      label: 'Standards',
      href: '/sizing/standards',
      icon: 'ruler',
      capability: 'sizing.view',
      overflow: true,
    },
    {
      label: 'Mappings',
      href: '/sizing/mappings',
      icon: 'ruler',
      capability: 'sizing.view',
      overflow: true,
    },
    {
      label: 'Sizes & Dimensions',
      href: '/sizing/sizes',
      icon: 'ruler',
      capability: 'sizing.view',
      aliases: ['/sizing/measurements', '/sizing/domains', '/sizing/categories'],
      overflow: true,
    },
    {
      label: 'Sizing Settings',
      href: '/sizing/settings',
      icon: 'settings',
      capability: 'sizing.view',
      overflow: true,
    },
  ],
  inventory: [
    {
      label: 'Overview',
      href: '/inventory',
      icon: 'layout-dashboard',
      capability: 'inventory.view',
      exact: true,
    },
    {
      label: 'Stock Levels',
      href: '/inventory/stock',
      icon: 'boxes',
      capability: 'inventory.view',
      aliases: ['/inventory/stock/'],
    },
    {
      label: 'Locations',
      href: '/inventory/warehouses',
      icon: 'warehouse',
      capability: 'warehouse.view',
      aliases: ['/inventory/warehouses/'],
    },
    {
      label: 'Transfers',
      href: '/inventory/transfers',
      icon: 'refresh-cw',
      capability: 'inventory.transfer',
      aliases: ['/inventory/transfers/'],
    },
    {
      label: 'Stocktakes',
      href: '/inventory/stocktakes',
      icon: 'clipboard-check',
      capability: 'inventory.stocktake',
      aliases: ['/inventory/stocktakes/'],
    },
    {
      label: 'Unit QC',
      href: '/inventory/units',
      icon: 'scan-barcode',
      capability: 'inventory.units.view',
      aliases: ['/inventory/units/'],
      overflow: true,
    },
    {
      label: 'Adjustments',
      href: '/inventory/adjustments',
      icon: 'boxes',
      capability: 'inventory.adjust',
      overflow: true,
    },
    {
      label: 'History',
      href: '/inventory/history',
      icon: 'activity',
      capability: 'inventory.view',
      overflow: true,
    },
    {
      label: 'Replenishment',
      href: '/inventory/replenishment',
      icon: 'boxes',
      capability: 'inventory.view',
      overflow: true,
    },
    {
      label: 'Reservations',
      href: '/inventory/reservations',
      icon: 'boxes',
      capability: 'inventory.view',
      overflow: true,
    },
    {
      label: 'Inventory Settings',
      href: '/inventory/settings',
      icon: 'settings',
      capability: 'inventory.view',
      overflow: true,
    },
  ],
  supply: [
    {
      label: 'Overview',
      href: '/supply',
      icon: 'layout-dashboard',
      capability: 'procurement.view',
      exact: true,
    },
    {
      label: 'Suppliers',
      href: '/suppliers',
      icon: 'building',
      capability: 'procurement.view',
      aliases: ['/suppliers/'],
    },
    {
      label: 'Purchases',
      href: '/purchases',
      icon: 'shopping-bag',
      capability: 'procurement.view',
      aliases: ['/purchases/'],
    },
    {
      label: 'Shipments',
      href: '/inbound-shipments',
      icon: 'truck',
      capability: 'inbound_shipment.view',
      aliases: ['/inbound-shipments/'],
    },
    {
      label: 'Receiving',
      href: '/receiving',
      icon: 'package-check',
      capability: 'receiving.view',
      aliases: ['/receiving/'],
    },
    {
      label: 'Landed Cost',
      href: '/landed-cost',
      icon: 'landmark',
      capability: 'landed_cost.view',
      overflow: true,
    },
  ],
  finance: [
    {
      label: 'Overview',
      href: '/finance',
      icon: 'layout-dashboard',
      capability: 'finance.view',
      exact: true,
    },
    {
      label: 'Accounts',
      href: '/finance/accounts',
      icon: 'landmark',
      capability: 'finance.accounts.view',
      aliases: ['/finance/accounts/'],
    },
    {
      label: 'COD Settlements',
      href: '/finance/cod-settlements',
      icon: 'circle-dollar',
      capability: 'finance.cod_settlements.view',
    },
    {
      label: 'Expenses',
      href: '/finance/expenses',
      icon: 'receipt',
      capability: 'finance.expenses.view',
      aliases: ['/finance/expenses/'],
    },
    {
      label: 'Reconciliation',
      href: '/finance/reconciliation',
      icon: 'clipboard-check',
      capability: 'reconciliation.view',
    },
    {
      label: 'Movements',
      href: '/finance/movements',
      icon: 'briefcase',
      capability: 'finance.view',
      overflow: true,
    },
    {
      label: 'Transfers',
      href: '/finance/transfers',
      icon: 'refresh-cw',
      capability: 'finance.view',
      overflow: true,
    },
    {
      label: 'Capital',
      href: '/finance/capital',
      icon: 'landmark',
      capability: 'finance.capital.view',
      overflow: true,
    },
  ],
  settings: [
    {
      label: 'Overview',
      href: '/settings',
      icon: 'layout-dashboard',
      capability: 'settings.view',
      exact: true,
    },
    {
      label: 'General',
      href: '/settings/general',
      icon: 'settings',
      capability: 'settings.view',
      exact: true,
    },
    {
      label: 'Organization',
      href: '/settings/organization',
      icon: 'building',
      capability: 'settings.organization.manage',
      exact: true,
    },
    {
      label: 'Security',
      href: '/settings/security',
      icon: 'shield-check',
      capability: 'settings.view',
      exact: true,
    },
    {
      label: 'Integrations',
      href: '/settings/integrations',
      icon: 'plug',
      capability: 'integrations.view',
      aliases: ['/settings/integrations/', '/integrations'],
    },
    {
      label: 'Configuration Health',
      href: '/settings/health',
      icon: 'activity',
      capability: 'settings.view',
      overflow: true,
    },
    {
      label: 'Storefront',
      href: '/settings/storefront',
      icon: 'sparkles',
      capability: 'settings.view',
      overflow: true,
    },
    {
      label: 'Checkout Control',
      href: '/settings/checkout',
      icon: 'shopping-bag',
      ownerOnly: true,
      overflow: true,
    },
    {
      label: 'Color Library',
      href: '/settings/colors',
      icon: 'palette',
      capability: 'catalog.view',
      overflow: true,
    },
    {
      label: 'Sizing Defaults',
      href: '/settings/sizing',
      icon: 'ruler',
      capability: 'sizing.view',
      overflow: true,
    },
    {
      label: 'System',
      href: '/settings/system',
      icon: 'settings',
      capability: 'settings.view',
      overflow: true,
    },
    { label: 'Design System', href: '/settings/design-system', icon: 'sparkles', overflow: true },
  ],
};

export const QUICK_COMMAND_ITEMS: readonly SidebarNavItem[] = [
  {
    id: 'cmd-scan-unit',
    label: 'Scan physical unit barcode',
    href: '/inventory/units/scan',
    icon: 'scan-barcode',
    capability: 'inventory.units.view',
    keywords: 'barcode scan unit physical mvu camera',
  },
  {
    id: 'cmd-new-order',
    label: 'Create manual order',
    href: '/orders/new',
    icon: 'shopping-bag',
    capability: 'orders.create',
    keywords: 'new manual phone chat order',
  },
  {
    id: 'cmd-new-product',
    label: 'Create a product',
    href: '/products/new',
    icon: 'sparkles',
    capability: 'catalog.manage',
    keywords: 'new draft catalog item',
  },
  {
    id: 'cmd-verify-payments',
    label: 'Verify payments queue',
    href: '/payments',
    icon: 'credit-card',
    capability: 'payments.verify',
    keywords: 'bkash nagad queue trxid',
  },
  {
    id: 'cmd-account',
    label: 'My account & security',
    href: '/account',
    icon: 'user',
    keywords: 'profile password 2fa sessions devices personal',
  },
  {
    id: 'cmd-design-system',
    label: 'Design system lab',
    href: '/design-system',
    icon: 'sparkles',
    keywords: 'tokens colors buttons theme preview',
  },
] as const;

export function hasRoutePermission(
  context: AdminContextDto | undefined,
  requirement?: { readonly capability?: string; readonly ownerOnly?: boolean },
): boolean {
  if (!requirement) return true;
  if (!requirement.ownerOnly && !requirement.capability) return true;
  if (!context) return false;
  if (context.membershipType === 'OWNER') return true;
  if (requirement.ownerOnly) return false;
  if (!requirement.capability) return true;
  return context.capabilities.includes(requirement.capability);
}

/**
 * Strips any leading `/admin` basePath prefix while keeping query string and hash intact,
 * so Next.js `<Link>` and `router.push()` never produce `/admin/admin/...`.
 */
export function toAppRoutePath(rawPath: string | null | undefined): string {
  if (!rawPath) return '/';
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/')) return '/';
  const match = /^([^?#]*)(.*)$/.exec(trimmed);
  const pathPart = match?.[1] ?? '/';
  const suffix = match?.[2] ?? '';
  const internal = internalAdminPath(pathPart);
  return `${internal}${suffix}`;
}

/**
 * Ensures full browser path for direct DOM redirects (`window.location.assign(...)`) under `basePath: '/admin'`.
 */
export function toBrowserUrl(appPath: string): string {
  const clean = toAppRoutePath(appPath);
  if (clean === '/') return '/admin';
  if (clean.startsWith('/?')) return `/admin${clean.slice(1)}`;
  return `/admin${clean}`;
}

function matchRoutePattern(pattern: string, internalPath: string): boolean {
  if (pattern === internalPath) return true;
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = internalPath.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((seg, index) => seg.startsWith('[') || seg === pathParts[index]);
}

export function getRouteEntry(pathname: string): RouteEntry | undefined {
  const internalPath = internalAdminPath(pathname);
  // Prefer exact static matches before parameterized pattern matches.
  const exact = ROUTE_REGISTRY.find((entry) => entry.pattern === internalPath);
  if (exact) return exact;
  return ROUTE_REGISTRY.find((entry) => matchRoutePattern(entry.pattern, internalPath));
}

export function getEffectiveRouteCapability(pathname: string): string | undefined {
  return getRouteEntry(pathname)?.capability ?? pageCapability(pathname);
}

export function getSidebarPillars(
  context: AdminContextDto | undefined,
): readonly SidebarPillarGroup[] {
  return SIDEBAR_PILLARS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasRoutePermission(context, item)),
  })).filter((group) => group.items.length > 0);
}

export function getPlatformUtilityItems(
  context: AdminContextDto | undefined,
): readonly SidebarNavItem[] {
  return PLATFORM_UTILITY_ITEMS.filter((item) => hasRoutePermission(context, item));
}

export function getModuleNavItems(
  moduleId: ModuleNavId,
  context?: AdminContextDto | undefined,
): readonly ModuleNavItem[] {
  const items = MODULE_NAV_CONFIGS[moduleId] ?? [];
  if (!context) return items;
  return items.filter((item) => hasRoutePermission(context, item));
}

export function getCommandPaletteEntries(
  context: AdminContextDto | undefined,
): readonly SidebarNavItem[] {
  const routeEntries: SidebarNavItem[] = ROUTE_REGISTRY.filter(
    (entry): entry is RouteEntry & { href: string } =>
      Boolean(entry.href) && entry.pillar !== 'public-auth' && hasRoutePermission(context, entry),
  ).map((entry) => ({
    id: `route:${entry.href}`,
    label: entry.label,
    href: entry.href,
    icon: entry.icon,
    ...(entry.capability ? { capability: entry.capability } : {}),
    ...(entry.ownerOnly ? { ownerOnly: entry.ownerOnly } : {}),
    keywords: `${entry.description} ${entry.keywords ?? ''}`.trim(),
  }));

  const quick = QUICK_COMMAND_ITEMS.filter((item) => hasRoutePermission(context, item));
  const seen = new Set<string>();
  const combined: SidebarNavItem[] = [];
  for (const item of [...quick, ...routeEntries]) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    combined.push(item);
  }
  return combined;
}

function matchesSidebarPrefix(current: string, prefix: string): boolean {
  if (prefix === '/') return current === '/';
  return current === prefix || current.startsWith(`${prefix}/`);
}

export function isSidebarItemActive(pathname: string, item: SidebarNavItem): boolean {
  const current = internalAdminPath(pathname);
  if (item.excludePrefixes?.some((prefix) => matchesSidebarPrefix(current, prefix))) {
    return false;
  }
  if (item.exactPrefixes?.some((prefix) => current === prefix)) {
    return true;
  }
  if (item.href === '/' && !item.matchPrefixes && !item.exactPrefixes) {
    return current === '/';
  }
  const prefixes = item.matchPrefixes ?? (item.exactPrefixes ? [] : [item.href]);
  return prefixes.some((prefix) => matchesSidebarPrefix(current, prefix));
}

export function resolveBreadcrumbTrail(pathname: string): { label: string; href?: string }[] {
  const current = internalAdminPath(pathname);
  const trail: { label: string; href?: string }[] = [];
  const visited = new Set<string>();

  let cursor: string | undefined = current;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const entry = getRouteEntry(cursor);
    if (!entry) break;
    trail.unshift({
      label: entry.label,
      ...(cursor === current || !entry.href ? {} : { href: entry.href }),
    });
    cursor = entry.breadcrumbParent;
  }

  return trail;
}
