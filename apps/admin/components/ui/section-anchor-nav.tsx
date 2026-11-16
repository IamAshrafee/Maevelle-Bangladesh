'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionAnchorItem {
  readonly id: string;
  readonly label: string;
  readonly badge?: string | number;
  readonly hasError?: boolean;
}

export interface SectionAnchorNavProps {
  readonly sections: readonly SectionAnchorItem[];
  readonly activeId?: string | undefined;
  readonly onSelect?: ((id: string) => void) | undefined;
  readonly ariaLabel?: string | undefined;
  readonly sticky?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Sticky form-section navigator positioned below the global Admin topbar.
 * Kept distinct from Layer 2 `<ModuleNav>` and view-level `<WorkspaceTabs>`.
 */
export function SectionAnchorNav({
  sections,
  activeId,
  onSelect,
  ariaLabel = 'Page sections',
  sticky = true,
  className,
}: SectionAnchorNavProps) {
  if (sections.length === 0) return null;

  const jumpTo = (id: string) => {
    onSelect?.(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav
      aria-label={ariaLabel}
      data-shell-chrome="true"
      className={cn(
        'border-b border-border px-4 md:px-6 lg:px-8 print:hidden',
        sticky
          ? 'sticky top-[var(--shell-topbar-h,3.5rem)] z-20 -mx-4 md:-mx-6 lg:-mx-8 bg-background/90 backdrop-blur-md'
          : 'bg-card/80',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain no-scrollbar py-2">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={active ? 'location' : undefined}
              onClick={() => jumpTo(section.id)}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary/25 bg-primary-subtle text-primary-hover dark:text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              <span>{section.label}</span>
              {section.badge !== undefined ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                  {section.badge}
                </span>
              ) : null}
              {section.hasError ? (
                <span
                  className="size-2 rounded-full bg-destructive shrink-0"
                  aria-label="Validation issue in section"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
