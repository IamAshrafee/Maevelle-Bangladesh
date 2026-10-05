'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  Boxes,
  Building2,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Command,
  CreditCard,
  FolderTree,
  Gauge,
  HandCoins,
  HeartHandshake,
  Image,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquareText,
  Menu,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Palette,
  PanelLeftClose,
  Plug,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Truck,
  UserRoundCog,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type { AdminContextDto, ApiEnvelope } from '@maevelle/contracts';

import { AdminCapabilitiesProvider } from './admin-capabilities';
import { TwoFactorRequiredGate } from './security/two-factor-required-gate';
import { cn } from '@/lib/utils';

type AdminContext = AdminContextDto;

type SearchResult = { kind: string; label: string; detail: string; href: string };

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  capability?: string;
  keywords?: string;
};

type NavGroup = { label: string; items: readonly NavItem[] };

const navigation: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Account security', href: '/account/security', icon: ShieldCheck },
      { label: 'Attention', href: '/operations', icon: Gauge, capability: 'admin.operations.view' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Orders', href: '/orders', icon: ShoppingBag, capability: 'orders.view' },
      { label: 'Customers', href: '/customers', icon: Users, capability: 'customers.view' },
      { label: 'Reviews', href: '/reviews', icon: HeartHandshake, capability: 'reviews.view' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products', href: '/products', icon: PackageSearch, capability: 'catalog.view' },
      {
        label: 'Product organization',
        href: '/categories',
        icon: FolderTree,
        capability: 'catalog.manage',
        keywords: 'categories tags occasions events collections taxonomy',
      },
      { label: 'Media', href: '/media', icon: Image, capability: 'media.view' },
      {
        label: 'Color library',
        href: '/settings/colors',
        icon: Palette,
        capability: 'catalog.view',
        keywords: 'colors swatches hex library shades',
      },
      { label: 'Sizing', href: '/sizing', icon: Ruler, capability: 'sizing.view' },
      { label: 'Pricing', href: '/pricing', icon: Tags, capability: 'pricing.view' },
      { label: 'Promotions', href: '/promotions', icon: HandCoins, capability: 'promotions.view' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        label: 'Overview',
        href: '/inventory',
        icon: LayoutDashboard,
        capability: 'inventory.view',
      },
      { label: 'Stock', href: '/inventory/stock', icon: Boxes, capability: 'inventory.view' },
      {
        label: 'Warehouses',
        href: '/inventory/warehouses',
        icon: Warehouse,
        capability: 'warehouse.view',
      },
      {
        label: 'Transfers',
        href: '/inventory/transfers',
        icon: RefreshCw,
        capability: 'inventory.transfer',
      },
      {
        label: 'Stocktakes',
        href: '/inventory/stocktakes',
        icon: ClipboardCheck,
        capability: 'inventory.stocktake',
      },
      {
        label: 'Movement history',
        href: '/inventory/history',
        icon: Activity,
        capability: 'inventory.view',
      },
      {
        label: 'Adjustments',
        href: '/inventory/adjustments',
        icon: ReceiptText,
        capability: 'inventory.adjust',
      },
      {
        label: 'Loss & shrink',
        href: '/inventory/loss',
        icon: RotateCcw,
        capability: 'inventory.manage_loss',
      },
    ],
  },
  {
    label: 'Purchasing & Supply',
    items: [
      {
        label: 'Supply overview',
        href: '/supply',
        icon: LayoutDashboard,
        capability: 'procurement.view',
      },
      {
        label: 'Purchases',
        href: '/purchases',
        icon: ShoppingBag,
        capability: 'procurement.view',
      },
      {
        label: 'Shipments',
        href: '/shipments',
        icon: Truck,
        capability: 'shipment.view',
      },
      {
        label: 'Suppliers',
        href: '/suppliers',
        icon: Building2,
        capability: 'procurement.view',
      },
      {
        label: 'Landed cost',
        href: '/landed-cost',
        icon: Landmark,
        capability: 'landed_cost.view',
      },
      {
        label: 'Goods receiving',
        href: '/receiving',
        icon: PackageCheck,
        capability: 'receiving.view',
      },
    ],
  },
  {
    label: 'Fulfillment & Logistics',
    items: [
      {
        label: 'Fulfillment queue',
        href: '/fulfillments',
        icon: Boxes,
        capability: 'fulfillment.view',
      },
      {
        label: 'Deliveries',
        href: '/deliveries',
        icon: Truck,
        capability: 'delivery.view',
      },
      {
        label: 'Delivery exceptions',
        href: '/delivery/exceptions',
        icon: Activity,
        capability: 'delivery.view',
      },
      {
        label: 'Returns',
        href: '/returns',
        icon: PackageOpen,
        capability: 'returns.view',
      },
      {
        label: 'Courier performance',
        href: '/couriers',
        icon: ChartNoAxesCombined,
        capability: 'delivery.view',
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Overview', href: '/finance', icon: LayoutDashboard, capability: 'finance.view' },
      { label: 'Accounts', href: '/finance/accounts', icon: Landmark, capability: 'finance.view' },
      { label: 'Expenses', href: '/finance/expenses', icon: ReceiptText, capability: 'finance.view' },
      {
        label: 'Ledger journal',
        href: '/finance/journal',
        icon: BriefcaseBusiness,
        capability: 'finance.view',
      },
      {
        label: 'Reconciliation',
        href: '/finance/reconciliations',
        icon: ClipboardCheck,
        capability: 'reconciliation.view',
      },
      { label: 'Payments', href: '/payments', icon: CreditCard, capability: 'payments.view' },
      { label: 'Payouts', href: '/finance/payouts', icon: CircleDollarSign, capability: 'finance.view' },
      { label: 'Capital', href: '/finance/capital', icon: Landmark, capability: 'finance.view' },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        label: 'SMS campaigns',
        href: '/sms/campaigns',
        icon: MessageSquareText,
        capability: 'notifications.sms.view',
      },
      {
        label: 'SMS templates',
        href: '/sms/templates',
        icon: MessageSquareText,
        capability: 'notifications.sms.view',
      },
      {
        label: 'SMS delivery',
        href: '/sms/deliveries',
        icon: Activity,
        capability: 'notifications.sms.view',
      },
      {
        label: 'SMS analytics',
        href: '/sms/analytics',
        icon: ChartNoAxesCombined,
        capability: 'notifications.sms.view',
      },
      {
        label: 'Email templates',
        href: '/email/templates',
        icon: Mail,
        capability: 'notifications.view',
      },
      {
        label: 'Email logs',
        href: '/email/logs',
        icon: Activity,
        capability: 'notifications.view',
      },
    ],
  },
  {
    label: 'Operations & Intelligence',
    items: [
      {
        label: 'Analytics',
        href: '/analytics',
        icon: ChartNoAxesCombined,
        capability: 'analytics.view',
      },
      {
        label: 'Costing & margins',
        href: '/costing',
        icon: Landmark,
        capability: 'finance.view',
      },
      {
        label: 'Fixed assets',
        href: '/assets',
        icon: BriefcaseBusiness,
        capability: 'assets.view',
      },
      {
        label: 'System integrity',
        href: '/integrity',
        icon: ShieldCheck,
        capability: 'admin.integrity.view',
      },
      {
        label: 'Integrations & Hub',
        href: '/settings/integrations',
        icon: Plug,
        capability: 'integrations.view',
      },
    ],
  },
  {
    label: 'Settings & Administration',
    items: [
      {
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        keywords: 'general organization security integrations health system configuration design system',
      },
      {
        label: 'Organization',
        href: '/settings/organization',
        icon: Building2,
        capability: 'settings.organization.manage',
      },
      {
        label: 'Team members',
        href: '/team',
        icon: UserRoundCog,
        capability: 'admin.team.view',
      },
      {
        label: 'Security & roles',
        href: '/settings/security',
        icon: ShieldCheck,
        capability: 'settings.view',
      },
      {
        label: 'Notification rules',
        href: '/notifications',
        icon: Bell,
        capability: 'notifications.view',
      },
      {
        label: 'Audit log',
        href: '/settings/audit',
        icon: Activity,
        capability: 'settings.view',
      },
    ],
  },
];

const quickCommands: readonly NavItem[] = [
  {
    label: 'Add an expense',
    href: '/finance/expenses?create=expense',
    icon: ReceiptText,
    capability: 'finance.manage',
    keywords: 'spending payment out money expense',
  },
  {
    label: 'Record fixed asset',
    href: '/assets?create=asset',
    icon: BriefcaseBusiness,
    capability: 'assets.manage',
    keywords: 'equipment property existing asset',
  },
  {
    label: 'Create a product',
    href: '/products/new',
    icon: PackageSearch,
    capability: 'catalog.manage',
    keywords: 'new draft catalog',
  },
  {
    label: 'Manage color library',
    href: '/settings/colors',
    icon: Palette,
    capability: 'catalog.manage',
    keywords: 'colors swatches hex library shades',
  },
  {
    label: 'Create a purchase',
    href: '/purchases?create=purchase',
    icon: ReceiptText,
    capability: 'procurement.manage',
    keywords: 'new supplier order',
  },
  {
    label: 'Receive a shipment',
    href: '/supply#receiving',
    icon: PackageCheck,
    capability: 'receiving.post',
    keywords: 'warehouse inbound',
  },
  {
    label: 'Verify payments',
    href: '/payments',
    icon: CreditCard,
    capability: 'payments.verify',
    keywords: 'bkash nagad queue',
  },
  {
    label: 'Open fulfillment queue',
    href: '/fulfillments',
    icon: Boxes,
    capability: 'fulfillment.view',
    keywords: 'pick pack dispatch',
  },
];

function hasCapability(context: AdminContext | undefined, capability?: string) {
  if (!capability) return true;
  if (!context) return true;
  if (context.membershipType === 'OWNER') return true;
  return context.capabilities.includes(capability);
}

const allNavHrefs = navigation.flatMap((group) => group.items.map((item) => item.href));

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  return !allNavHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

function CommandPalette({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context: AdminContext | undefined;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<readonly SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const local = useMemo(
    () =>
      [...navigation.flatMap((group) => group.items), ...quickCommands]
        .filter((item) => hasCapability(context, item.capability))
        .filter((item) =>
          `${item.label} ${item.keywords ?? ''}`.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 10),
    [context, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRemote([]);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2 || !hasCapability(context, 'admin.operations.view')) {
      setRemote([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (response.ok)
          setRemote(((await response.json()) as ApiEnvelope<readonly SearchResult[]>).data);
      } finally {
        setBusy(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [context, open, query]);

  if (!open) return null;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-20 bg-slate-950/45 backdrop-blur-xs animate-in fade-in duration-150"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-label="Command palette"
        aria-modal="true"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-card-foreground animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-muted/20 text-muted-foreground">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <input
            ref={input}
            aria-label="Search navigation and business records"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Go to a workspace or find an order, customer, product…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border rounded">
            Esc
          </kbd>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border/40">
          <div className="space-y-0.5">
            <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspaces & actions
            </p>
            {local.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={`${item.href}-${index}`}
                  type="button"
                  onClick={() => go(item.href)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left text-foreground hover:bg-muted/60 transition-colors group cursor-pointer"
                >
                  <Icon className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <ChevronRight className="size-3.5 text-muted-foreground/60 group-hover:text-foreground shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {remote.length > 0 ? (
            <div className="space-y-0.5 pt-2">
              <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Business records
              </p>
              {remote.map((result) => (
                <button
                  key={`${result.kind}-${result.href}`}
                  type="button"
                  onClick={() => go(result.href)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left text-foreground hover:bg-muted/60 transition-colors group cursor-pointer"
                >
                  <Search className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <strong className="block text-sm font-medium text-foreground truncate">{result.label}</strong>
                    <small className="block text-xs text-muted-foreground truncate">
                      {result.kind} · {result.detail}
                    </small>
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground/60 group-hover:text-foreground shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}

          {busy ? (
            <p className="px-3 py-4 text-xs text-center text-muted-foreground">Searching authoritative records…</p>
          ) : null}
          {!busy && query && local.length === 0 && remote.length === 0 ? (
            <p className="px-3 py-6 text-sm text-center text-muted-foreground">
              No accessible workspace or record matches “{query}”.
            </p>
          ) : null}
        </div>
        <footer className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Command className="size-3" aria-hidden="true" /> K to open
          </span>
          <span>Results respect your active organization & permissions</span>
        </footer>
      </section>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [context, setContext] = useState<AdminContext>();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/two-factor') return;
    void fetch('/api/admin/context', { credentials: 'include' }).then(async (response) => {
      if (response.status === 401) {
        if (pathname === '/design-system' || pathname.startsWith('/settings/design-system')) {
          return;
        }
        return router.replace('/login');
      }
      if (response.ok) {
        const nextContext = (await response.json()) as AdminContext;
        setContext(nextContext);
        if (nextContext.twoFactor.accessRestricted && pathname !== '/account/security')
          router.replace('/account/security');
      }
    });
  }, [pathname, router]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (pathname === '/login' || pathname === '/two-factor') return children;

  if (context?.twoFactor.accessRestricted) {
    return (
      <TwoFactorRequiredGate
        context={context}
        onEnrolled={() => {
          void fetch('/api/admin/context', { credentials: 'include' }).then(async (response) => {
            if (response.ok) {
              setContext((await response.json()) as AdminContext);
            }
          });
        }}
      />
    );
  }

  const logout = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row relative">
      {/* Mobile Backdrop */}
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Sidebar Navigation */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border transition-[width,transform] duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 shrink-0 select-none',
          mobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full md:translate-x-0',
          collapsed ? 'md:w-18' : 'md:w-64',
        )}
      >
        {/* Brand Lockup */}
        <div className={cn(
          'h-14 flex items-center gap-3 px-4 border-b border-sidebar-border bg-sidebar shrink-0',
          collapsed && 'md:justify-center md:px-2',
        )}>
          <div
            className="size-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm shadow-xs shrink-0 tracking-tight"
            aria-hidden="true"
          >
            M
          </div>
          <div className={cn('min-w-0 flex flex-col leading-tight', collapsed && 'md:hidden')}>
            <strong className="text-sm font-bold tracking-tight text-sidebar-foreground">Maevelle</strong>
            <span className="text-[11px] text-muted-foreground font-normal">Business operations</span>
          </div>
          <button
            className="ml-auto md:hidden p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-sidebar-accent"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Navigation Groups */}
        <nav
          className="flex-1 overflow-y-auto px-3 py-3 space-y-4 overscroll-contain scrollbar-none"
          aria-label="Admin navigation"
        >
          {navigation.map((group) => {
            const visible = group.items.filter((item) => hasCapability(context, item.capability));
            if (visible.length === 0) return null;
            return (
              <section key={group.label} className="space-y-0.5">
                <p className={cn(
                  'px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80',
                  collapsed && 'md:hidden',
                )}>
                  {group.label}
                </p>
                {visible.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      aria-current={active ? 'page' : undefined}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                        active
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        collapsed && 'md:justify-center md:px-0 md:size-9 md:mx-auto',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-4 shrink-0 transition-colors',
                          active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
                    </Link>
                  );
                })}
              </section>
            );
          })}
        </nav>

        {/* Sidebar Footer: Quick Settings & Collapse (Desktop Only) */}
        <div className="hidden md:flex flex-col gap-1 border-t border-sidebar-border p-2 shrink-0">
          <Link
            href="/settings"
            aria-current={isNavActive(pathname, '/settings') ? 'page' : undefined}
            title={collapsed ? 'Settings' : undefined}
            className={cn(
              'flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              isNavActive(pathname, '/settings')
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed && 'justify-center px-0 size-9 mx-auto',
            )}
          >
            <Settings
              className={cn(
                'size-4 shrink-0 transition-colors',
                isNavActive(pathname, '/settings') ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
              aria-hidden="true"
            />
            <span className={cn('truncate', collapsed && 'hidden')}>Settings</span>
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors cursor-pointer',
              collapsed && 'justify-center px-0 size-9 mx-auto',
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
            <span className={cn(collapsed && 'hidden')}>{collapsed ? 'Expand' : 'Collapse sidebar'}</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Sticky Chrome Topbar */}
        <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-border/80 bg-background/85 backdrop-blur-md transition-colors">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </button>

            {/* Global Search Trigger */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 h-9 w-48 sm:w-72 lg:w-96 rounded-full border border-border/80 bg-card/60 hover:bg-card px-3.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 shadow-2xs transition-colors cursor-pointer"
            >
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-left truncate">Search orders, customers, stock…</span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border/70 rounded">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Topbar Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/notifications"
              className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Open notifications"
            >
              <Bell className="size-4" />
            </Link>

            <div className="hidden sm:flex flex-col items-end leading-none border-l border-border pl-3">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Workspace</span>
              <strong className="text-xs font-semibold text-foreground">Maevelle BD</strong>
            </div>

            {/* User Profile / Sign-out */}
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out of Operator session"
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
            >
              <div className="size-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs border border-primary/20 shrink-0">
                O
              </div>
              <div className="hidden md:flex flex-col items-start leading-tight">
                <strong className="text-xs font-semibold text-foreground">Operator</strong>
                <small className="text-[10px] text-muted-foreground group-hover:text-destructive transition-colors">Sign out</small>
              </div>
              <LogOut className="size-3.5 ml-1 hidden md:block text-muted-foreground group-hover:text-destructive transition-colors shrink-0" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* 2FA Grace Period Notice */}
        {context?.twoFactor.enrollmentRequired &&
        !context.twoFactor.accessRestricted &&
        pathname !== '/account/security' ? (
          <div className="bg-warning/10 border-b border-warning/30 px-4 py-2.5 text-xs text-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-warning shrink-0" />
              <span>
                <strong>Authenticator setup required:</strong> Your account must configure two-factor authentication before{' '}
                {context.twoFactor.enrollmentDeadline
                  ? new Date(context.twoFactor.enrollmentDeadline).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })
                  : 'the upcoming deadline'}{' '}
                to retain administrative access.
              </span>
            </div>
            <Link
              href="/account/security"
              className="font-semibold text-warning hover:underline underline-offset-2 shrink-0 inline-flex items-center gap-1"
            >
              Set up now →
            </Link>
          </div>
        ) : null}

        {/* Inner Content Area */}
        <div className="flex-1 min-w-0">
          <AdminCapabilitiesProvider
            capabilities={context?.capabilities ?? []}
            context={context}
          >
            {children}
          </AdminCapabilitiesProvider>
        </div>
      </div>

      {/* Floating Bottom Island for Mobile Touch Usability */}
      <nav
        className="fixed bottom-3 inset-x-4 z-40 md:hidden flex items-center justify-around h-14 rounded-2xl bg-card/90 backdrop-blur-lg border border-border shadow-lg px-2 text-xs font-medium text-muted-foreground"
        aria-label="Quick mobile navigation"
      >
        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label={mobileOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-lg transition-colors',
            mobileOpen ? 'text-primary' : 'hover:text-foreground',
          )}
        >
          <Menu className="size-4" aria-hidden="true" />
          <span className="text-[10px]">Menu</span>
        </button>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search records"
          className="flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-lg hover:text-foreground transition-colors"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="text-[10px]">Search</span>
        </button>
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          aria-label="Dashboard"
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-lg transition-colors',
            pathname === '/' ? 'text-primary font-semibold' : 'hover:text-foreground',
          )}
        >
          <LayoutDashboard className="size-4" aria-hidden="true" />
          <span className="text-[10px]">Home</span>
        </Link>
        <Link
          href="/orders"
          onClick={() => setMobileOpen(false)}
          aria-label="Orders"
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-lg transition-colors',
            pathname.startsWith('/orders') ? 'text-primary font-semibold' : 'hover:text-foreground',
          )}
        >
          <ShoppingBag className="size-4" aria-hidden="true" />
          <span className="text-[10px]">Orders</span>
        </Link>
        <Link
          href="/operations"
          onClick={() => setMobileOpen(false)}
          aria-label="Operations and Alerts"
          className={cn(
            'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-lg transition-colors',
            pathname.startsWith('/operations') ? 'text-primary font-semibold' : 'hover:text-foreground',
          )}
        >
          <Gauge className="size-4" aria-hidden="true" />
          <span className="text-[10px]">Alerts</span>
        </Link>
      </nav>

      {/* Command Palette Modal */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} context={context} />
    </div>
  );
}
