'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  LayoutDashboard,
  PackageCheck,
  Ship,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const destinations = [
  { href: '/supply', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { href: '/suppliers', label: 'Suppliers', shortLabel: 'Suppliers', icon: Building2 },
  { href: '/purchases', label: 'Purchases', shortLabel: 'Purchases', icon: ClipboardCheck },
  { href: '/inbound-shipments', label: 'Shipments', shortLabel: 'Shipments', icon: Ship },
  { href: '/receiving', label: 'Goods Receiving', shortLabel: 'Receiving', icon: PackageCheck },
  { href: '/landed-cost', label: 'Landed Cost', shortLabel: 'Landed Cost', icon: CircleDollarSign },
] as const;

function isActiveDestination(pathname: string, href: string) {
  return pathname === href || (href !== '/supply' && pathname.startsWith(`${href}/`));
}

export function SupplyWorkspaceNav({ className }: { readonly className?: string }) {
  const pathname = usePathname();
  const current =
    destinations.find(({ href }) => isActiveDestination(pathname, href)) ?? destinations[0];
  const CurrentIcon = current.icon;

  return (
    <nav aria-label="Supply workspace" className={cn('-mx-4 sm:-mx-6 lg:-mx-8', className)}>
      <details className="group border-y bg-card sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none touch-manipulation items-center justify-between gap-3 px-4 text-sm font-semibold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <span className="flex min-w-0 items-center gap-2">
            <CurrentIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="truncate">Supply · {current.label}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
          />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t bg-muted/20 p-3">
          {destinations.map(({ href, label, icon: Icon }) => {
            const active = isActiveDestination(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 touch-manipulation items-center gap-2 rounded-lg border px-3 text-sm font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary/30 bg-primary-subtle text-primary'
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

      <div className="hidden overflow-x-auto border-y bg-card px-6 sm:block lg:px-8">
        <div className="flex min-w-max items-center gap-1 py-2">
          {destinations.map(({ href, shortLabel, icon: Icon }) => {
            const active = isActiveDestination(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 touch-manipulation items-center gap-2 rounded-lg px-3 text-sm font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span>{shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
