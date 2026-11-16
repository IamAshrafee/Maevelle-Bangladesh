'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { AdminContextDto } from '@maevelle/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NavIcon } from '@/components/navigation/nav-icons';
import { useAdminContext } from '@/components/admin-capabilities';
import { internalAdminPath } from '@/lib/auth/access-policy';
import {
  getModuleNavItems,
  hasRoutePermission,
  type ModuleNavId,
  type ModuleNavItem,
  type PageWidthVariant,
} from '@/lib/navigation/route-registry';
import { ADMIN_MOTION, AdminLayoutGroup, motion } from '@/components/motion/motion-primitives';
import { cn } from '@/lib/utils';

const MODULE_CONTAINER_WIDTHS: Record<Exclude<PageWidthVariant, 'immersive'>, string> = {
  standard: 'max-w-7xl',
  wide: 'max-w-[1600px]',
  narrow: 'max-w-4xl',
};

function isModuleItemMatch(currentPath: string, item: ModuleNavItem): boolean {
  if (item.exact) {
    return currentPath === item.href;
  }
  if (currentPath === item.href || currentPath.startsWith(`${item.href}/`)) {
    return true;
  }
  return (item.aliases ?? []).some((alias) =>
    alias.endsWith('/')
      ? currentPath === alias.slice(0, -1) || currentPath.startsWith(alias)
      : currentPath === alias || currentPath.startsWith(`${alias}/`),
  );
}

function getBestActiveHref(currentPath: string, items: readonly ModuleNavItem[]): string | null {
  let bestHref: string | null = null;
  let bestScore = -1;

  for (const item of items) {
    if (!isModuleItemMatch(currentPath, item)) continue;
    const score = item.href === currentPath ? item.href.length + 1000 : item.href.length;
    if (score > bestScore) {
      bestScore = score;
      bestHref = item.href;
    }
  }
  return bestHref;
}

export interface ModuleNavProps {
  readonly moduleId?: ModuleNavId | undefined;
  readonly items?: readonly ModuleNavItem[] | undefined;
  readonly context?: AdminContextDto | undefined;
  readonly maxPrimary?: number | undefined;
  readonly ariaLabel?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Layer 2 route-based module navigation strip.
 * Keeps primary navigation capped at <= 5 visible pills and moves secondary
 * destinations into a `More` popover menu.
 */
export function ModuleNav({
  moduleId,
  items,
  context,
  maxPrimary = 5,
  ariaLabel = 'Module navigation',
  className,
}: ModuleNavProps) {
  const pathname = usePathname() ?? '/';
  const shellContext = useAdminContext();
  const hasShellSession =
    Boolean(shellContext.actorId) ||
    shellContext.membershipType === 'OWNER' ||
    shellContext.capabilities.length > 0;
  const effectiveContext = context ?? (hasShellSession ? shellContext : undefined);

  const visibleItems = React.useMemo(() => {
    if (items) {
      return effectiveContext
        ? items.filter((item) => hasRoutePermission(effectiveContext, item))
        : items;
    }
    if (!moduleId) return [];
    return getModuleNavItems(moduleId, effectiveContext);
  }, [items, moduleId, effectiveContext]);

  const currentPath = internalAdminPath(pathname);
  const activeHref = React.useMemo(
    () => getBestActiveHref(currentPath, visibleItems),
    [currentPath, visibleItems],
  );

  const primaryLimit = Math.max(1, Math.min(5, maxPrimary));
  const explicitPrimary = visibleItems.filter((item) => !item.overflow);
  const primaryItems = explicitPrimary.slice(0, primaryLimit);
  const overflowItems = [
    ...explicitPrimary.slice(primaryLimit),
    ...visibleItems.filter((item) => item.overflow),
  ];

  if (visibleItems.length === 0) return null;

  const activeOverflowItem = overflowItems.find((item) => item.href === activeHref);
  const navId = React.useId();

  return (
    <AdminLayoutGroup id={navId}>
      <nav
        aria-label={ariaLabel}
        data-shell-chrome="true"
        className={cn(
          'flex items-center gap-1.5 overflow-x-auto overscroll-x-contain no-scrollbar py-1.5 print:hidden',
          className,
        )}
      >
        {primaryItems.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative z-0 inline-flex min-h-11 md:min-h-10 pointer-coarse:min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 whitespace-nowrap',
                active
                  ? 'border-transparent text-primary-hover dark:text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="module-nav-active-pill"
                  transition={ADMIN_MOTION.spring}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 rounded-lg border border-primary/25 bg-primary-subtle"
                />
              ) : null}
              <NavIcon name={item.icon} className="size-3.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {overflowItems.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex min-h-11 md:min-h-10 pointer-coarse:min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 whitespace-nowrap cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeOverflowItem
                  ? 'border-primary/25 bg-primary-subtle text-primary-hover dark:text-primary font-semibold'
                  : 'border-border/70 bg-card text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              <span>{activeOverflowItem ? `More · ${activeOverflowItem.label}` : 'More'}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-75" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 p-1 bg-card border-border shadow-md">
              {overflowItems.map((item) => {
                const active = item.href === activeHref;
                return (
                  <DropdownMenuLinkItem
                    key={item.href}
                    render={
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex w-full min-h-11 md:min-h-9 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-xs cursor-pointer',
                          active
                            ? 'bg-primary-subtle text-primary-hover dark:text-primary font-semibold'
                            : 'text-foreground hover:bg-muted',
                        )}
                      />
                    }
                  >
                    <NavIcon name={item.icon} className="size-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </DropdownMenuLinkItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </nav>
    </AdminLayoutGroup>
  );
}

/**
 * Layer 2 route layout wrapper owning module navigation without adding inner `<main>` padding,
 * so Layer 3 `<AdminPage>` keeps single ownership of page width and padding.
 */
export function ModuleLayout({
  moduleId,
  items,
  ariaLabel,
  widthVariant = 'wide',
  children,
}: {
  readonly moduleId?: ModuleNavId | undefined;
  readonly items?: readonly ModuleNavItem[] | undefined;
  readonly ariaLabel?: string | undefined;
  readonly widthVariant?: Exclude<PageWidthVariant, 'immersive'> | undefined;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-w-0 w-full">
      <div data-shell-chrome="true" className="border-b border-border/70 bg-card/60 print:hidden">
        <div
          className={cn(
            'mx-auto w-full px-4 md:px-6 lg:px-8',
            MODULE_CONTAINER_WIDTHS[widthVariant],
          )}
        >
          <ModuleNav moduleId={moduleId} items={items} ariaLabel={ariaLabel} />
        </div>
      </div>
      {children}
    </div>
  );
}
