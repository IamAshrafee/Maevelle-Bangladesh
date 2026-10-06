'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cx } from '@/components/ui/classnames';
import { GridIcon, HeartIcon, PersonIcon, StorefrontIcon } from '@/components/ui/icons';

export type BottomNavProps = {
  activeTab?: 'explore' | 'categories' | 'wishlist' | 'account' | undefined;
  className?: string | undefined;
  onTabClick?: ((tab: 'explore' | 'categories' | 'wishlist' | 'account') => void) | undefined;
  responsive?: boolean | undefined;
  wishlistCount?: number | undefined;
};

export function BottomNav({
  activeTab,
  className,
  onTabClick,
  responsive = true,
  wishlistCount = 5,
}: BottomNavProps) {
  const pathname = usePathname();

  const currentTab =
    activeTab ||
    (pathname === '/'
      ? 'explore'
      : pathname?.startsWith('/categories')
        ? 'categories'
        : pathname?.startsWith('/wishlist')
          ? 'wishlist'
          : pathname?.startsWith('/account') || pathname?.startsWith('/orders')
            ? 'account'
            : 'explore');

  return (
    <nav
      aria-label="Mobile navigation"
      className={cx(
        'fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-xl shadow-[0_-4px_20px_rgba(158,42,75,0.06)] pb-safe border-t border-border/40 transition-[background-color,border-color] duration-150',
        responsive && 'sm:hidden',
        className,
      )}
    >
      <div className="grid h-16 grid-cols-4 items-center px-2">
        {/* Explore Tab */}
        <Link
          className={cx(
            'group flex h-full min-h-12 flex-col items-center justify-center py-1 transition-colors duration-150 active:scale-95',
            currentTab === 'explore'
              ? 'text-primary font-semibold'
              : 'text-on-surface-variant hover:text-primary',
          )}
          href="/"
          onClick={() => onTabClick?.('explore')}
        >
          <StorefrontIcon className="transition-transform duration-150 group-hover:scale-105" size={22} />
          <span className="mt-0.5 text-label-sm tracking-wide text-[11px]">Explore</span>
          {currentTab === 'explore' ? (
            <span className="mt-0.5 size-1 rounded-full bg-primary opacity-90 transition-opacity duration-150" />
          ) : (
            <span className="mt-0.5 size-1" />
          )}
        </Link>

        {/* Categories Tab */}
        <Link
          className={cx(
            'group flex h-full min-h-12 flex-col items-center justify-center py-1 transition-colors duration-150 active:scale-95',
            currentTab === 'categories'
              ? 'text-primary font-semibold'
              : 'text-on-surface-variant hover:text-primary',
          )}
          href="/categories"
          onClick={() => onTabClick?.('categories')}
        >
          <GridIcon className="transition-transform duration-150 group-hover:scale-105" size={22} />
          <span className="mt-0.5 text-label-sm tracking-wide text-[11px]">Categories</span>
          {currentTab === 'categories' ? (
            <span className="mt-0.5 size-1 rounded-full bg-primary opacity-90 transition-opacity duration-150" />
          ) : (
            <span className="mt-0.5 size-1" />
          )}
        </Link>

        {/* Wishlist Tab */}
        <Link
          className={cx(
            'group relative flex h-full min-h-12 flex-col items-center justify-center py-1 transition-colors duration-150 active:scale-95',
            currentTab === 'wishlist'
              ? 'text-primary font-semibold'
              : 'text-on-surface-variant hover:text-primary',
          )}
          href="/wishlist"
          onClick={() => onTabClick?.('wishlist')}
        >
          <div className="relative">
            <HeartIcon
              className="transition-transform duration-150 group-hover:scale-105"
              filled={currentTab === 'wishlist'}
              size={22}
            />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-2 flex size-3.5 min-w-3.5 items-center justify-center rounded-full bg-secondary-container px-0.5 font-mono text-[9px] font-bold text-on-secondary-container tabular-nums">
                {wishlistCount}
              </span>
            )}
          </div>
          <span className="mt-0.5 text-label-sm tracking-wide text-[11px]">Wishlist</span>
          {currentTab === 'wishlist' ? (
            <span className="mt-0.5 size-1 rounded-full bg-primary opacity-90 transition-opacity duration-150" />
          ) : (
            <span className="mt-0.5 size-1" />
          )}
        </Link>

        {/* Account Tab */}
        <Link
          className={cx(
            'group flex h-full min-h-12 flex-col items-center justify-center py-1 transition-colors duration-150 active:scale-95',
            currentTab === 'account'
              ? 'text-primary font-semibold'
              : 'text-on-surface-variant hover:text-primary',
          )}
          href="/orders"
          onClick={() => onTabClick?.('account')}
        >
          <PersonIcon className="transition-transform duration-150 group-hover:scale-105" size={22} />
          <span className="mt-0.5 text-label-sm tracking-wide text-[11px]">Account</span>
          {currentTab === 'account' ? (
            <span className="mt-0.5 size-1 rounded-full bg-primary opacity-90 transition-opacity duration-150" />
          ) : (
            <span className="mt-0.5 size-1" />
          )}
        </Link>
      </div>
    </nav>
  );
}
