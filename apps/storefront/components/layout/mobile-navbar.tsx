'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { cx } from '@/components/ui/classnames';
import { CloseIcon, SearchIcon, ShoppingBagIcon } from '@/components/ui/icons';
import { useCartCount } from '@/features/cart/use-cart-count';
import { SEARCH_PLACEHOLDER } from './search-constants';
import { SearchDropdownPanel } from './search-dropdown-panel';
import { useRecentSearches } from './use-recent-searches';

export type MobileNavbarProps = {
  cartCount?: number | undefined;
  className?: string | undefined;
  onOpenCart?: (() => void) | undefined;
  responsive?: boolean | undefined;
  storeName?: string | undefined;
};

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

  const { addRecentSearch } = useRecentSearches();

  if (pathname?.startsWith('/checkout')) {
    return null;
  }

  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isTabletSearchFocused, setIsTabletSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [cartAnimate, setCartAnimate] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabletSearchInputRef = useRef<HTMLInputElement>(null);
  const tabletSearchBoxRef = useRef<HTMLDivElement>(null);

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

  // Keyboard navigation: Cmd+K / Ctrl+K opens search, Escape closes search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea';

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // If on tablet screen, focus tablet input; if on mobile phone, open drawer
        if (window.innerWidth >= 640) {
          tabletSearchInputRef.current?.focus();
          setIsTabletSearchFocused(true);
        } else {
          setIsMobileSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 120);
        }
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        if (window.innerWidth >= 640) {
          tabletSearchInputRef.current?.focus();
          setIsTabletSearchFocused(true);
        } else {
          setIsMobileSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 120);
        }
      } else if (e.key === 'Escape') {
        setIsMobileSearchOpen(false);
        setIsTabletSearchFocused(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close tablet dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tabletSearchBoxRef.current && !tabletSearchBoxRef.current.contains(e.target as Node)) {
        setIsTabletSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleSearch = () => {
    setIsMobileSearchOpen((prev) => {
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
      addRecentSearch(query);
      router.push(`/search?q=${encodeURIComponent(query)}`);
      setIsMobileSearchOpen(false);
      setIsTabletSearchFocused(false);
    }
  };

  const handleSelectSuggestion = (term: string) => {
    addRecentSearch(term);
    setSearchQuery(term);
    router.push(`/search?q=${encodeURIComponent(term)}`);
    setIsMobileSearchOpen(false);
    setIsTabletSearchFocused(false);
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
              Bangladesh
            </span>
          </Link>

          {/* Tablet Inline Search Bar (Visible on sm to lg) */}
          <div
            className="relative hidden sm:flex flex-1 max-w-xs md:max-w-md mx-4 z-40"
            ref={tabletSearchBoxRef}
          >
            <form className="relative w-full" onSubmit={handleSearchSubmit}>
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70">
                <SearchIcon size={16} />
              </span>
              <input
                aria-label="Search catalog"
                className="h-10 w-full rounded-full border border-border/60 bg-surface-container-low/70 pl-9 pr-24 font-body-md text-xs text-on-surface placeholder:text-on-surface-variant/60 shadow-2xs transition-[background-color,border-color,box-shadow] focus:border-primary/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/10 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                onBlur={() => {
                  setTimeout(() => setIsTabletSearchFocused(false), 200);
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsTabletSearchFocused(true)}
                placeholder={SEARCH_PLACEHOLDER}
                ref={tabletSearchInputRef}
                type="search"
                value={searchQuery}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    aria-label="Clear search input"
                    className="flex h-5 w-5 items-center justify-center rounded-full text-on-surface-variant hover:text-primary active:scale-90 transition-all cursor-pointer mr-0.5 animate-in zoom-in-75 fade-in-0"
                    onClick={() => {
                      setSearchQuery('');
                      tabletSearchInputRef.current?.focus();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    type="button"
                  >
                    <CloseIcon size={12} />
                  </button>
                )}
                <kbd className="rounded bg-surface-container px-1 py-0.5 font-mono text-[9px] font-semibold text-on-surface-variant/70 border border-border/40 select-none">
                  ⌘K
                </kbd>
                <button
                  aria-label="Submit search"
                  className="flex h-6 items-center justify-center rounded-full bg-primary px-2.5 text-[10px] font-semibold text-white transition-[background-color,transform] hover:bg-primary-hover active:scale-95 cursor-pointer shadow-xs"
                  type="submit"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Floating Tablet Dropdown */}
            {isTabletSearchFocused && (
              <div className="absolute left-0 right-0 top-full mt-2 z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
                <SearchDropdownPanel
                  onClose={() => setIsTabletSearchFocused(false)}
                  onSelectTerm={handleSelectSuggestion}
                  query={searchQuery}
                />
              </div>
            )}
          </div>

          {/* Header Actions: Search & Shopping Bag (Right) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search Toggle Button (Mobile phones only; tablet has inline input) */}
            <button
              aria-expanded={isMobileSearchOpen}
              aria-label="Search catalog"
              className={`flex sm:hidden h-11 w-11 items-center justify-center rounded-full transition-colors cursor-pointer active:scale-95 ${
                isMobileSearchOpen
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

        {/* Expandable Mobile Search Drawer Panel (Mobile phones only) */}
        {isMobileSearchOpen && (
          <div className="border-t border-border/40 bg-surface-container-lowest/98 px-4 pt-3 pb-4 backdrop-blur-2xl shadow-lg transition-opacity duration-200 animate-in fade-in-0 slide-in-from-top-3 sm:hidden">
            <form className="relative flex items-center gap-2" onSubmit={handleSearchSubmit}>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70">
                  <SearchIcon size={18} />
                </span>
                <input
                  aria-label="Search catalog products"
                  className="h-11 w-full rounded-xl bg-surface-container-low pl-10 pr-9 font-body-md text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={SEARCH_PLACEHOLDER}
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                />
                {searchQuery && (
                  <button
                    aria-label="Clear search input"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:text-primary active:scale-90 transition-all duration-150 cursor-pointer animate-in zoom-in-75 fade-in-0"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:scale-90 transition-all duration-150 cursor-pointer"
                onClick={() => setIsMobileSearchOpen(false)}
                type="button"
              >
                <CloseIcon size={20} />
              </button>
            </form>

            <div className="mt-3">
              <SearchDropdownPanel
                isMobile
                onClose={() => setIsMobileSearchOpen(false)}
                onSelectTerm={handleSelectSuggestion}
                query={searchQuery}
              />
            </div>
          </div>
        )}
      </header>

      {/* Dimmed backdrop when mobile or tablet search is active */}
      {(isMobileSearchOpen || isTabletSearchFocused) && (
        <div
          aria-hidden="true"
          className={cx(
            'fixed inset-0 top-[64px] z-30 bg-[#1E1B19]/35 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200',
            responsive && 'lg:hidden',
          )}
          onClick={() => {
            setIsMobileSearchOpen(false);
            setIsTabletSearchFocused(false);
          }}
        />
      )}
    </>
  );
}
