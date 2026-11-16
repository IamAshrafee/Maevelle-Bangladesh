'use client';

import { useEffect, useState } from 'react';
import { SectionAnchorNav } from '@/components/ui/section-anchor-nav';

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
  { id: 'recommendations', label: 'Recommendations', sectionId: 'section-recommendations' },
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
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
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
        rootMargin: '-128px 0px -40% 0px',
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

  const anchorSections = PRODUCT_CREATOR_SECTIONS.map((sec) => ({
    id: sec.sectionId,
    label: sec.label,
  }));
  const activeAnchorId =
    PRODUCT_CREATOR_SECTIONS.find((sec) => sec.id === activeSection)?.sectionId ??
    PRODUCT_CREATOR_SECTIONS[0]?.sectionId;

  return (
    <SectionAnchorNav
      sections={anchorSections}
      {...(activeAnchorId ? { activeId: activeAnchorId } : {})}
      onSelect={(sectionId) => {
        const match = PRODUCT_CREATOR_SECTIONS.find((sec) => sec.sectionId === sectionId);
        if (match) setActiveSection(match.id);
      }}
      ariaLabel="Product Sections Navigation"
      sticky={false}
    />
  );
}
