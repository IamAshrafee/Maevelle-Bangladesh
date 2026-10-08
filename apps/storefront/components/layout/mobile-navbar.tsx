'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { cx } from '@/components/ui/classnames';
import { CloseIcon, SearchIcon, ShoppingBagIcon, SparklesIcon } from '@/components/ui/icons';
import { useCartCount } from '@/features/cart/use-cart-count';

export type MobileNavbarProps = {
  cartCount?: number | undefined;
  className?: string | undefined;
  onOpenCart?: (() => void) | undefined;
  responsive?: boolean | undefined;
  storeName?: string | undefined;
};

const TRENDING_SEARCHES = [
  { term: 'Freshwater Pearls', category: 'Jewelry' },
  { term: 'Silk Scarves', category: 'Accessories' },
  { term: 'Velvet Hair Ribbons', category: 'Hair' },
  { term: 'Gold Vermeil', category: 'Jewelry' },
  { term: 'Quilted Mini Crossbody', category: 'Bags' },
];

export function MobileNavbar({
  cartCount: initialCartCount,
  className,
  onOpenCart,
  responsive = true,
  storeName = 'Maevelle',
}: MobileNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const liveCount = useCartCount(initialCartCount ?? 0);
  const cartCount = initialCartCount !== undefined ? initialCartCount : liveCount;

  if (pathname?.startsWith('/checkout')) {
    return null;
  }

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [cartAnimate, setCartAnimate] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Trigger bounce animation when cart count increases
  useEffect(() => {
    if (cartCount > 0) {
      setCartAnimate(true);
      const timer = setTimeout(() => setCartAnimate(false), 300);
      return () => clearTimeout(timer);
    }
  }, [cartCount]);

  // Scroll detection for dynamic shadow and frosted glass elevation
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard navigation: Escape key closes search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  const handleToggleSearch = () => {
    setIsSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => searchInputRef.current?.focus(), 120);
      }
      return next;
    });
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      setIsSearchOpen(false);
    }
  };

  const handleSelectSuggestion = (term: string) => {
    setSearchQuery(term);
    router.push(`/search?q=${encodeURIComponent(term)}`);
    setIsSearchOpen(false);
  };

  return (
    <>
      <header
        className={cx(
          'sticky top-0 z-40 w-full pt-safe transition-[background-color,border-color,box-shadow] duration-200',
          isScrolled
            ? 'bg-surface/95 backdrop-blur-xl border-b border-border/70 shadow-[0_2px_12px_rgba(158,42,75,0.06)]'
            : 'bg-surface/90 backdrop-blur-md border-b border-border/40 shadow-[0_1px_6px_rgba(158,42,75,0.03)]',
          responsive && 'lg:hidden',
          className,
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          {/* Brand Logo (Left) */}
          <Link
            aria-label={`${storeName} Home`}
            className="flex flex-col group select-none cursor-pointer"
            href="/"
          >
            <span className="font-serif text-[24px] sm:text-[26px] font-semibold leading-none tracking-tight text-primary transition-colors group-hover:text-primary-hover">
              {storeName}
            </span>
            <span className="font-label-sm text-[9.5px] sm:text-[10px] font-medium tracking-[0.24em] text-on-surface-variant/80 uppercase -mt-0.5">
              Dhaka
            </span>
          </Link>

          {/* Tablet Inline Search Bar (Visible on sm to lg) */}
          <div className="hidden sm:flex flex-1 max-w-xs md:max-w-sm mx-4">
            <form className="relative w-full" onSubmit={handleSearchSubmit}>
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70">
                <SearchIcon size={16} />
              </span>
              <input
                aria-label="Search catalog"
                className="h-10 w-full rounded-full border border-border/60 bg-surface-container-low/70 pl-9 pr-4 font-body-md text-xs text-on-surface placeholder:text-on-surface-variant/60 shadow-2xs transition-[background-color,border-color,box-shadow] focus:border-primary/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/10 focus:outline-none"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jewelry, scarves, bows…"
                type="search"
                value={searchQuery}
              />
            </form>
          </div>

          {/* Header Actions: Search & Shopping Bag (Right) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search Toggle Button (Mobile phones only; tablet has inline input) */}
            <button
              aria-expanded={isSearchOpen}
              aria-label="Search catalog"
              className={`flex sm:hidden h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer active:scale-95 ${
                isSearchOpen
                  ? 'bg-primary-fixed/30 text-primary'
                  : 'text-on-surface hover:bg-surface-container-low hover:text-primary'
              }`}
              onClick={handleToggleSearch}
              type="button"
            >
              <SearchIcon size={22} />
            </button>

            {/* Shopping Bag Button (Live counter & pop animation) */}
            {onOpenCart ? (
              <button
                aria-label={`View shopping bag (${cartCount} items)`}
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95 cursor-pointer"
                onClick={onOpenCart}
                type="button"
              >
                <ShoppingBagIcon size={22} />
                {cartCount > 0 && (
                  <span
                    className={`absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 font-label-sm text-[10px] font-bold font-mono tabular-nums leading-none text-white shadow-xs transition-transform ${
                      cartAnimate ? 'scale-125' : 'scale-100'
                    }`}
                  >
                    {cartCount}
                  </span>
                )}
              </button>
            ) : (
              <Link
                aria-label={`View shopping bag (${cartCount} items)`}
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95 cursor-pointer"
                href="/cart"
              >
                <ShoppingBagIcon size={22} />
                {cartCount > 0 && (
                  <span
                    className={`absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 font-label-sm text-[10px] font-bold font-mono tabular-nums leading-none text-white shadow-xs transition-transform ${
                      cartAnimate ? 'scale-125' : 'scale-100'
                    }`}
                  >
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>

        {/* Expandable Mobile Search Drawer Panel */}
        {isSearchOpen && (
          <div
            className="border-t border-border/40 bg-surface-container-lowest/98 px-4 pt-2.5 pb-4 backdrop-blur-2xl shadow-lg transition-opacity duration-200 animate-in fade-in slide-in-from-top-2"
            ref={searchContainerRef}
          >
            <form className="relative flex items-center gap-2" onSubmit={handleSearchSubmit}>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70">
                  <SearchIcon size={18} />
                </span>
                <input
                  aria-label="Search catalog products"
                  className="h-11 w-full rounded-xl bg-surface-container-low pl-10 pr-9 font-body-md text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search earrings, hair bows, bags..."
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                />
                {searchQuery && (
                  <button
                    aria-label="Clear search input"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface cursor-pointer"
                    onClick={() => setSearchQuery('')}
                    type="button"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>

              <button
                className="flex h-11 items-center justify-center rounded-xl bg-primary px-4 font-label-md text-xs font-semibold text-white shadow-xs transition-[background-color,transform] hover:bg-primary-hover active:scale-95 cursor-pointer"
                type="submit"
              >
                Search
              </button>

              <button
                aria-label="Close search panel"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer"
                onClick={() => setIsSearchOpen(false)}
                type="button"
              >
                <CloseIcon size={20} />
              </button>
            </form>

            {/* Quick Trending Searches & Badges */}
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <SparklesIcon className="text-primary" size={13} />
                <span className="font-label-sm text-[11px] font-semibold text-on-surface uppercase tracking-wider">
                  Trending in Dhaka:
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TRENDING_SEARCHES.map((item) => (
                  <button
                    className="group inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 font-label-sm text-[11px] text-on-surface transition-[background-color,color] hover:bg-primary-fixed hover:text-on-primary-fixed active:scale-95 cursor-pointer"
                    key={item.term}
                    onClick={() => handleSelectSuggestion(item.term)}
                    type="button"
                  >
                    <span>{item.term}</span>
                    <span className="text-[9px] opacity-60 font-normal">({item.category})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Dimmed backdrop when mobile search is open */}
      {isSearchOpen && (
        <div
          aria-hidden="true"
          className={cx(
            'fixed inset-0 top-[64px] z-30 bg-[#1E1B19]/35 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200',
            responsive && 'lg:hidden',
          )}
          onClick={() => setIsSearchOpen(false)}
        />
      )}
    </>
  );
}
