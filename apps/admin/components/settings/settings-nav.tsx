'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Palette, Ruler } from 'lucide-react';

const settingsTabs = [
  {
    href: '/settings',
    label: 'Organization',
    icon: Building2,
    exact: true,
  },
  {
    href: '/settings/colors',
    label: 'Color Library',
    icon: Palette,
    exact: false,
  },
  {
    href: '/sizing',
    label: 'Sizing Guides',
    icon: Ruler,
    exact: false,
  },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings navigation"
      className="mb-6 flex flex-wrap items-center gap-1 border-b pb-2"
    >
      {settingsTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + '/');

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
