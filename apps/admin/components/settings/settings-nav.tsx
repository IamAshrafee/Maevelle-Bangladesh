'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Building2,
  HeartPulse,
  LayoutDashboard,
  Palette,
  Plug,
  Ruler,
  Server,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const coreSettingsTabs = [
  {
    href: '/settings',
    label: 'Overview',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: '/settings/general',
    label: 'General',
    icon: SlidersHorizontal,
    exact: true,
  },
  {
    href: '/settings/organization',
    label: 'Organization',
    icon: Building2,
    exact: true,
  },
  {
    href: '/settings/security',
    label: 'Security',
    icon: Shield,
    exact: true,
  },
  {
    href: '/settings/integrations',
    label: 'Integrations',
    icon: Plug,
    exact: false,
  },
  {
    href: '/settings/health',
    label: 'Configuration Health',
    icon: HeartPulse,
    exact: true,
  },
  {
    href: '/settings/system',
    label: 'System',
    icon: Server,
    exact: true,
  },
  {
    href: '/settings/design-system',
    label: 'Design System',
    icon: Sparkles,
    exact: true,
  },
] as const;

export const secondarySettingsTabs = [
  {
    href: '/settings/storefront',
    label: 'Storefront',
    icon: Store,
  },
  {
    href: '/settings/colors',
    label: 'Color Library',
    icon: Palette,
  },
  {
    href: '/sizing',
    label: 'Sizing Guides',
    icon: Ruler,
  },
] as const;

export function SettingsNav({ className }: { readonly className?: string }) {
  const pathname = usePathname();

  return (
    <div className={cn('mb-6 space-y-2 border-b pb-3', className)}>
      <nav
        aria-label="Settings primary navigation"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-sm"
      >
        {coreSettingsTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(tab.href + '/');

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
        <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/80">
          Module links:
        </span>
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
          {secondarySettingsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'inline-flex items-center gap-1 hover:text-foreground transition-colors',
                  isActive && 'text-foreground font-medium underline underline-offset-4',
                )}
              >
                <Icon className="size-3" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
