'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronRight,
  Command,
  Menu,
  PanelLeftClose,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import * as React from 'react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminContextDto, ApiEnvelope } from '@maevelle/contracts';

import { AdminCapabilitiesProvider } from './admin-capabilities';
import { TwoFactorRequiredGate } from './security/two-factor-required-gate';
import { UserMenu } from './user-menu';
import { NotificationBell } from './notifications/notification-bell';
import { NavIcon } from './navigation/nav-icons';
import { cn } from '@/lib/utils';
import { publicAdminPaths, safeAdminReturnUrl } from '@/lib/auth/access-policy';
import { useAdminAccess } from '@/lib/auth/use-admin-access';
import {
  getCommandPaletteEntries,
  getPlatformUtilityItems,
  getRouteEntry,
  getSidebarPillars,
  hasRoutePermission,
  isSidebarItemActive,
  toAppRoutePath,
} from '@/lib/navigation/route-registry';
import { AdminAccessFeedback } from './security/admin-access-feedback';
import { ADMIN_MOTION, AnimatePresence, MotionBackdrop, motion } from './motion/motion-primitives';

export function useAdminShellChrome() {
  return { setMobileIslandHidden: () => undefined };
}

type AdminContext = AdminContextDto;

type SearchResult = { kind: string; label: string; detail: string; href: string };

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

  const local = useMemo(() => {
    const q = query.trim().toLowerCase();
    return getCommandPaletteEntries(context)
      .filter((item) =>
        q.length === 0 ? true : `${item.label} ${item.keywords ?? ''}`.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [context, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRemote([]);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  useEffect(() => {
    if (
      !open ||
      query.trim().length < 2 ||
      !hasRoutePermission(context, { capability: 'admin.operations.view' })
    ) {
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
        if (response.ok) {
          setRemote(((await response.json()) as ApiEnvelope<readonly SearchResult[]>).data);
        }
      } finally {
        setBusy(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [context, open, query]);

  const go = (href: string) => {
    onClose();
    router.push(toAppRoutePath(href));
  };

  return (
    <AnimatePresence>
      {open ? (
        <MotionBackdrop
          key="command-palette-backdrop"
          data-shell-chrome="true"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-20 bg-foreground/45 dark:bg-black/60 backdrop-blur-xs touch-none print:hidden"
          role="presentation"
          onMouseDown={onClose}
        >
          <motion.section
            key="command-palette-panel"
            aria-label="Command palette"
            aria-modal="true"
            role="dialog"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={ADMIN_MOTION.panel}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden overscroll-contain flex flex-col max-h-[80vh] text-card-foreground"
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
              <button
                type="button"
                onClick={onClose}
                aria-label="Close search"
                className="sm:hidden min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y p-2 space-y-1 divide-y divide-border/40">
              <div className="space-y-0.5">
                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Workspaces &amp; actions
                </p>
                {local.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.href)}
                    className="w-full min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left text-foreground hover:bg-muted/60 transition-colors group cursor-pointer"
                  >
                    <NavIcon
                      name={item.icon}
                      className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    <ChevronRight
                      className="size-3.5 text-muted-foreground/60 group-hover:text-foreground shrink-0"
                      aria-hidden="true"
                    />
                  </button>
                ))}
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
                      className="w-full min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left text-foreground hover:bg-muted/60 transition-colors group cursor-pointer"
                    >
                      <Search
                        className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                        aria-hidden="true"
                      />
                      <span className="flex-1 min-w-0">
                        <strong className="block text-sm font-medium text-foreground truncate">
                          {result.label}
                        </strong>
                        <small className="block text-xs text-muted-foreground truncate">
                          {result.kind} · {result.detail}
                        </small>
                      </span>
                      <ChevronRight
                        className="size-3.5 text-muted-foreground/60 group-hover:text-foreground shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              ) : null}

              {busy ? (
                <p className="px-3 py-4 text-xs text-center text-muted-foreground">
                  Searching authoritative records…
                </p>
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
              <span>Results respect your active organization &amp; permissions</span>
            </footer>
          </motion.section>
        </MotionBackdrop>
      ) : null}
    </AnimatePresence>
  );
}

interface SidebarNavBodyProps {
  readonly pathname: string;
  readonly visiblePillars: ReturnType<typeof getSidebarPillars>;
  readonly utilityItems: ReturnType<typeof getPlatformUtilityItems>;
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly onCloseMobile: () => void;
}

function SidebarNavBody({
  pathname,
  visiblePillars,
  utilityItems,
  collapsed,
  onToggleCollapse,
  onCloseMobile,
}: SidebarNavBodyProps) {
  return (
    <>
      {/* Brand Lockup */}
      <div
        className={cn(
          'h-14 flex items-center gap-3 px-4 border-b border-sidebar-border bg-sidebar shrink-0',
          collapsed && 'md:justify-center md:px-2',
        )}
      >
        <div
          className="size-8 rounded-lg bg-primary text-foreground dark:text-primary-foreground font-bold flex items-center justify-center text-sm shadow-xs shrink-0 tracking-tight"
          aria-hidden="true"
        >
          M
        </div>
        <div className={cn('min-w-0 flex flex-col leading-tight', collapsed && 'md:hidden')}>
          <strong className="text-sm font-bold tracking-tight text-sidebar-foreground">
            Maevelle
          </strong>
          <span className="text-[11px] text-muted-foreground font-normal">Business operations</span>
        </div>
        <button
          className="ml-auto md:hidden min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-sidebar-accent"
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Scrollable Operational Pillars Navigation */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden touch-pan-y px-3 py-3 space-y-4 overscroll-contain scrollbar-none"
        aria-label="Admin navigation"
      >
        {visiblePillars.map((group) => (
          <section key={group.id} className="space-y-0.5">
            <p
              className={cn(
                'px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80',
                collapsed && 'md:hidden',
              )}
            >
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = isSidebarItemActive(pathname, item);
              return (
                <Link
                  key={item.id}
                  aria-current={active ? 'page' : undefined}
                  href={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'group flex min-h-11 md:min-h-0 items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                    active
                      ? 'bg-primary-subtle text-primary-hover dark:text-primary font-semibold'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    collapsed && 'md:justify-center md:px-0 md:size-9 md:mx-auto',
                  )}
                >
                  <NavIcon
                    name={item.icon}
                    className={cn(
                      'size-4 shrink-0 transition-colors',
                      active
                        ? 'text-primary-hover dark:text-primary'
                        : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
                </Link>
              );
            })}
          </section>
        ))}
      </nav>

      {/* Sidebar Footer: Settings Utility & Collapse */}
      <div className="flex flex-col gap-0.5 border-t border-sidebar-border p-2 shrink-0">
        {utilityItems.map((item) => {
          const active = isSidebarItemActive(pathname, item);
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onCloseMobile}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'group flex min-h-11 md:min-h-0 items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                active
                  ? 'bg-primary-subtle text-primary-hover dark:text-primary font-semibold'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'md:justify-center md:px-0 md:size-9 md:mx-auto',
              )}
            >
              <NavIcon
                name={item.icon}
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active
                    ? 'text-primary-hover dark:text-primary'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'hidden md:flex w-full items-center gap-2 mt-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors cursor-pointer',
            collapsed && 'justify-center px-0 size-9 mx-auto',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="size-4 shrink-0" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" />
          )}
          <span className={cn(collapsed && 'hidden')}>
            {collapsed ? 'Expand' : 'Collapse sidebar'}
          </span>
        </button>
      </div>
    </>
  );
}

export function AdminShell({
  children,
  initialContext,
}: {
  children: ReactNode;
  initialContext?: AdminContext;
}) {
  const pathname = usePathname() ?? '/';
  const { context, failure, refresh, signOut } = useAdminAccess(pathname, initialContext);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setPaletteOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen && !paletteOpen) return;
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = originalOverflow;
    };
  }, [mobileOpen, paletteOpen]);

  const visiblePillars = useMemo(() => getSidebarPillars(context), [context]);
  const utilityItems = useMemo(() => getPlatformUtilityItems(context), [context]);
  const routeEntry = useMemo(() => getRouteEntry(pathname), [pathname]);
  const viewportLocked = routeEntry?.pageVariant === 'immersive';

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

  if (publicAdminPaths.has(pathname)) return children;

  if (failure) {
    return (
      <AdminAccessFeedback
        reason={failure}
        returnTo={
          typeof window === 'undefined'
            ? '/admin'
            : window.location.pathname + window.location.search
        }
      />
    );
  }

  if (context?.twoFactor.accessRestricted) {
    return (
      <TwoFactorRequiredGate
        context={context}
        onEnrolled={() => {
          const destination = new URLSearchParams(window.location.search).get('redirect');
          if (destination) window.location.assign(safeAdminReturnUrl(destination));
          else void refresh();
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        'bg-background text-foreground flex flex-col md:flex-row relative',
        viewportLocked ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      {/* Mobile Backdrop & Slide-Over Navigation */}
      <AnimatePresence>
        {mobileOpen ? (
          <React.Fragment key="mobile-nav">
            <MotionBackdrop
              data-shell-chrome="true"
              className="fixed inset-0 z-40 bg-foreground/40 dark:bg-black/60 backdrop-blur-xs md:hidden touch-none print:hidden"
              aria-hidden="true"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              data-shell-chrome="true"
              aria-label="Mobile navigation"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={ADMIN_MOTION.drawer}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar border-r border-sidebar-border shadow-2xl md:hidden select-none overflow-hidden overscroll-contain print:hidden"
            >
              <SidebarNavBody
                pathname={pathname}
                visiblePillars={visiblePillars}
                utilityItems={utilityItems}
                collapsed={false}
                onToggleCollapse={() => setCollapsed((value) => !value)}
                onCloseMobile={() => setMobileOpen(false)}
              />
            </motion.aside>
          </React.Fragment>
        ) : null}
      </AnimatePresence>

      {/* Desktop Sidebar Navigation */}
      <motion.aside
        data-shell-chrome="true"
        initial={false}
        animate={{ width: collapsed ? 72 : 256 }}
        transition={ADMIN_MOTION.spring}
        className="hidden md:flex md:sticky md:top-0 md:h-screen flex-col bg-sidebar border-r border-sidebar-border shrink-0 overflow-x-hidden select-none print:hidden"
      >
        <SidebarNavBody
          pathname={pathname}
          visiblePillars={visiblePillars}
          utilityItems={utilityItems}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </motion.aside>

      {/* Main Workspace Column */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0',
          viewportLocked && 'min-h-0 overflow-hidden',
        )}
      >
          {/* Sticky Chrome Topbar */}
          <header
            data-shell-chrome="true"
            className="sticky top-0 z-30 h-14 shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 border-b border-border/80 bg-background/85 backdrop-blur-md transition-colors print:hidden"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                className="md:hidden min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
                aria-label="Open navigation"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="size-5" />
              </button>

              {/* Global Search Trigger */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex min-w-0 items-center gap-2 min-h-11 md:min-h-9 md:h-9 pointer-coarse:min-h-11 w-48 sm:w-72 lg:w-96 rounded-full border border-border/80 bg-card/60 hover:bg-card px-3.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 shadow-2xs transition-colors cursor-pointer"
              >
                <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-left truncate">Search orders, customers, stock…</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border/70 rounded">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Topbar Right Actions */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />

              <div className="hidden sm:flex flex-col items-end leading-none border-l border-border pl-3">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                  Workspace
                </span>
                <strong className="text-xs font-semibold text-foreground">Maevelle BD</strong>
              </div>

              {/* User Profile Menu */}
              <UserMenu context={context} onLogout={signOut} />
            </div>
          </header>

          {/* 2FA Grace Period Notice */}
          {context?.twoFactor.enrollmentRequired &&
          !context.twoFactor.accessRestricted &&
          pathname !== '/account/security' ? (
            <div
              data-shell-chrome="true"
              className="bg-warning/10 border-b border-warning/30 px-4 py-2.5 text-xs text-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:hidden"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-warning shrink-0" />
                <span>
                  <strong>Authenticator setup required:</strong> Your account must configure
                  two-factor authentication before{' '}
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
          <div
            className={cn(
              'flex-1 min-w-0',
              viewportLocked && 'flex flex-col min-h-0 overflow-hidden',
            )}
          >
            <AdminCapabilitiesProvider capabilities={context?.capabilities ?? []} context={context}>
              {children}
            </AdminCapabilitiesProvider>
          </div>
        </div>

        {/* Command Palette Modal */}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          context={context}
        />
      </div>
    );
}
