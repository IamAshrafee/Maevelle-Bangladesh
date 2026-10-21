'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  GitCompareArrows,
  LayoutDashboard,
  SlidersHorizontal,
  TableProperties,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export const sizingDestinations = [
  {
    href: '/sizing',
    label: 'Overview & Quality',
    shortLabel: 'Overview',
    icon: LayoutDashboard,
    description: 'Health metrics, quality checks & remediation',
  },
  {
    href: '/sizing/guides',
    label: 'Size Guides',
    shortLabel: 'Guides',
    icon: TableProperties,
    description: 'Customer-facing measurement charts & revisions',
  },
  {
    href: '/sizing/standards',
    label: 'Standards & Systems',
    shortLabel: 'Standards',
    icon: SlidersHorizontal,
    description: 'Domains, regional systems, sizes & dimensions',
  },
  {
    href: '/sizing/mappings',
    label: 'Option Mapping',
    shortLabel: 'Mapping',
    icon: GitCompareArrows,
    description: 'Link catalog product variant options to canonical sizes',
  },
] as const;

function isActiveDestination(pathname: string, href: string) {
  if (href === '/sizing') {
    return pathname === '/sizing';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SizingWorkspaceNav({ className }: { readonly className?: string }) {
  const pathname = usePathname();
  const current =
    sizingDestinations.find(({ href }) => isActiveDestination(pathname, href)) ??
    sizingDestinations[0];
  const CurrentIcon = current.icon;

  return (
    <nav
      aria-label="Sizing workspace navigation"
      className={cn('-mx-4 sm:-mx-6 lg:-mx-8 border-b border-border bg-card/60 backdrop-blur-xs', className)}
    >
      {/* Mobile Accordion Drawer (< sm) */}
      <details className="group sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none touch-manipulation items-center justify-between gap-3 px-4 py-2 text-sm font-semibold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring select-none">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
              <CurrentIcon aria-hidden="true" className="size-4" />
            </span>
            <span className="truncate">Sizing · {current.shortLabel}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
          />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/30 p-3 animate-in fade-in duration-100">
          {sizingDestinations.map(({ href, label, icon: Icon }) => {
            const active = isActiveDestination(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 touch-manipulation items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary/40 bg-primary-subtle text-primary font-semibold shadow-2xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </details>

      {/* Desktop Horizontal Strip (sm and up) */}
      <div className="hidden overflow-x-auto px-6 sm:block lg:px-8">
        <div className="flex min-w-max items-center gap-1.5 py-2.5">
          {sizingDestinations.map(({ href, shortLabel, icon: Icon }) => {
            const active = isActiveDestination(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-9 touch-manipulation items-center gap-2 rounded-lg px-3.5 text-xs font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                <span>{shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
