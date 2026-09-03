'use client';

import { Ruler, ShieldCheck, Settings, CheckCircle2, FolderTree } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/sizing', label: 'Overview', icon: ShieldCheck, exact: true },
  { href: '/sizing/guides', label: 'Size Guides', icon: CheckCircle2, exact: false },
  { href: '/sizing/categories', label: 'Category Defaults', icon: FolderTree, exact: false },
  { href: '/sizing/domains', label: 'Domains & Systems', icon: Settings, exact: false },
  { href: '/sizing/sizes', label: 'Size Definitions', icon: Ruler, exact: false },
  { href: '/sizing/measurements', label: 'Measurements', icon: Settings, exact: false },
];

export default function SizingLayout({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-r border-slate-200 bg-slate-50 lg:w-64">
        <div className="p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
            <Ruler className="h-4 w-4 text-slate-700" />
            Sizing Suite
          </h2>
          <nav className="mt-6 flex flex-col gap-1">
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
                      : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
