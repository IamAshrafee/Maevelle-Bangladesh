'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, ClipboardCheck, LayoutDashboard, ScanBarcode, Truck, Warehouse } from 'lucide-react';

import { useAdminContext } from '@/components/admin-capabilities';
import { cn } from '@/lib/utils';

const destinations = [
  { label: 'Overview', href: '/inventory', icon: LayoutDashboard, capability: 'inventory.view', aliases: [] },
  { label: 'Stock', href: '/inventory/stock', icon: Boxes, capability: 'inventory.view', aliases: ['/inventory/replenishment', '/inventory/adjustments', '/inventory/history', '/inventory/reservations', '/inventory/settings'] },
  { label: 'Locations', href: '/inventory/warehouses', icon: Warehouse, capability: 'warehouse.view', aliases: [] },
  { label: 'Transfers', href: '/inventory/transfers', icon: Truck, capability: 'inventory.transfer', aliases: [] },
  { label: 'Counts', href: '/inventory/stocktakes', icon: ClipboardCheck, capability: 'inventory.stocktake', aliases: [] },
  { label: 'Quality', href: '/inventory/units', icon: ScanBarcode, capability: 'inventory.units.view', aliases: [] },
] as const;

function matches(pathname: string, destination: (typeof destinations)[number]): boolean {
  if (destination.href === '/inventory' && pathname === '/inventory') return true;
  if (destination.href !== '/inventory' && (pathname === destination.href || pathname.startsWith(`${destination.href}/`))) return true;
  return destination.aliases.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}

export function InventoryWorkspaceNav() {
  const pathname = usePathname();
  const context = useAdminContext();
  const visibleDestinations = destinations.map((destination) => ({
    ...destination,
    allowed:
      context.membershipType === 'OWNER' || context.capabilities.includes(destination.capability),
  }));

  return (
    <nav aria-label="Inventory workspace" className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-2xs">
        <div className="flex min-w-max gap-1">
          {visibleDestinations.filter((destination) => destination.allowed).map((destination) => {
            const Icon = destination.icon;
            const active = matches(pathname, destination);
            return (
              <Link
                key={destination.href}
                href={destination.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-subtle text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {destination.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
