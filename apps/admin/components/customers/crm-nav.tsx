'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Fingerprint,
  GitCompareArrows,
  Settings2,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/customers', label: 'Directory', icon: UsersRound },
  { href: '/customers/identities', label: 'Identities', icon: Fingerprint },
  { href: '/customers/duplicates', label: 'Duplicates', icon: GitCompareArrows },
  { href: '/customers/segments', label: 'Segments', icon: UsersRound },
  { href: '/customers/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/customers/privacy', label: 'Privacy', icon: ShieldCheck },
  { href: '/customers/settings', label: 'Settings', icon: Settings2 },
] as const;

export function CrmNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Customer CRM" className="-mx-1 overflow-x-auto px-1">
      <div className="flex min-w-max gap-1 rounded-xl border border-border bg-card p-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active && 'bg-primary-subtle text-primary',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
