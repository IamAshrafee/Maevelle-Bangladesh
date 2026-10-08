'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { StorefrontCategoryDto } from '@maevelle/contracts';
import { cx } from '@/components/ui/classnames';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CloseIcon,
  HeartIcon,
  SearchIcon,
  ShoppingBagIcon,
  TruckIcon,
} from '@/components/ui/icons';
import { useCartCount } from '@/features/cart/use-cart-count';
import { SEARCH_PLACEHOLDER } from './search-constants';
import { SearchDropdownPanel } from './search-dropdown-panel';
import { useRecentSearches } from './use-recent-searches';

export type DesktopNavbarProps = {
  cartCount?: number | undefined;
  categories?: readonly StorefrontCategoryDto[] | undefined;
  className?: string | undefined;
  onOpenCart?: (() => void) | undefined;
  responsive?: boolean | undefined;
  storeName?: string | undefined;
  wishlistCount?: number | undefined;
};

interface MegaMenuSection {
  curated: { name: string; path: string; count?: string }[];
  featured: {
    description: string;
    imageUrl: string;
    path: string;
    price: string;
    tag: string;
    title: string;
  };
  materials: { desc: string; name: string }[];
}

const MEGA_MENUS: Record<string, MegaMenuSection> = {
  'fine-jewelry': {
    curated: [
      { name: 'Freshwater Pearl Drops', path: '/categories/fine-jewelry/pearls', count: '14 pieces' },
      { name: '18K Micro-Gold Vermeil', path: '/categories/fine-jewelry/gold-vermeil', count: '18 pieces' },
      { name: 'Handcrafted Filigree Earrings', path: '/categories/fine-jewelry/earrings', count: '22 pieces' },
      { name: 'Kundan Heritage Chokers', path: '/categories/fine-jewelry/kundan', count: '8 pieces' },
      { name: 'Polki & Semiprecious Bangles', path: '/categories/fine-jewelry/bangles', count: '12 pieces' },
    ],
    materials: [
      { name: 'Freshwater Pearls', desc: 'Sourced from artisanal pearl farms with natural luster' },
      { name: 'Gold Vermeil', desc: '18K thick gold plating over 925 sterling silver' },
      { name: 'Natural Gemstones', desc: 'Emeralds, tourmalines, and rose quartz accents' },
    ],
    featured: {
      title: 'Aurelia Pearl Drop Earrings',
      tag: 'Atelier Spotlight',
      description: 'Hand-strung baroque pearls framed in 18k sculpted gold wire.',
      price: '৳1,650',
      path: '/categories/fine-jewelry',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAU8kN5Vdd-XFeUvL46CjxHeMIuqVlvOhzkxBeqEZbQrpiAvJAiT-7KIfOiRtN8aHnlzi4hl7xu93DUKF1LuLzY7_QV3v_7C9HV326W7qStkQMjNbSV9416GdaPdUvNT05egHsMOPWx_l2v_-w_bwM1u73AHYoiOqof4dI9HA21x3AGn1cFuS-IR6lPC7KsnlSwjexBjU1nzxRYx9mekEi6tr1w1Gj7NRsuBBgaH2bJjAiRGixv7mxx',
    },
  },
  'silk-scarves': {
    curated: [
      { name: 'Mulberry Silk Stoles', path: '/categories/silk-scarves/mulberry', count: '9 pieces' },
      { name: 'Botanical Heritage Prints', path: '/categories/silk-scarves/botanical', count: '15 pieces' },
      { name: 'Hand-rolled Silk Squares', path: '/categories/silk-scarves/squares', count: '11 pieces' },
      { name: 'Evening Chiffon Wraps', path: '/categories/silk-scarves/chiffon', count: '7 pieces' },
    ],
    materials: [
      { name: 'Pure Mulberry Silk', desc: '100% grade 6A mulberry silk weave, hand-finished' },
      { name: 'Artisanal Block Prints', desc: 'Natural organic dyes crafted in South Asian ateliers' },
    ],
    featured: {
      title: 'Monsoon Garden Silk Scarf',
      tag: 'New Season',
      description: 'Fluid mulberry silk with hand-painted lotus foliage and rolled edges.',
      price: '৳2,450',
      path: '/categories/silk-scarves',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC57r3CLXUvSZDBeSKxpeW7zHa4TrFki3NN8CLIcNCvq3b0x3BgofZM0zdNua_l8jL5nikW5IvXlgQEapXPagGkR7P3N-42uqSvANLP4zOsySIjt0LqFD-QyzC9kv_zUS_Q1kLJx_KqQ1Vtma1HqZVoxE8BNuFF2WBZDzQWGDBYsYv26QNi8khn29i6w-Me5_-376wN8A3ehSUNcdGYyVnQWNxyLKrloWk_OQw1kcZz0XKVo9NZhIXn',
    },
  },
  handbags: {
    curated: [
      { name: 'Travertine Mini Bags', path: '/categories/handbags/mini', count: '6 pieces' },
      { name: 'Micro-Quilted Crossbody', path: '/categories/handbags/crossbody', count: '10 pieces' },
      { name: 'Embroidered Silk Potlis', path: '/categories/handbags/potli', count: '8 pieces' },
      { name: 'Structured Atelier Totes', path: '/categories/handbags/totes', count: '5 pieces' },
    ],
    materials: [
      { name: 'Vegan Luxe Leather', desc: 'Buttery texture with reinforced artisanal edges' },
      { name: 'Brushed Brass Hardware', desc: 'Tarnish-resistant custom gold buckles & chains' },
    ],
    featured: {
      title: 'Quilted Mini Crossbody Bag',
      tag: 'Patron Favorite',
      description: 'Micro-quilted ivory body with heavy brushed gold link chain.',
      price: '৳2,950',
      path: '/categories/handbags',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCKDdqIq5xEjf8-Raz-z8QW3zWVqKUn8q1bPrUHU0cf0vBKxUbpZ8CKbgROqGCCSjIGdMKTetBhJlkCcJ-z7kqCszcVS5Jas5QgbWR0yaFm9OYtj90J-e2p-LBF2kTnHHWRtF7Sm5XYIf69OvXyoSqfynxtS5Ai9DvAR27mA9uPZPLhSQHf67UoXYCF4Itwie61r_8E0WQPj5lnqrYESoDQGVXDGMF09CoKZvWqxWqynAoiV9E2DNV2',
    },
  },
  'hair-accents': {
    curated: [
      { name: 'Plush Velvet Bows', path: '/categories/hair-accents/velvet-bows', count: '8 pieces' },
      { name: 'Freshwater Pearl Barrettes', path: '/categories/hair-accents/pearl-clips', count: '12 pieces' },
      { name: 'Mulberry Silk Scrunchies', path: '/categories/hair-accents/scrunchies', count: '16 pieces' },
      { name: 'Gold Filigree Hairpins', path: '/categories/hair-accents/pins', count: '7 pieces' },
    ],
    materials: [
      { name: 'Crimson Silk Velvet', desc: 'High-pile cotton velvet with deep berry luster' },
      { name: 'French Barrettes Clasp', desc: 'Gentle, snag-free grip for delicate hair' },
    ],
    featured: {
      title: 'Plush Velvet Hair Ribbon',
      tag: 'Editorial Pick',
      description: 'Deep crimson oversized hair ribbon tied on wavy dark locks.',
      price: '৳850',
      path: '/categories/hair-accents',
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC57r3CLXUvSZDBeSKxpeW7zHa4TrFki3NN8CLIcNCvq3b0x3BgofZM0zdNua_l8jL5nikW5IvXlgQEapXPagGkR7P3N-42uqSvANLP4zOsySIjt0LqFD-QyzC9kv_zUS_Q1kLJx_KqQ1Vtma1HqZVoxE8BNuFF2WBZDzQWGDBYsYv26QNi8khn29i6w-Me5_-376wN8A3ehSUNcdGYyVnQWNxyLKrloWk_OQw1kcZz0XKVo9NZhIXn',
    },
  },
};

const SEARCH_SUGGESTIONS = [
  'Freshwater Pearl Drop Earrings',
  'Plush Velvet Ribbon',
  'Quilted Crossbody Bag',
  'Mulberry Silk Scarf',
  '18K Gold Vermeil',
];

export function DesktopNavbar({
  cartCount: initialCartCount,
  className,
  onOpenCart,
  responsive = true,
  storeName = 'Maevelle',
  wishlistCount = 5,
}: DesktopNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const liveCount = useCartCount(initialCartCount ?? 0);
  const cartCount = initialCartCount !== undefined ? initialCartCount : liveCount;

  const { addRecentSearch } = useRecentSearches();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Global keyboard shortcut: Cmd+K / Ctrl+K / '/' focuses search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea';

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if (e.key === 'Escape') {
        setActiveMenu(null);
        setIsSearchFocused(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menus/search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnterMenu = (menuId: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setActiveMenu(menuId);
  };

  const handleMouseLeaveMenu = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 180);
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      addRecentSearch(query);
      router.push(`/search?q=${encodeURIComponent(query)}`);
      setIsSearchFocused(false);
    }
  };

  const handleSelectSearchSuggestion = (term: string) => {
    addRecentSearch(term);
    setSearchQuery(term);
    router.push(`/search?q=${encodeURIComponent(term)}`);
    setIsSearchFocused(false);
  };

  const menuItems = [
    { id: 'fine-jewelry', label: 'Fine Jewelry', path: '/categories/fine-jewelry', hasDropdown: true },
    { id: 'silk-scarves', label: 'Silk Scarves', path: '/categories/silk-scarves', hasDropdown: true },
    { id: 'handbags', label: 'Handbags & Clutches', path: '/categories/handbags', hasDropdown: true },
    { id: 'hair-accents', label: 'Hair Accents', path: '/categories/hair-accents', hasDropdown: true },
    { id: 'new-arrivals', label: 'New Arrivals', path: '/categories/new-arrivals', isNew: true },
    { id: 'atelier-drops', label: 'Atelier Drops', path: '/categories/atelier', badge: 'Curated' },
    { id: 'all', label: 'Shop All', path: '/categories' },
  ];

  return (
    <>
      <header
        className={cx(
          'sticky top-0 z-40 w-full transition-[background-color,border-color,box-shadow] duration-200',
          isScrolled
            ? 'bg-surface/98 backdrop-blur-2xl border-b border-border/80 shadow-[0_4px_20px_rgba(158,42,75,0.06)]'
            : 'bg-surface/92 backdrop-blur-xl border-b border-border/40 shadow-[0_1px_8px_rgba(158,42,75,0.03)]',
          responsive && 'hidden lg:block',
          className,
        )}
      >
        {/* ROW 1: PRIMARY BRAND & UTILITIES (Generous luxury height: 76px) */}
        <div className="border-b border-border/30">
          <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-8 px-6 lg:px-8">
            {/* Brand Logo (Left) */}
            <Link
              aria-label={`${storeName} Home`}
              className="group flex flex-col select-none shrink-0 cursor-pointer"
              href="/"
            >
              <span className="font-serif text-[30px] font-semibold leading-none tracking-[-0.02em] text-primary transition-colors group-hover:text-primary-hover">
                {storeName}
              </span>
              <span className="font-label-sm text-[9.5px] font-medium tracking-[0.3em] text-on-surface-variant/80 uppercase mt-1">
                Dhaka • Atelier
              </span>
            </Link>

            {/* Prominent Search Bar (Center) with Live Dropdown & Backdrop */}
            <div className="relative flex-1 max-w-xl z-40" ref={searchBoxRef}>
              <form className="relative w-full" onSubmit={handleSearchSubmit}>
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/70 transition-colors">
                  <SearchIcon size={18} />
                </span>
                <input
                  aria-label="Search catalog products"
                  className="h-11 w-full rounded-full border border-border/60 bg-surface-container-low/80 pl-11 pr-28 font-body-md text-sm text-on-surface placeholder:text-on-surface-variant/60 shadow-2xs transition-[background-color,border-color,box-shadow] focus:border-primary/40 focus:bg-surface-container-lowest focus:ring-3 focus:ring-primary/10 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                  onBlur={() => {
                    // Delay slightly to let click events inside dropdown register
                    setTimeout(() => setIsSearchFocused(false), 200);
                  }}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  placeholder={SEARCH_PLACEHOLDER}
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {searchQuery && (
                    <button
                      aria-label="Clear search query"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-90 transition-all duration-150 cursor-pointer mr-0.5 animate-in zoom-in-75 fade-in-0"
                      onClick={() => {
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      type="button"
                    >
                      <CloseIcon size={13} />
                    </button>
                  )}
                  <kbd className="hidden sm:inline-block rounded bg-surface-container px-1.5 py-0.5 font-mono text-[10px] font-semibold text-on-surface-variant/70 border border-border/40 select-none">
                    ⌘K
                  </kbd>
                  <button
                    aria-label="Submit search"
                    className="flex h-7 items-center justify-center rounded-full bg-primary px-3 text-[11px] font-semibold text-white transition-[background-color,transform] hover:bg-primary-hover active:scale-95 cursor-pointer shadow-xs"
                    type="submit"
                  >
                    Search
                  </button>
                </div>
              </form>

              {/* Floating Quick Search Suggestions Panel */}
              {isSearchFocused && (
                <div className="absolute left-0 right-0 top-full mt-2.5 z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
                  <SearchDropdownPanel
                    onClose={() => setIsSearchFocused(false)}
                    onSelectTerm={handleSelectSearchSuggestion}
                    query={searchQuery}
                  />
                </div>
              )}
            </div>

            {/* Dimmed backdrop when desktop search is focused */}
            {isSearchFocused && (
              <div
                aria-hidden="true"
                className="fixed inset-0 top-[112px] z-30 bg-[#1E1B19]/35 backdrop-blur-2xs transition-opacity duration-200 animate-in fade-in"
                onClick={() => setIsSearchFocused(false)}
              />
            )}

            {/* Right Action Utilities (Badged Icons & Cart) */}
            <div className="flex items-center gap-4 shrink-0">

              {/* Favorite / Wishlist Button with Badge */}
              <Link
                aria-label={`View Wishlist (${wishlistCount} items)`}
                className="group relative flex items-center gap-2 rounded-xl px-3 py-2 text-on-surface transition-[background-color,color] hover:bg-surface-container-low hover:text-primary cursor-pointer select-none"
                href="/wishlist"
              >
                <div className="relative">
                  <HeartIcon className="transition-transform group-hover:scale-105" size={20} />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-secondary-fixed px-1 font-label-sm text-[10px] font-bold font-mono tabular-nums text-on-secondary-fixed shadow-xs">
                      {wishlistCount}
                    </span>
                  )}
                </div>
                <span className="font-label-md text-xs font-semibold">Wishlist</span>
              </Link>

              {/* Shopping Bag Button with Badge */}
              {onOpenCart ? (
                <button
                  aria-label={`View shopping bag (${cartCount} items)`}
                  className="group relative flex items-center gap-2 rounded-xl bg-surface-container-low px-3.5 py-2 text-on-surface transition-[background-color,color] hover:bg-surface-container hover:text-primary active:scale-98 cursor-pointer select-none"
                  onClick={onOpenCart}
                  type="button"
                >
                  <div className="relative">
                    <ShoppingBagIcon className="text-primary transition-transform group-hover:scale-105" size={20} />
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 font-label-sm text-[10px] font-bold font-mono tabular-nums text-white shadow-xs">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span className="font-label-md text-xs font-semibold">Bag</span>
                </button>
              ) : (
                <Link
                  aria-label={`View shopping bag (${cartCount} items)`}
                  className="group relative flex items-center gap-2 rounded-xl bg-surface-container-low px-3.5 py-2 text-on-surface transition-[background-color,color] hover:bg-surface-container hover:text-primary active:scale-98 cursor-pointer select-none"
                  href="/cart"
                >
                  <div className="relative">
                    <ShoppingBagIcon className="text-primary transition-transform group-hover:scale-105" size={20} />
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 font-label-sm text-[10px] font-bold font-mono tabular-nums text-white shadow-xs">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span className="font-label-md text-xs font-semibold">Bag</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: CATEGORY NAVIGATION & INTERACTIVE MEGA-MENU (Height: 48px) */}
        <div className="relative bg-surface/90" ref={menuContainerRef}>
          <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-6 lg:px-8">
            {/* Category Navigation Links */}
            <nav aria-label="Store categories" className="flex items-center gap-1 sm:gap-2">
              {menuItems.map((item) => {
                const isOpen = activeMenu === item.id;
                const isCurrent = pathname === item.path || pathname.startsWith(`${item.path}/`);
                const hasDropdown = item.hasDropdown && Boolean(MEGA_MENUS[item.id]);

                return (
                  <div
                    className="relative"
                    key={item.id}
                    onMouseEnter={() => hasDropdown && handleMouseEnterMenu(item.id)}
                    onMouseLeave={handleMouseLeaveMenu}
                  >
                    <Link
                      aria-expanded={isOpen}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-label-md text-[13px] font-medium transition-[background-color,color] ${
                        isOpen
                          ? 'bg-primary-fixed/25 text-primary font-semibold'
                          : isCurrent
                          ? 'text-primary font-semibold'
                          : 'text-on-surface hover:text-primary hover:bg-surface-container-low'
                      }`}
                      href={item.path}
                      onClick={() => setActiveMenu((prev) => (prev === item.id ? null : item.id))}
                    >
                      <span>{item.label}</span>

                      {item.isNew && (
                        <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      )}

                      {item.badge && (
                        <span className="rounded-full bg-primary-fixed px-1.5 py-0.2 font-label-sm text-[9px] font-bold uppercase text-on-primary-fixed">
                          {item.badge}
                        </span>
                      )}

                      {hasDropdown && (
                        <ChevronDownIcon
                          className={`text-on-surface-variant transition-transform duration-150 ${
                            isOpen ? 'rotate-180 text-primary' : ''
                          }`}
                          size={14}
                        />
                      )}
                    </Link>
                  </div>
                );
              })}
            </nav>

            {/* Right Utility Buttons (Track Order & Explore Vault) */}
            <div className="flex items-center gap-4">
              <Link
                className="flex items-center gap-1.5 font-label-md text-xs font-medium text-on-surface-variant hover:text-primary transition-colors"
                href="/orders/track"
              >
                <TruckIcon size={15} />
                <span>Track Order</span>
              </Link>

              <span className="h-3 w-px bg-border/60" />

              <Link
                className="group flex items-center gap-1 font-label-md text-xs font-semibold text-primary hover:underline transition-colors"
                href="/categories"
              >
                <span>Explore Vault</span>
                <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" size={13} />
              </Link>
            </div>
          </div>

          {/* EXPANDABLE LUXURY MEGA-MENU PANEL */}
          {activeMenu && MEGA_MENUS[activeMenu] && (
            <div
              className="absolute left-0 right-0 top-full z-50 border-b border-border/60 bg-surface-container-lowest/98 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-1 duration-150"
              onMouseEnter={() => handleMouseEnterMenu(activeMenu)}
              onMouseLeave={handleMouseLeaveMenu}
            >
              <div className="mx-auto grid max-w-7xl grid-cols-12 gap-8 px-8 py-7">
                {/* Column 1: Curated Subcategories */}
                <div className="col-span-4 space-y-3">
                  <span className="block font-label-sm text-[11px] font-bold uppercase tracking-wider text-primary">
                    Curated Categories
                  </span>
                  <ul className="space-y-1.5">
                    {MEGA_MENUS[activeMenu].curated.map((sub) => (
                      <li key={sub.path}>
                        <Link
                          className="group flex items-center justify-between rounded-lg px-2.5 py-2 text-body-md text-sm text-on-surface transition-colors hover:bg-surface-container-low hover:text-primary"
                          href={sub.path}
                          onClick={() => setActiveMenu(null)}
                        >
                          <span className="font-medium group-hover:translate-x-0.5 transition-transform">
                            {sub.name}
                          </span>
                          {sub.count && (
                            <span className="font-label-sm text-[11px] text-on-surface-variant">
                              {sub.count}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Column 2: Material & Craft Details */}
                <div className="col-span-4 space-y-3 border-l border-border/40 pl-6">
                  <span className="block font-label-sm text-[11px] font-bold uppercase tracking-wider text-on-surface">
                    Heritage Craft &amp; Tones
                  </span>
                  <div className="space-y-3">
                    {MEGA_MENUS[activeMenu].materials.map((mat) => (
                      <div
                        className="rounded-xl bg-surface-container-low/60 p-3 transition-colors hover:bg-surface-container-low"
                        key={mat.name}
                      >
                        <span className="block font-label-md text-xs font-semibold text-on-surface">
                          {mat.name}
                        </span>
                        <span className="mt-0.5 block text-body-sm text-[11px] text-on-surface-variant">
                          {mat.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column 3: Featured Editorial Spotlight Card */}
                <div className="col-span-4 border-l border-border/40 pl-6">
                  <span className="mb-3 block font-label-sm text-[11px] font-bold uppercase tracking-wider text-primary">
                    {MEGA_MENUS[activeMenu].featured.tag}
                  </span>
                  <Link
                    className="group block overflow-hidden rounded-2xl bg-surface-container-low p-3 transition-[box-shadow,transform] hover:shadow-md active:scale-98"
                    href={MEGA_MENUS[activeMenu].featured.path}
                    onClick={() => setActiveMenu(null)}
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-surface-container">
                      <img
                        alt={MEGA_MENUS[activeMenu].featured.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        src={MEGA_MENUS[activeMenu].featured.imageUrl}
                      />
                    </div>
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between">
                        <h4 className="font-headline-sm text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
                          {MEGA_MENUS[activeMenu].featured.title}
                        </h4>
                        <span className="font-price-md text-sm font-bold font-mono text-primary">
                          {MEGA_MENUS[activeMenu].featured.price}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-body-sm text-xs text-on-surface-variant">
                        {MEGA_MENUS[activeMenu].featured.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1 font-label-sm text-xs font-semibold text-primary">
                        <span>Explore Collection</span>
                        <ArrowRightIcon size={13} />
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Dimmed Backdrop Scrim when Mega Menu is Open */}
      {activeMenu && (
        <div
          aria-hidden="true"
          className="fixed inset-0 top-[124px] z-30 bg-[#1E1B19]/20 backdrop-blur-2xs transition-opacity duration-200 hidden lg:block"
          onClick={() => setActiveMenu(null)}
        />
      )}
    </>
  );
}
