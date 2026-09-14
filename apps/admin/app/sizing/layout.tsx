'use client';

import {
  Activity,
  FolderTree,
  GitCompareArrows,
  ListOrdered,
  Ruler,
  Settings2,
  TableProperties,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/sizing', label: 'Overview', icon: Activity, exact: true },
  { href: '/sizing/guides', label: 'Size Guides', icon: TableProperties, exact: false },
  { href: '/sizing/categories', label: 'Category Defaults', icon: FolderTree, exact: false },
  { href: '/sizing/mappings', label: 'Option Mapping', icon: GitCompareArrows, exact: false },
  { href: '/sizing/domains', label: 'Domains & Systems', icon: Settings2, exact: false },
  { href: '/sizing/sizes', label: 'Size Definitions', icon: ListOrdered, exact: false },
  { href: '/sizing/measurements', label: 'Measurements', icon: Ruler, exact: false },
] as const;

export default function SizingLayout({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/40 lg:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:w-64 lg:border-b-0 lg:border-r">
        <div className="p-5 lg:sticky lg:top-0">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
              <Ruler className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">Sizing Suite</h2>
              <p className="text-[11px] text-slate-500">Standards, guides & mappings</p>
            </div>
          </div>

          <nav className="mt-5 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex lg:flex-col" aria-label="Sizing navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
