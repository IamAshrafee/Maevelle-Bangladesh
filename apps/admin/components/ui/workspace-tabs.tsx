'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NavIcon } from '@/components/navigation/nav-icons';
import type { NavIconKey } from '@/lib/navigation/route-registry';
import { ADMIN_MOTION, AdminLayoutGroup, motion } from '@/components/motion/motion-primitives';
import { cn } from '@/lib/utils';

export interface WorkspaceTabItem<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: NavIconKey;
  readonly count?: number | string;
  readonly disabled?: boolean;
  readonly overflow?: boolean;
}

export interface WorkspaceTabsProps<T extends string = string> {
  readonly items: readonly WorkspaceTabItem<T>[];
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly maxVisible?: number;
  readonly variant?: 'pill' | 'underline';
  readonly ariaLabel?: string;
  readonly className?: string;
}

/**
 * Distinct in-page tab navigation primitive (query params or local view state).
 * Separates intra-page views from Layer 2 `<ModuleNav>` multi-route navigation.
 */
export function WorkspaceTabs<T extends string = string>({
  items,
  value,
  onValueChange,
  maxVisible = 5,
  variant = 'pill',
  ariaLabel = 'Workspace views',
  className,
}: WorkspaceTabsProps<T>) {
  const limit = Math.max(1, maxVisible);
  const explicitPrimary = items.filter((item) => !item.overflow);
  const primaryItems = explicitPrimary.slice(0, limit);
  const overflowItems = [...explicitPrimary.slice(limit), ...items.filter((item) => item.overflow)];

  const activeOverflow = overflowItems.find((item) => item.value === value);
  const tabsId = React.useId();

  if (items.length === 0) return null;

  return (
    <AdminLayoutGroup id={tabsId}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'flex items-center gap-1.5 overflow-x-auto overscroll-x-contain no-scrollbar',
          variant === 'underline' ? 'border-b border-border pb-px' : 'py-0.5',
          className,
        )}
      >
        {primaryItems.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onValueChange(item.value)}
              className={cn(
                'relative z-0 inline-flex min-h-11 shrink-0 items-center gap-2 px-3.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap cursor-pointer disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                variant === 'underline'
                  ? cn(
                      'rounded-t-md',
                      active
                        ? 'text-primary-hover dark:text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground',
                    )
                  : cn(
                      'rounded-lg border',
                      active
                        ? 'border-transparent text-primary-hover dark:text-primary font-semibold'
                        : 'border-border/70 bg-card text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                    ),
              )}
            >
              {active && variant === 'underline' ? (
                <motion.span
                  layoutId="workspace-tab-underline"
                  transition={ADMIN_MOTION.spring}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                />
              ) : null}
              {active && variant !== 'underline' ? (
                <motion.span
                  layoutId="workspace-tab-pill"
                  transition={ADMIN_MOTION.spring}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 rounded-lg border border-primary/25 bg-primary-subtle"
                />
              ) : null}
              {item.icon ? <NavIcon name={item.icon} className="size-3.5 shrink-0" /> : null}
              <span>{item.label}</span>
              {item.count !== undefined ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] leading-none font-mono tabular-nums',
                    active
                      ? 'bg-primary/15 text-primary-hover dark:text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}

        {overflowItems.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeOverflow
                  ? 'border-primary/25 bg-primary-subtle text-primary-hover dark:text-primary font-semibold'
                  : 'border-border/70 bg-card text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              <span>{activeOverflow ? `More · ${activeOverflow.label}` : 'More'}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-75" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 p-1 bg-card border-border shadow-md">
              {overflowItems.map((item) => {
                const active = item.value === value;
                return (
                  <DropdownMenuItem
                    key={item.value}
                    disabled={item.disabled}
                    onClick={() => onValueChange(item.value)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs cursor-pointer',
                      active
                        ? 'bg-primary-subtle text-primary-hover dark:text-primary font-semibold'
                        : 'text-foreground',
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {item.icon ? (
                        <NavIcon name={item.icon} className="size-3.5 shrink-0" />
                      ) : null}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.count !== undefined ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                        {item.count}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </AdminLayoutGroup>
  );
}
