'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Calculator,
  CircleDollarSign,
  ClipboardCheck,
  LayoutDashboard,
  PackageCheck,
  Ship,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const destinations = [
  { href: '/supply', label: 'Overview', icon: LayoutDashboard },
  { href: '/suppliers', label: 'Suppliers', icon: Building2 },
  { href: '/purchases', label: 'Purchases', icon: ClipboardCheck },
  { href: '/inbound-shipments', label: 'Shipments', icon: Ship },
  { href: '/receiving', label: 'Receiving', icon: PackageCheck },
  { href: '/landed-cost', label: 'Landed Cost', icon: CircleDollarSign },
  { href: '/costing', label: 'Costing', icon: Calculator },
] as const;

export function SupplyWorkspaceNav({ className }: { readonly className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Supply workspace"
      className={cn(
        '-mx-4 overflow-x-auto border-y bg-card px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      <div className="flex min-w-max items-center gap-1 py-2">
        {destinations.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== '/supply' && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
