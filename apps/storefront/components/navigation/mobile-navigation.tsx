'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { StorefrontCategoryDto } from '@maevelle/contracts';

export function MobileNavigation({
  categories,
}: {
  readonly categories: readonly StorefrontCategoryDto[];
}) {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setParentId(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.parentId === parentId),
    [categories, parentId],
  );
  const currentParent = categories.find((category) => category.id === parentId);

  return (
    <>
      <button
        ref={triggerRef}
        className="icon-button mobile-only"
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      {open ? (
        <div
          className="mobile-menu-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <aside
            className="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              {parentId ? (
                <button type="button" onClick={() => setParentId(currentParent?.parentId ?? null)}>
                  ← Back
                </button>
              ) : (
                <strong>Shop</strong>
              )}
              <button
                autoFocus
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </header>
            {currentParent ? (
              <Link className="menu-current" href={`/categories/${currentParent.path}`}>
                Shop all {currentParent.name}
              </Link>
            ) : null}
            <nav aria-label={currentParent?.name ?? 'Shop categories'}>
              {visibleCategories.map((category) => {
                const hasChildren = categories.some(
                  (candidate) => candidate.parentId === category.id,
                );
                return hasChildren ? (
                  <button key={category.id} type="button" onClick={() => setParentId(category.id)}>
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
