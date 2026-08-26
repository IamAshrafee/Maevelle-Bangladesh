'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';
import { useStorefrontContext } from './storefront-context';

interface Category {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  depth: number;
}
interface CartSummary {
  lines: readonly { quantity: string }[];
}

export function StorefrontHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { context } = useStorefrontContext();
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuParent, setMenuParent] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (!context) return;
    void fetch(`/api/storefront/v1/categories?organizationId=${context.organizationId}`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as ApiEnvelope<readonly Category[]>) : undefined,
      )
      .then((body) => body && setCategories(body.data));
  }, [context]);
  useEffect(() => {
    const refresh = () => {
      void fetch('/api/storefront/v1/carts/current', { credentials: 'include' }).then(
        async (response) => {
          if (!response.ok) return setCartCount(0);
          const cart = ((await response.json()) as ApiEnvelope<CartSummary>).data;
          setCartCount(cart.lines.reduce((sum, line) => sum + Number(line.quantity), 0));
        },
      );
    };
    refresh();
    window.addEventListener('maevelle:cart-changed', refresh);
    return () => window.removeEventListener('maevelle:cart-changed', refresh);
  }, [pathname]);
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setMenuParent(null);
  }, [pathname]);

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.parentId === menuParent),
    [categories, menuParent],
  );
  const currentParent = categories.find((category) => category.id === menuParent);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  }

  return (
    <>
      {context?.announcement ? <p className="announcement">{context.announcement}</p> : null}
      <header className="site-header">
        <div className="header-main">
          <button
            className="icon-button mobile-only"
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <Link className="brand" href="/" aria-label={`${context?.storeName ?? 'Maevelle'} home`}>
            {context?.storeName ?? 'Maevelle'}
          </Link>
          <nav className="desktop-navigation" aria-label="Primary navigation">
            {categories
              .filter((category) => category.depth === 0)
              .slice(0, 6)
              .map((category) => (
                <Link key={category.id} href={`/categories/${category.path}`}>
                  {category.name}
                </Link>
              ))}
            <Link href="/categories">Shop all</Link>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((value) => !value)}
            >
              <span aria-hidden="true">⌕</span>
            </button>
            <Link className="cart-link" href="/cart" aria-label={`Cart with ${cartCount} items`}>
              Bag <span>{cartCount}</span>
            </Link>
          </div>
        </div>
        {searchOpen ? (
          <form className="header-search" role="search" onSubmit={submitSearch}>
            <label htmlFor="site-search">Search products</label>
            <div>
              <input
                id="site-search"
                name="q"
                autoFocus
                type="search"
                placeholder="Search by product, style, or SKU"
              />
              <button type="submit">Search</button>
            </div>
          </form>
        ) : null}
      </header>
      {menuOpen ? (
        <div
          className="mobile-menu-backdrop"
          role="presentation"
          onMouseDown={() => setMenuOpen(false)}
        >
          <aside
            className="mobile-menu"
            aria-label="Mobile navigation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              {menuParent ? (
                <button
                  type="button"
                  onClick={() => setMenuParent(currentParent?.parentId ?? null)}
                >
                  ← Back
                </button>
              ) : (
                <strong>Shop</strong>
              )}
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                ✕
              </button>
            </header>
            {currentParent ? (
              <Link className="menu-current" href={`/categories/${currentParent.path}`}>
                Shop all {currentParent.name}
              </Link>
            ) : null}
            <nav aria-label={currentParent ? currentParent.name : 'Shop categories'}>
              {visibleCategories.map((category) => {
                const hasChildren = categories.some(
                  (candidate) => candidate.parentId === category.id,
                );
                return hasChildren ? (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setMenuParent(category.id)}
                  >
                    <span>{category.name}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <Link key={category.id} href={`/categories/${category.path}`}>
                    {category.name}
                  </Link>
                );
              })}
              <Link href="/search">Search the collection</Link>
              <Link href="/orders/track">Track an order</Link>
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="site-footer">
      <div>
        <div className="footer-brand">
          <strong>Maevelle</strong>
          <p>Considered fashion, authoritative pricing, and a secure checkout experience.</p>
        </div>
        <nav aria-label="Customer care">
          <strong>Customer care</strong>
          <Link href="/orders/track">Track your order</Link>
          <Link href="/policies/shipping">Shipping</Link>
          <Link href="/policies/returns">Returns</Link>
        </nav>
        <nav aria-label="Legal">
          <strong>Information</strong>
          <Link href="/policies/privacy">Privacy</Link>
          <Link href="/policies/terms">Terms</Link>
          <Link href="/reviews/submit">Write a review</Link>
        </nav>
      </div>
      <p className="footer-note">
        © {new Date().getFullYear()} Maevelle Bangladesh. Prices and availability are confirmed at
        checkout.
      </p>
    </footer>
  );
}
