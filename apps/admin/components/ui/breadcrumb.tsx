'use client';

/**
 * Breadcrumb — production-grade navigation component.
 *
 * Architecture:
 *   Breadcrumb                  – root <nav> wrapper + context provider
 *   Breadcrumb.List             – <ol> list
 *   Breadcrumb.Item             – <li> item
 *   Breadcrumb.Link             – navigable crumb (renders Next.js Link or <a>)
 *   Breadcrumb.Current          – current-page crumb (aria-current="page", not a link)
 *   Breadcrumb.Separator        – visual separator (aria-hidden)
 *   Breadcrumb.Ellipsis         – collapsed-items trigger with overflow dropdown
 *   Breadcrumb.Skeleton         – loading placeholder
 *
 * Convenience: the <Breadcrumb items={[...]} /> data-driven API auto-assembles
 * the structure, handles overflow/collapse, and renders the overflow dropdown.
 */

import Link from 'next/link';
import * as React from 'react';
import { ChevronRight, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type BreadcrumbSize = 'sm' | 'md' | 'lg';

type BreadcrumbContextValue = {
  size: BreadcrumbSize;
  separator: React.ReactNode;
  showIcons: boolean;
};

const BreadcrumbContext = React.createContext<BreadcrumbContextValue>({
  size: 'md',
  separator: <ChevronRight aria-hidden="true" />,
  showIcons: true,
});

function useBreadcrumbContext() {
  return React.useContext(BreadcrumbContext);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BreadcrumbItemDef = {
  label: string;
  href?: string;
  icon?: LucideIcon;
  current?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

type HiddenItem = { label: string; href?: string; onClick?: () => void };

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const breadcrumbListVariants = cva('flex flex-wrap items-center gap-0.5 min-w-0', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-xs font-medium',
      lg: 'text-sm font-medium',
    },
  },
  defaultVariants: { size: 'md' },
});

const breadcrumbLinkVariants = cva(
  'inline-flex items-center gap-1 rounded transition-colors outline-none text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  {
    variants: {
      size: {
        sm: 'h-5 px-1',
        md: 'h-5 px-1',
        lg: 'h-6 px-1',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

const breadcrumbCurrentVariants = cva(
  'inline-flex items-center gap-1 rounded text-foreground font-semibold truncate',
  {
    variants: {
      size: {
        sm: 'h-5 px-1',
        md: 'h-5 px-1',
        lg: 'h-6 px-1',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

const breadcrumbSeparatorVariants = cva(
  'shrink-0 text-muted-foreground/60 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      size: {
        sm: '[&_svg]:size-3',
        md: '[&_svg]:size-3',
        lg: '[&_svg]:size-3.5',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

// ---------------------------------------------------------------------------
// Breadcrumb.List
// ---------------------------------------------------------------------------

function BreadcrumbList({
  className,
  size,
  ...props
}: React.ComponentProps<'ol'> & { size?: BreadcrumbSize }) {
  const ctx = useBreadcrumbContext();
  const resolvedSize = size ?? ctx.size;
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(breadcrumbListVariants({ size: resolvedSize }), className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb.Item
// ---------------------------------------------------------------------------

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn('inline-flex items-center gap-0.5 shrink-0', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb.Link
// ---------------------------------------------------------------------------

type BreadcrumbLinkProps = Omit<React.ComponentProps<'a'>, 'href'> & {
  href?: string;
  as?: React.ElementType<any>;
  disabled?: boolean;
  maxLabelWidth?: string;
};

function BreadcrumbLink({
  className,
  href,
  as,
  disabled,
  maxLabelWidth,
  children,
  onClick,
  ...props
}: BreadcrumbLinkProps) {
  const { size } = useBreadcrumbContext();
  const Component = as ?? (href && !disabled ? Link : 'span');

  const inner =
    maxLabelWidth ? (
      <span
        className="truncate"
        style={{ maxWidth: maxLabelWidth }}
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </span>
    ) : (
      children
    );

  return (
    <Component
      data-slot="breadcrumb-link"
      {...(href !== undefined && !disabled ? { href } : {})}
      tabIndex={disabled ? -1 : undefined}
      aria-disabled={disabled || undefined}
      className={cn(breadcrumbLinkVariants({ size }), className)}
      onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : onClick}
      {...props}
    >
      {inner}
    </Component>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb.Current
// ---------------------------------------------------------------------------

type BreadcrumbCurrentProps = React.ComponentProps<'span'> & {
  maxLabelWidth?: string;
};

function BreadcrumbCurrent({
  className,
  maxLabelWidth,
  children,
  ...props
}: BreadcrumbCurrentProps) {
  const { size } = useBreadcrumbContext();

  const inner =
    maxLabelWidth ? (
      <span
        className="truncate"
        style={{ maxWidth: maxLabelWidth }}
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </span>
    ) : (
      children
    );

  return (
    <span
      data-slot="breadcrumb-current"
      aria-current="page"
      className={cn(breadcrumbCurrentVariants({ size }), className)}
      {...props}
    >
      {inner}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb.Separator
// ---------------------------------------------------------------------------

function BreadcrumbSeparator({
  className,
  children,
  ...props
}: React.ComponentProps<'span'>) {
  const { size, separator } = useBreadcrumbContext();
  return (
    <span
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn(breadcrumbSeparatorVariants({ size }), className)}
      {...props}
    >
      {children ?? separator}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb.Skeleton
// ---------------------------------------------------------------------------

function BreadcrumbSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      data-slot="breadcrumb-skeleton"
      className="flex items-center gap-1.5"
      aria-busy="true"
      aria-label="Loading navigation"
    >
      {Array.from({ length: count }, (_, i) => (
        <React.Fragment key={i}>
          <span
            className={cn(
              'h-3 animate-pulse rounded bg-muted-foreground/20',
              i === 0 ? 'w-10' : i === count - 1 ? 'w-20' : 'w-14',
            )}
          />
          {i < count - 1 && (
            <span className="h-3 w-2 animate-pulse rounded bg-muted-foreground/10" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb.Ellipsis — overflow trigger + accessible dropdown
// ---------------------------------------------------------------------------

function BreadcrumbEllipsis({
  hiddenItems,
  className,
}: {
  hiddenItems: HiddenItem[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const { size } = useBreadcrumbContext();

  React.useEffect(() => {
    if (open && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [open]);

  const iconSize = size === 'lg' ? 'size-3.5' : 'size-3';

  // Close on outside click or Escape
  React.useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (
        e instanceof MouseEvent &&
        !triggerRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handle);
    };
  }, [open]);

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const active = document.activeElement as HTMLElement;
    const idx = Array.from(items).indexOf(active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        data-slot="breadcrumb-ellipsis"
        aria-label={open ? 'Collapse navigation' : 'Show hidden navigation items'}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center justify-center rounded text-muted-foreground',
          'hover:bg-muted hover:text-foreground transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 outline-none',
          size === 'lg' ? 'h-6 w-6' : 'h-5 w-5',
        )}
      >
        <MoreHorizontal className={iconSize} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Hidden breadcrumb items"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            'absolute start-0 top-full z-50 mt-1 min-w-32 origin-top-left',
            'rounded-lg border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10',
            'py-1',
          )}
        >
          {hiddenItems.map((item, i) => {
            const isLink = Boolean(item.href);
            if (isLink) {
              return (
                <Link
                  key={i}
                  role="menuitem"
                  href={item.href as string}
                  tabIndex={0}
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                  className={cn(
                    'flex w-full items-center px-3 py-1.5 text-left text-xs',
                    'text-foreground/80 hover:bg-muted hover:text-foreground',
                    'focus-visible:bg-muted focus-visible:text-foreground outline-none',
                    'transition-colors cursor-pointer',
                  )}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={i}
                role="menuitem"
                type="button"
                tabIndex={0}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={cn(
                  'flex w-full items-center px-3 py-1.5 text-left text-xs',
                  'text-foreground/80 hover:bg-muted hover:text-foreground',
                  'focus-visible:bg-muted focus-visible:text-foreground outline-none',
                  'transition-colors cursor-pointer',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb (root) — data-driven convenience API
// ---------------------------------------------------------------------------

export type BreadcrumbProps = {
  items?: BreadcrumbItemDef[];
  /** Maximum number of breadcrumb slots to display (including the ellipsis). */
  maxItems?: number;
  separator?: React.ReactNode;
  showIcons?: boolean;
  mobileMode?: 'collapse' | 'scroll' | 'back';
  loading?: boolean;
  skeletonCount?: number;
  size?: BreadcrumbSize;
  maxLabelWidth?: string;
  renderItem?: (item: BreadcrumbItemDef, index: number) => React.ReactNode;
  className?: string;
  'aria-label'?: string;
};

function Breadcrumb({
  items = [],
  maxItems = 0,
  separator = <ChevronRight aria-hidden="true" />,
  showIcons = true,
  mobileMode = 'collapse',
  loading = false,
  skeletonCount = 3,
  size = 'md',
  maxLabelWidth,
  renderItem,
  className,
  'aria-label': ariaLabel = 'Breadcrumb',
}: BreadcrumbProps) {
  const isMobileBack = mobileMode === 'back';
  const isMobileScroll = mobileMode === 'scroll';

  const contextValue = React.useMemo<BreadcrumbContextValue>(
    () => ({ size, separator, showIcons }),
    [size, separator, showIcons],
  );

  if (loading) {
    return (
      <nav aria-label={ariaLabel} className={cn('min-w-0', className)}>
        <BreadcrumbSkeleton count={skeletonCount} />
      </nav>
    );
  }

  if (items.length === 0) return null;

  const mobileBackParent = items.length >= 2 ? items[items.length - 2] : null;

  // Overflow / collapse
  let visibleItems: BreadcrumbItemDef[] = items;
  let hiddenItems: HiddenItem[] = [];
  const shouldCollapse = maxItems > 0 && items.length > maxItems;

  if (shouldCollapse) {
    const endKeep = Math.max(1, maxItems - 2);
    const startItems = items.slice(0, 1);
    const endItems = items.slice(items.length - endKeep);
    hiddenItems = items.slice(1, items.length - endKeep).map((it) => {
      const h: HiddenItem = { label: it.label };
      if (it.href !== undefined) h.href = it.href;
      if (it.onClick !== undefined) h.onClick = it.onClick;
      return h;
    });
    visibleItems = [...startItems, ...endItems];
  }

  function renderContent(item: BreadcrumbItemDef, index: number) {
    if (renderItem) return renderItem(item, index);

    const Icon = showIcons && item.icon ? item.icon : null;
    const iconEl = Icon ? <Icon className="shrink-0" aria-hidden="true" /> : null;

    if (item.current) {
      return (
        <BreadcrumbCurrent {...(maxLabelWidth !== undefined ? { maxLabelWidth } : {})}>
          {iconEl}
          {item.label}
        </BreadcrumbCurrent>
      );
    }

    return (
      <BreadcrumbLink
        {...(item.href !== undefined ? { href: item.href } : {})}
        {...(item.disabled !== undefined ? { disabled: item.disabled } : {})}
        {...(item.onClick !== undefined ? { onClick: item.onClick } : {})}
        {...(maxLabelWidth !== undefined ? { maxLabelWidth } : {})}
      >
        {iconEl}
        {item.label}
      </BreadcrumbLink>
    );
  }

  function buildList(forItems: BreadcrumbItemDef[]) {
    const result: React.ReactNode[] = [];
    forItems.forEach((item, idx) => {
      if (shouldCollapse && idx === 1) {
        result.push(
          <BreadcrumbItem key="ellipsis-sep">
            <BreadcrumbSeparator />
          </BreadcrumbItem>,
          <BreadcrumbItem key="ellipsis">
            <BreadcrumbEllipsis hiddenItems={hiddenItems} />
          </BreadcrumbItem>,
        );
      }

      result.push(
        <BreadcrumbItem key={`${item.label}-${idx}`}>
          {idx > 0 && <BreadcrumbSeparator />}
          {renderContent(item, idx)}
        </BreadcrumbItem>,
      );
    });
    return result;
  }

  return (
    <BreadcrumbContext.Provider value={contextValue}>
      <nav
        data-slot="breadcrumb"
        aria-label={ariaLabel}
        className={cn('min-w-0', className)}
      >
        {isMobileBack && mobileBackParent && (
          <div className="flex items-center md:hidden">
            <BreadcrumbLink
              {...(mobileBackParent.href !== undefined ? { href: mobileBackParent.href } : {})}
              {...(mobileBackParent.onClick !== undefined ? { onClick: mobileBackParent.onClick } : {})}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight
                className="size-3 shrink-0 rotate-180 rtl:rotate-0"
                aria-hidden="true"
              />
              {mobileBackParent.label}
            </BreadcrumbLink>
          </div>
        )}

        <BreadcrumbList
          className={cn(
            isMobileBack && mobileBackParent && 'hidden md:flex',
            isMobileScroll && 'flex-nowrap overflow-x-auto scrollbar-none',
          )}
        >
          {buildList(visibleItems)}
        </BreadcrumbList>
      </nav>
    </BreadcrumbContext.Provider>
  );
}

Breadcrumb.List = BreadcrumbList;
Breadcrumb.Item = BreadcrumbItem;
Breadcrumb.Link = BreadcrumbLink;
Breadcrumb.Current = BreadcrumbCurrent;
Breadcrumb.Separator = BreadcrumbSeparator;
Breadcrumb.Ellipsis = BreadcrumbEllipsis;
Breadcrumb.Skeleton = BreadcrumbSkeleton;

export { Breadcrumb };