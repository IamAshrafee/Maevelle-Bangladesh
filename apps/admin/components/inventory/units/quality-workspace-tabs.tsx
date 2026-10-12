'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, Wrench } from 'lucide-react';

import { cn } from '@/lib/utils';

const views = [
  { href: '/inventory/units', label: 'Physical units', icon: Boxes, exact: true },
  { href: '/inventory/units/repairs', label: 'Repair queue', icon: Wrench, exact: false },
] as const;

export function QualityWorkspaceTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Quality views"
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-1"
    >
      {views.map((view) => {
        const active = view.exact ? pathname === view.href : pathname.startsWith(view.href);
        const Icon = view.icon;
        return (
          <Link
            key={view.href}
            href={view.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-card text-foreground shadow-2xs'
                : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
