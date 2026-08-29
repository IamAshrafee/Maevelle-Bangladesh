'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  Boxes,
  Building2,
  Calculator,
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
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  PanelLeftClose,
  Plug,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Settings,
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

import type { ApiEnvelope } from '@maevelle/contracts';

type AdminContext = {
  actorId: string;
  organizationId: string;
  capabilities: readonly string[];
};

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
      { label: 'Sizing', href: '/sizing', icon: Ruler, capability: 'sizing.view' },
      { label: 'Pricing', href: '/pricing', icon: Tags, capability: 'pricing.view' },
      { label: 'Promotions', href: '/promotions', icon: HandCoins, capability: 'promotions.view' },
    ],
  },
  {
    label: 'Inventory',
    items: [
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
    ],
  },
  {
    label: 'Supply',
    items: [
      { label: 'Suppliers', href: '/suppliers', icon: Building2, capability: 'procurement.view' },
      { label: 'Purchases', href: '/purchases', icon: ReceiptText, capability: 'procurement.view' },
      {
        label: 'Inbound shipments',
        href: '/inbound-shipments',
        icon: PackageOpen,
        capability: 'inbound_shipment.view',
      },
      { label: 'Receiving', href: '/receiving', icon: PackageCheck, capability: 'receiving.view' },
      {
        label: 'Landed cost',
        href: '/landed-cost',
        icon: Calculator,
        capability: 'landed_cost.view',
      },
      { label: 'Costing', href: '/costing', icon: CircleDollarSign, capability: 'costing.view' },
    ],
  },
  {
    label: 'Delivery',
    items: [
      { label: 'Fulfillments', href: '/fulfillments', icon: Boxes, capability: 'fulfillment.view' },
      { label: 'Deliveries', href: '/deliveries', icon: Truck, capability: 'delivery.view' },
      { label: 'Customer returns', href: '/returns', icon: RotateCcw, capability: 'returns.view' },
      { label: 'RTO', href: '/rto', icon: PackageOpen, capability: 'returns.view' },
    ],
  },
  {
    label: 'Payments & finance',
    items: [
      { label: 'Payments', href: '/payments', icon: CreditCard, capability: 'payments.view' },
      {
        label: 'Finance overview',
        href: '/finance',
        icon: CircleDollarSign,
        capability: 'finance.cash.view',
      },
      {
        label: 'Expenses',
        href: '/finance/expenses',
        icon: ReceiptText,
        capability: 'finance.expenses.view',
      },
      {
        label: 'Accounts',
        href: '/finance/accounts',
        icon: Building2,
        capability: 'finance.accounts.view',
      },
      {
        label: 'Reconciliation',
        href: '/finance/reconciliation',
        icon: ClipboardCheck,
        capability: 'finance.reconciliation.view',
      },
    ],
  },
  {
    label: 'Insights & automation',
    items: [
      {
        label: 'Analytics',
        href: '/analytics',
        icon: ChartNoAxesCombined,
        capability: 'analytics.view',
      },
      {
        label: 'Notifications',
        href: '/notifications',
        icon: Bell,
        capability: 'notifications.view',
      },
      {
        label: 'Integrations',
        href: '/integrations',
        icon: Plug,
        capability: 'integrations.view',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Integrity',
        href: '/integrity',
        icon: ShieldCheck,
        capability: 'admin.integrity.view',
      },
      {
        label: 'Operations',
        href: '/operations',
        icon: Activity,
        capability: 'admin.operations.view',
      },
      { label: 'Team & access', href: '/team', icon: UserRoundCog, capability: 'admin.team.view' },
      { label: 'Settings', href: '/settings', icon: Settings, capability: 'settings.view' },
    ],
  },
];

const quickCommands: readonly NavItem[] = [
  {
    label: 'Create a product',
    href: '/products?create=product',
    icon: PackageSearch,
    capability: 'catalog.manage',
    keywords: 'new draft catalog',
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
    href: '/receiving',
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
  return context?.capabilities.includes(capability) ?? false;
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
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
    <div className="command-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Command palette"
        aria-modal="true"
        className="command-palette"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-row">
          <Search aria-hidden="true" />
          <input
            ref={input}
            aria-label="Search navigation and business records"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Go to a workspace or find an order, customer, product…"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results">
          <p className="command-group-label">Workspaces & actions</p>
          {local.map((item, index) => {
            const Icon = item.icon;
            return (
              <button key={`${item.href}-${index}`} type="button" onClick={() => go(item.href)}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                <ChevronRight aria-hidden="true" className="command-chevron" />
              </button>
            );
          })}
          {remote.length > 0 ? <p className="command-group-label">Business records</p> : null}
          {remote.map((result) => (
            <button
              key={`${result.kind}-${result.href}`}
              type="button"
              onClick={() => go(result.href)}
            >
              <Search aria-hidden="true" />
              <span>
                <strong>{result.label}</strong>
                <small>
                  {result.kind} · {result.detail}
                </small>
              </span>
              <ChevronRight aria-hidden="true" className="command-chevron" />
            </button>
          ))}
          {busy ? <p className="command-hint">Searching authoritative records…</p> : null}
          {!busy && query && local.length === 0 && remote.length === 0 ? (
            <p className="command-empty">No accessible workspace or record matches “{query}”.</p>
          ) : null}
        </div>
        <footer>
          <span>
            <Command aria-hidden="true" /> K to open
          </span>
          <span>Results respect your active organization and permissions.</span>
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
    if (pathname === '/login') return;
    void fetch('/api/admin/context', { credentials: 'include' }).then(async (response) => {
      if (response.status === 401) return router.replace('/login');
      if (response.ok) setContext((await response.json()) as AdminContext);
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

  if (pathname === '/login') return children;

  const logout = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className={`admin-app ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen ? (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside className={`admin-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <div className="brand-copy">
            <strong>Maevelle</strong>
            <span>Business operations</span>
          </div>
          <button
            className="mobile-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </button>
        </div>
        <nav className="sidebar-navigation" aria-label="Admin navigation">
          {navigation.map((group) => {
            const visible = group.items.filter((item) => hasCapability(context, item.capability));
            if (visible.length === 0) return null;
            return (
              <section key={group.label}>
                <p>{group.label}</p>
                {visible.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </section>
            );
          })}
        </nav>
        <button
          className="collapse-sidebar"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight /> : <PanelLeftClose />}
          <span>{collapsed ? 'Expand' : 'Collapse sidebar'}</span>
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="mobile-menu"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </button>
          <button
            className="global-search-trigger"
            type="button"
            onClick={() => setPaletteOpen(true)}
          >
            <Search aria-hidden="true" />
            <span>Search orders, customers, products…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="topbar-actions">
            <Link className="topbar-icon" href="/notifications" aria-label="Open notifications">
              <Bell />
            </Link>
            <div className="organization-context">
              <span>Active workspace</span>
              <strong>Maevelle</strong>
            </div>
            <button
              className="user-menu"
              type="button"
              onClick={() => void logout()}
              title="Sign out"
            >
              <span aria-hidden="true">O</span>
              <span className="user-copy">
                <strong>Operator</strong>
                <small>Sign out</small>
              </span>
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} context={context} />
    </div>
  );
}
