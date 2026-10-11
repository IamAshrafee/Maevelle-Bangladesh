'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SectionItem {
  readonly id: string;
  readonly label: string;
  readonly sectionId: string;
}

export const PRODUCT_CREATOR_SECTIONS: readonly SectionItem[] = [
  { id: 'overview', label: 'Overview', sectionId: 'section-overview' },
  { id: 'media', label: 'Media & Gallery', sectionId: 'section-media' },
  { id: 'pricing', label: 'Pricing', sectionId: 'section-pricing' },
  { id: 'variants', label: 'Variants & Stock', sectionId: 'section-variants' },
  { id: 'shipping', label: 'Shipping', sectionId: 'section-shipping' },
  { id: 'content', label: 'Customer Details', sectionId: 'section-content' },
  { id: 'seo', label: 'SEO & Search', sectionId: 'section-seo' },
  { id: 'merchandising', label: 'Organization', sectionId: 'section-merchandising' },
] as const;

export function SectionNavStrip() {
  const [activeSection, setActiveSection] = useState<string>('overview');

  useEffect(() => {
    const sectionElements = PRODUCT_CREATOR_SECTIONS.map((s) => ({
      id: s.id,
      el: document.getElementById(s.sectionId),
    })).filter((s): s is { id: string; el: HTMLElement } => s.el !== null);

    if (sectionElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find visible section with highest intersection ratio
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Sort descending by intersectionRatio
          visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          const topEntry = visible[0];
          if (!topEntry) return;
          const match = sectionElements.find((s) => s.el === topEntry.target);
          if (match) {
            setActiveSection(match.id);
          }
        }
      },
      {
        rootMargin: '-80px 0px -40% 0px',
        threshold: [0.1, 0.3, 0.6],
      },
    );

    for (const { el } of sectionElements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleNavClick = (sectionId: string, itemKey: string) => {
    setActiveSection(itemKey);
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL query parameter without full route reload
      const url = new URL(window.location.href);
      url.searchParams.set('section', itemKey);
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <nav
      aria-label="Product Sections Navigation"
      className="sticky top-[57px] z-10 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-8"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto py-2 scrollbar-none">
        {PRODUCT_CREATOR_SECTIONS.map((sec) => {
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => handleNavClick(sec.sectionId, sec.id)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {sec.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
