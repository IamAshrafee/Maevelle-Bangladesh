'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { cx } from '@/components/ui/classnames';
import { GridIcon, HeartIcon, PersonIcon, StorefrontIcon, TruckIcon } from '@/components/ui/icons';
import { useWishlist } from '@/features/wishlist/use-wishlist';
import { WishlistDrawer } from '@/features/wishlist/components/wishlist-drawer';

export type BottomNavProps = {
  activeTab?: 'explore' | 'categories' | 'wishlist' | 'orders' | 'account' | undefined;
  className?: string | undefined;
  onTabClick?: ((tab: 'explore' | 'categories' | 'wishlist' | 'orders' | 'account') => void) | undefined;
  responsive?: boolean | undefined;
  wishlistCount?: number | undefined;
};

export function BottomNav({
  activeTab,
  className,
  onTabClick,
  responsive = true,
}: BottomNavProps) {
  const pathname = usePathname();
  const wishlist = useWishlist();
  const wishlistCount = wishlist.count;
  const [wishlistOpen, setWishlistOpen] = useState(false);
  useEffect(() => { setWishlistOpen(false); }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setWishlistOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  if (pathname?.startsWith('/checkout') || pathname?.startsWith('/products')) {
    return null;
  }

  const currentTab =
    activeTab ||
    (pathname === '/'
      ? 'explore'
      : pathname?.startsWith('/categories')
        ? 'categories'
        : pathname?.startsWith('/wishlist')
          ? 'wishlist'
          : pathname?.startsWith('/orders')
            ? 'orders'
          : pathname?.startsWith('/account')
            ? 'account'
            : 'explore');

  return (<>
    <nav
      aria-label="Mobile navigation"
      className={cx(
        'fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-xl shadow-[0_-4px_20px_rgba(158,42,75,0.06)] pb-safe border-t border-border/40 transition-[background-color,border-color] duration-150',
        responsive && 'lg:hidden',
        className,
      )}
    >
      <div className="grid h-16 grid-cols-5 items-center px-2">
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
        <button
          className={cx(
            'group relative flex h-full min-h-12 flex-col items-center justify-center py-1 transition-colors duration-150 active:scale-95',
            wishlistOpen || currentTab === 'wishlist'
              ? 'text-primary font-semibold'
              : 'text-on-surface-variant hover:text-primary',
          )}
          aria-label={wishlist.mode === 'resolving' || wishlist.mode === 'expired' ? 'Wishlist, count unavailable' : `Wishlist, ${wishlistCount} saved products`}
          aria-haspopup="dialog"
          aria-expanded={wishlistOpen}
          onClick={() => { setWishlistOpen(true); onTabClick?.('wishlist'); }}
          type="button"
        >
          <div className="relative">
            <HeartIcon
              className="transition-transform duration-150 group-hover:scale-105"
              filled={wishlistOpen || currentTab === 'wishlist'}
              size={22}
            />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-3 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-secondary-container px-1 font-mono text-[9px] font-bold text-on-secondary-container tabular-nums">
                {wishlistCount > 99 ? '99+' : wishlistCount}
              </span>
            )}
          </div>
          <span className="mt-0.5 text-label-sm tracking-wide text-[11px]">Wishlist</span>
          {wishlistOpen || currentTab === 'wishlist' ? (
            <span className="mt-0.5 size-1 rounded-full bg-primary opacity-90 transition-opacity duration-150" />
          ) : (
            <span className="mt-0.5 size-1" />
          )}
        </button>

        {/* Track Order Tab */}
        <Link
          className={cx(
            'group flex h-full min-h-12 flex-col items-center justify-center py-1 transition-colors duration-150 active:scale-95',
            currentTab === 'orders'
              ? 'text-primary font-semibold'
              : 'text-on-surface-variant hover:text-primary',
          )}
          href="/orders/track"
          onClick={() => onTabClick?.('orders')}
        >
          <TruckIcon className="transition-transform duration-150 group-hover:scale-105" size={22} />
          <span className="mt-0.5 text-label-sm tracking-wide text-[11px]">Track</span>
          {currentTab === 'orders' ? (
            <span className="mt-0.5 size-1 rounded-full bg-primary opacity-90 transition-opacity duration-150" />
          ) : (
            <span className="mt-0.5 size-1" />
          )}
        </Link>
        <Link
          className={cx(
            'group flex h-full min-h-12 flex-col items-center justify-center py-1 transition-colors duration-150',
            currentTab === 'account' ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-primary',
          )}
          href="/account"
          onClick={() => onTabClick?.('account')}
        >
          <PersonIcon size={22} />
          <span className="mt-0.5 text-label-sm tracking-wide text-[11px]">Account</span>
        </Link>
      </div>
    </nav>
    <WishlistDrawer isOpen={wishlistOpen} onClose={() => setWishlistOpen(false)} />
  </>);
}
